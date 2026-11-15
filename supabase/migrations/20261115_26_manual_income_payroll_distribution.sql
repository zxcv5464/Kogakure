-- KOGAKURE: explicitly classify manually entered income for operating revenue
-- and three payroll strategies. The category name never decides salary inclusion.
alter table public.accounting_entries
 add column if not exists is_additional_revenue boolean not null default false,
 add column if not exists payroll_distribution text not null default 'none',
 add column if not exists payroll_recipient_id uuid;

-- Previously recorded manual income is additional turnover unless an accountant
-- explicitly marks it as an already-counted completed-order receipt.
-- Existing expenses and payment audit entries never become salary income.
update public.accounting_entries
 set is_additional_revenue=true,payroll_distribution='shared'
 where kind='income';
update public.accounting_entries
 set is_additional_revenue=false,payroll_distribution='none',payroll_recipient_id=null
 where kind='expense';

alter table public.accounting_entries
 add constraint accounting_manual_income_strategy_ck
 check(
  (kind='expense' and is_additional_revenue=false and
   payroll_distribution='none' and payroll_recipient_id is null)
  or
  (kind='income' and (
   (is_additional_revenue=false and payroll_distribution='none' and payroll_recipient_id is null)
   or
   (is_additional_revenue=true and (
    (payroll_distribution in ('none','shared') and payroll_recipient_id is null)
    or (payroll_distribution='individual' and payroll_recipient_id is not null)
   ))
  ))
 );

-- Keep field-level permissions narrow. No direct updates to payment audit fields.
grant insert(is_additional_revenue,payroll_distribution,payroll_recipient_id),
 update(is_additional_revenue,payroll_distribution,payroll_recipient_id)
 on public.accounting_entries to authenticated;

comment on column public.accounting_entries.is_additional_revenue is
 'True: independent turnover; false: already included in completed tea order total.';
comment on column public.accounting_entries.payroll_distribution is
 'none excludes from salary pool, shared adds to equal pool, individual adds only to chosen staff.';
comment on column public.accounting_entries.payroll_recipient_id is
 'Salary recipient for individually allocated manual income.';

-- Selectable payees are active employee accounts and known managers.
create or replace function private.accounting_payroll_payees()
returns table(employee_id uuid,employee_name text,member_type text)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有帳務管理權限' using errcode='42501';
 end if;
 return query
 with candidates as (
  select e.user_id as id,coalesce(nullif(e.shift_display_name,''),e.display_name) as name,
   'employee'::text as kind,1 as priority
  from public.employee_accounts e where e.active=true
  union all
  select o.owner_id,o.display_name,'owner'::text,0
  from public.shift_owner_attendance o
 ), unique_people as (
  select distinct on(id) id,name,kind from candidates
  order by id,priority,name
 )
 select p.id,p.name,p.kind from unique_people p order by p.name,p.id;
end
$function$;
revoke all on function private.accounting_payroll_payees() from public,anon;
grant execute on function private.accounting_payroll_payees() to authenticated;

create or replace function public.get_accounting_payroll_payees()
returns table(employee_id uuid,employee_name text,member_type text)
language sql stable security invoker set search_path=''
as $function$
 select * from private.accounting_payroll_payees();
$function$;
revoke all on function public.get_accounting_payroll_payees() from public,anon;
grant execute on function public.get_accounting_payroll_payees() to authenticated;

-- Same payee population must drive both preview and actual frozen payroll.
create or replace function private.accounting_payroll_period_roster(p_mode text,p_anchor date)
returns table(employee_id uuid,employee_name text,member_type text,sort_index integer)
language plpgsql stable security definer set search_path=''
as $function$
declare
 v_start date;v_end date;
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有帳務檢視權限' using errcode='42501';
 end if;
 select w.start_date,w.end_date into v_start,v_end
 from private.payroll_period_range(p_mode,p_anchor) w;
 return query
 with candidate as (
  select s.employee_id,s.employee_name,'employee'::text as member_type,
   s.shift_date,1 as priority
  from public.shift_attendance s where s.shift_date>=v_start and s.shift_date<v_end
  union all
  select o.owner_id,o.display_name,'owner'::text,o.shift_date,0
  from public.shift_owner_attendance o where o.shift_date>=v_start and o.shift_date<v_end
  union all
  -- Individually assigned payees remain eligible even without a shift
  -- in this exact period, but must be active staff or known owners.
  select e.user_id,coalesce(nullif(e.shift_display_name,''),e.display_name),
   'employee'::text,a.entry_date,2
  from public.accounting_entries a
  join public.employee_accounts e on e.user_id=a.payroll_recipient_id and e.active=true
  where a.entry_date>=v_start and a.entry_date<v_end and a.kind='income'
   and a.is_additional_revenue=true and a.payroll_distribution='individual'
  union all
  select o.owner_id,o.display_name,'owner'::text,a.entry_date,0
  from public.accounting_entries a
  join (
   select distinct on (owner_id) owner_id,display_name
   from public.shift_owner_attendance order by owner_id,shift_date desc
  ) o on o.owner_id=a.payroll_recipient_id
  where a.entry_date>=v_start and a.entry_date<v_end and a.kind='income'
   and a.is_additional_revenue=true and a.payroll_distribution='individual'
 ), distinct_accounts as (
  select distinct on (c.employee_id)
   c.employee_id,c.employee_name,c.member_type
  from candidate c
  order by c.employee_id,c.priority,c.shift_date desc,c.employee_name
 )
 select d.employee_id,d.employee_name,d.member_type,
  row_number() over(order by d.employee_name,d.employee_id)::integer
 from distinct_accounts d
 order by d.employee_name,d.employee_id;
