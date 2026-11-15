-- KOGAKURE: one frozen payroll per non-overlapping Taipei calendar period.
-- Preserve historical daily allocations, confirmed payout receipts and role policies.
-- Only authenticated accountants may use the public wrappers; no customer data exposed.
alter table public.payroll_allocations
 add column if not exists period_mode text not null default 'day',
 add column if not exists period_end date;
update public.payroll_allocations
 set period_end=pay_date+1 where period_end is null;
alter table public.payroll_allocations
 alter column period_end set not null;
alter table public.payroll_allocations
 add constraint payroll_period_mode_check
 check(period_mode in ('day','week','month'));
alter table public.payroll_allocations
 add constraint payroll_period_range_check
 check(period_end>pay_date);
create index if not exists payroll_period_overlap_idx
 on public.payroll_allocations(pay_date,period_end);

create or replace function private.payroll_period_range(p_mode text,p_anchor date)
returns table(start_date date,end_date date)
language plpgsql immutable security invoker set search_path=''
as $function$
begin
 if p_anchor is null or p_anchor < date '2020-01-01' or p_anchor > date '2100-12-31' then
  raise exception '無效的分薪日期' using errcode='22023';
 end if;
 if p_mode='day' then
  start_date:=p_anchor;end_date:=p_anchor+1;
 elsif p_mode='week' then
  start_date:=p_anchor-(extract(isodow from p_anchor)::integer-1);
  end_date:=start_date+7;
 elsif p_mode='month' then
  start_date:=date_trunc('month',p_anchor::timestamp)::date;
  end_date:=(start_date::timestamp+interval '1 month')::date;
 else
  raise exception '分薪週期只能為單日、當週或當月' using errcode='22023';
 end if;
 if start_date<date '2020-01-01' or end_date>date '2101-01-01' then
  raise exception '分薪週期超出允許範圍' using errcode='22023';
 end if;
 return next;
end
$function$;
revoke all on function private.payroll_period_range(text,date) from public,anon;
grant execute on function private.payroll_period_range(text,date) to authenticated;

-- Distinct account IDs across staff and manager shifts; owner takes priority
-- when a person appears in both tables. Use identical ordering for UI and SQL.
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

create or replace function public.get_accounting_payroll_period_roster(p_mode text,p_anchor date)
returns table(employee_id uuid,employee_name text,member_type text,sort_index integer)
language sql stable security invoker set search_path=''
as $function$
 select * from private.accounting_payroll_period_roster(p_mode,p_anchor);
$function$;
revoke all on function public.get_accounting_payroll_period_roster(text,date) from public,anon;
grant execute on function public.get_accounting_payroll_period_roster(text,date) to authenticated;

-- A single advisory lock coordinates day/week/month creation, including the
-- existing daily endpoint, preventing concurrent or cross-period double pay.
create or replace function private.create_period_payroll(p_mode text,p_anchor date)
returns integer language plpgsql security definer set search_path=''
as $function$
declare
 v_start date;v_end date;v_count integer;v_sales bigint;
 v_completed bigint;v_other_income bigint;v_created integer;
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

 select coalesce(sum(a.amount_gil),0)::bigint into v_other_income
 from public.accounting_entries a
 where a.entry_date>=v_start and a.entry_date<v_end
  and a.kind='income' and a.category<>'茶宴收入';

 v_sales:=v_completed+v_other_income;
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
  (v_sales/v_count)+case when r.position<=(v_sales%v_count) then 1 else 0 end,
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

create or replace function public.create_period_payroll(p_mode text,p_anchor date)
returns integer language sql security invoker set search_path=''
as $function$
 select private.create_period_payroll(p_mode,p_anchor);
$function$;
revoke all on function public.create_period_payroll(text,date) from public,anon;
grant execute on function public.create_period_payroll(text,date) to authenticated;

-- Legacy day endpoint must acquire the same global lock and reject overlap.
create or replace function private.create_daily_payroll(p_day date)
returns integer language plpgsql security definer set search_path=''
as $function$
begin
 return private.create_period_payroll('day',p_day);
end
$function$;
revoke all on function private.create_daily_payroll(date) from public,anon;
grant execute on function private.create_daily_payroll(date) to authenticated;

-- Only a real in-game transfer is confirmed; note the actual payment date
-- in the ledger rather than the first day of a week or month.
create or replace function private.confirm_period_payroll_paid(
 p_mode text,p_anchor date,p_employee_id uuid
)
returns void language plpgsql security definer set search_path=''
as $function$
declare
 v_start date;v_end date;v_row record;v_expense_id uuid;
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有登錄發薪的權限' using errcode='42501';
 end if;
 if p_employee_id is null then
  raise exception '無效的出勤人員編號' using errcode='22023';
 end if;
 select w.start_date,w.end_date into v_start,v_end
 from private.payroll_period_range(p_mode,p_anchor) w;
 select p.employee_name,p.amount_gil,p.paid_at into v_row
 from public.payroll_allocations p
 where p.pay_date=v_start and p.period_mode=p_mode and p.employee_id=p_employee_id
 for update;
 if not found then
  raise exception '找不到此期間的出勤人員分薪紀錄' using errcode='P0002';
 end if;
 if v_row.paid_at is not null then
  raise exception '這筆薪資已記錄發放，不可重複登錄' using errcode='23505';
 end if;
 if v_row.amount_gil>0 then
  insert into public.accounting_entries(
   entry_date,kind,category,amount_gil,description,reference,created_by
  )values(
   (pg_catalog.now() at time zone 'Asia/Taipei')::date,
   'expense','員工薪酬',v_row.amount_gil,
   '分薪紀錄（'||p_mode||'：'||v_start::text||' 至 '||(v_end-1)::text||'）：'||v_row.employee_name,
   'PAYROLL:'||p_mode||':'||v_start::text||':'||p_employee_id::text,
   (select auth.uid())
  ) returning id into v_expense_id;
 end if;
 update public.payroll_allocations
 set paid_at=pg_catalog.now(),accounting_entry_id=v_expense_id
 where pay_date=v_start and period_mode=p_mode and employee_id=p_employee_id;
end
$function$;
revoke all on function private.confirm_period_payroll_paid(text,date,uuid) from public,anon;
grant execute on function private.confirm_period_payroll_paid(text,date,uuid) to authenticated;

create or replace function public.confirm_period_payroll_paid(p_mode text,p_anchor date,p_employee_id uuid)
returns void language sql security invoker set search_path=''
as $function$
 select private.confirm_period_payroll_paid(p_mode,p_anchor,p_employee_id);
$function$;
revoke all on function public.confirm_period_payroll_paid(text,date,uuid) from public,anon;
grant execute on function public.confirm_period_payroll_paid(text,date,uuid) to authenticated;

-- Keep the old interface restricted to daily payroll only.
create or replace function private.confirm_payroll_paid(p_day date,p_employee_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
begin
 perform private.confirm_period_payroll_paid('day',p_day,p_employee_id);
end
$function$;
revoke all on function private.confirm_payroll_paid(date,uuid) from public,anon;
grant execute on function private.confirm_payroll_paid(date,uuid) to authenticated;

comment on table public.payroll_allocations is
 'Immutable salary snapshots for mutually exclusive day/week/month periods. Members include scheduled employees and owners; actual Gil payment is separate and audited.';
