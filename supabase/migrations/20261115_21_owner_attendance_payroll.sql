-- KOGAKURE: include separately registered owner/admin shifts in salary sharing.
-- One authenticated person receives one share even if listed in both rosters.
-- Previously frozen payroll remains unchanged; payment is always recorded manually.
alter table public.payroll_allocations
 add column if not exists member_type text not null default 'employee'
 check(member_type in ('employee','owner'));

-- Return the exact same deduplicated and ordered roster for preview and
-- salary creation. Do not expose private schedules for closed days to guests.
create or replace function private.accounting_payroll_roster(p_day date)
returns table(employee_id uuid,employee_name text,member_type text,sort_index integer)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有帳務檢視權限' using errcode='42501';
 end if;
 if p_day is null or p_day < date '2020-01-01' or p_day > date '2100-12-31' then
  raise exception '營業日期無效' using errcode='22023';
 end if;
 return query
 with candidates as (
  select s.employee_id,s.employee_name,'employee'::text as member_type,1 as priority
  from public.shift_attendance s where s.shift_date=p_day
  union all
  select o.owner_id,o.display_name,'owner'::text,0
  from public.shift_owner_attendance o where o.shift_date=p_day
 ), unique_people as (
  select distinct on (c.employee_id)
   c.employee_id,c.employee_name,c.member_type
  from candidates c
  order by c.employee_id,c.priority,c.employee_name
 )
 select p.employee_id,p.employee_name,p.member_type,
  row_number() over(order by p.employee_name,p.employee_id)::integer
 from unique_people p
 order by p.employee_name,p.employee_id;
end
$function$;
revoke all on function private.accounting_payroll_roster(date) from public,anon;
grant execute on function private.accounting_payroll_roster(date) to authenticated;

create or replace function public.get_accounting_daily_payroll_roster(p_day date)
returns table(employee_id uuid,employee_name text,member_type text,sort_index integer)
language sql stable security invoker set search_path=''
as $function$
 select * from private.accounting_payroll_roster(p_day);
$function$;
revoke all on function public.get_accounting_daily_payroll_roster(date) from public,anon;
grant execute on function public.get_accounting_daily_payroll_roster(date) to authenticated;

-- Preserve the existing lock, auth gate, sales calculation and immutable
-- salary snapshot. Replace only the roster source/identity classification.
create or replace function private.create_daily_payroll(p_day date)
returns integer language plpgsql security definer set search_path=''
as $function$
declare
 v_count integer;
 v_completed bigint;
 v_other_income bigint;
 v_sales bigint;
 v_created integer;
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有建立薪資清單的權限' using errcode='42501';
 end if;
 if p_day is null or p_day < date '2020-01-01' or p_day > date '2100-12-31' then
  raise exception '分薪日期無效' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kogakure-daily-payroll:'||p_day::text,0)
 );
 if exists(select 1 from public.payroll_allocations p where p.pay_date=p_day) then
  raise exception '此日期已建立分薪清單，請使用既有紀錄' using errcode='23505';
 end if;
 select count(*)::integer into v_count
 from private.accounting_payroll_roster(p_day);
 if v_count=0 then
  raise exception '此日期尚無員工或管理員出勤，無法分薪' using errcode='22023';
 end if;
 if v_count>300 then raise exception '當日出勤人數異常' using errcode='22023'; end if;

 select coalesce(sum(o.total_gil),0)::bigint into v_completed
 from public.tea_orders o
 where o.status='completed'
  and o.created_at >= (p_day::timestamp at time zone 'Asia/Taipei')
  and o.created_at < ((p_day+1)::timestamp at time zone 'Asia/Taipei');

 -- Exclude manually recorded tea income to avoid counting tea sales twice.
 select coalesce(sum(a.amount_gil),0)::bigint into v_other_income
 from public.accounting_entries a
 where a.entry_date=p_day and a.kind='income'
  and a.category<>'茶宴收入';

 v_sales:=v_completed+v_other_income;
 if v_sales<=0 or v_sales>1000000000000 then
  raise exception '當日營業額無法分配（需為正數且不超過上限）'
  using errcode='22023';
 end if;

 with roster as (
  select r.employee_id,r.employee_name,r.member_type,r.sort_index as position
  from private.accounting_payroll_roster(p_day) r
 )
 insert into public.payroll_allocations(
  pay_date,employee_id,employee_name,member_type,revenue_gil,employee_count,
  amount_gil,created_by
 )
 select p_day,r.employee_id,r.employee_name,r.member_type,v_sales,v_count,
  (v_sales/v_count)+case when r.position <=(v_sales%v_count) then 1 else 0 end,
  (select auth.uid())
 from roster r;
 get diagnostics v_created=row_count;
 if v_created<>v_count then
  raise exception '薪資清單產生筆數不一致，交易已取消' using errcode='22023';
 end if;
 return v_created;
end
$function$;

revoke all on function private.create_daily_payroll(date) from public,anon;
grant execute on function private.create_daily_payroll(date) to authenticated;

comment on table public.payroll_allocations is
 'Frozen equal-share salaries for each distinct scheduled employee or owner/admin, based on daily completed tea sales plus other income. Gil payment recorded only after actual transfer.';