end
$function$;

revoke all on function private.accounting_payroll_period_roster(text,date) from public,anon;
grant execute on function private.accounting_payroll_period_roster(text,date) to authenticated;

-- Preserve existing role guards, period locks and immutable paid snapshots.
create or replace function private.create_period_payroll(p_mode text,p_anchor date)
returns integer language plpgsql security definer set search_path=''
as $function$
declare
 v_start date;v_end date;v_count integer;v_sales bigint;
 v_completed bigint;v_shared_income bigint;v_personal_income bigint;v_created integer;
 v_missing integer;
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有建立薪資清單的權限' using errcode='42501';
 end if;
 select w.start_date,w.end_date into v_start,v_end
 from private.payroll_period_range(p_mode,p_anchor) w;

 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kogakure-payroll-periods-exclusive',0)
 );
 if exists(select 1 from public.payroll_allocations p
  where p.pay_date < v_end and p.period_end > v_start) then
  raise exception '所選期間已有重疊的分薪紀錄，為避免重複發薪，請查看已建立清單'
   using errcode='23505';
 end if;
 select count(*)::integer into v_count
 from private.accounting_payroll_period_roster(p_mode,p_anchor);
 if v_count=0 then
  raise exception '該期間沒有員工或管理員出勤，無法建立分薪清單'
   using errcode='22023';
 end if;
 if v_count>300 then
  raise exception '期間出勤帳號人數超出上限' using errcode='22023';
 end if;
 select coalesce(sum(o.total_gil),0)::bigint into v_completed
 from public.tea_orders o
 where o.status='completed'
  and o.created_at >= (v_start::timestamp at time zone 'Asia/Taipei')
  and o.created_at < (v_end::timestamp at time zone 'Asia/Taipei');

 select coalesce(sum(a.amount_gil) filter(where a.payroll_distribution='shared'),0)::bigint,
        coalesce(sum(a.amount_gil) filter(where a.payroll_distribution='individual'),0)::bigint
 into v_shared_income,v_personal_income
 from public.accounting_entries a
 where a.entry_date>=v_start and a.entry_date<v_end
  and a.kind='income' and a.is_additional_revenue=true;

 select count(*)::integer into v_missing
 from public.accounting_entries a
 where a.entry_date>=v_start and a.entry_date<v_end
  and a.kind='income' and a.is_additional_revenue=true
  and a.payroll_distribution='individual'
  and not exists (
   select 1 from private.accounting_payroll_period_roster(p_mode,p_anchor) r
   where r.employee_id=a.payroll_recipient_id
  );
 if v_missing>0 then
  raise exception '個人分薪指定的員工未列入此期間出勤或分薪名單，請修正指定對象'
   using errcode='22023';
 end if;

 v_sales:=v_completed+v_shared_income+v_personal_income;
 if v_sales<=0 or v_sales>1000000000000 then
  raise exception '該期間沒有可分配的正數營業額或金額超過上限'
   using errcode='22023';
 end if;

 with roster as (
  select r.employee_id,r.employee_name,r.member_type,r.sort_index as position
  from private.accounting_payroll_period_roster(p_mode,p_anchor) r
 )
 insert into public.payroll_allocations(
  pay_date,period_mode,period_end,employee_id,employee_name,member_type,
  revenue_gil,employee_count,amount_gil,created_by
 )
 select v_start,p_mode,v_end,r.employee_id,r.employee_name,r.member_type,
  v_sales,v_count,
  ((v_completed+v_shared_income)/v_count)
    +case when r.position<=((v_completed+v_shared_income)%v_count) then 1 else 0 end
    +coalesce((select sum(a.amount_gil)::bigint from public.accounting_entries a
      where a.entry_date>=v_start and a.entry_date<v_end
       and a.kind='income' and a.is_additional_revenue=true
       and a.payroll_distribution='individual'
       and a.payroll_recipient_id=r.employee_id),0),
  (select auth.uid())
 from roster r;
 get diagnostics v_created=row_count;
 if v_created<>v_count then
  raise exception '分薪人數不一致，交易已取消' using errcode='22023';
 end if;
 return v_created;
end
$function$;

revoke all on function private.create_period_payroll(text,date) from public,anon;
grant execute on function private.create_period_payroll(text,date) to authenticated;

create index if not exists accounting_extra_income_by_period_idx
 on public.accounting_entries(entry_date,payroll_distribution,payroll_recipient_id)
 where kind='income' and is_additional_revenue=true;
