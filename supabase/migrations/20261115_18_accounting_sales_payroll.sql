-- KOGAKURE: ledger-only reporting on completed tea orders, plus a frozen
-- equal-share payroll for employees scheduled on a chosen Taipei business date.
-- Completion is NOT a receipt. No order is auto-marked as paid, no Gil is sent.

create table if not exists public.payroll_allocations(
 pay_date date not null,
 employee_id uuid not null,
 employee_name text not null check(char_length(btrim(employee_name)) between 1 and 100),
 revenue_gil bigint not null check(revenue_gil between 0 and 1000000000000),
 employee_count integer not null check(employee_count between 1 and 300),
 amount_gil bigint not null check(amount_gil between 0 and 1000000000000),
 paid_at timestamptz,
 accounting_entry_id uuid unique references public.accounting_entries(id) on delete restrict,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(pay_date,employee_id),
 check ((paid_at is null and accounting_entry_id is null) or paid_at is not null)
);
create index if not exists payroll_allocations_day on public.payroll_allocations(pay_date);
alter table public.payroll_allocations enable row level security;
revoke all on public.payroll_allocations from public,anon,authenticated;
grant select on public.payroll_allocations to authenticated;

drop policy if exists "accounting staff can read payroll" on public.payroll_allocations;
create policy "accounting staff can read payroll" on public.payroll_allocations
 for select to authenticated
 using ((select public.has_backoffice_permission('accounting.manage')));

-- The RPC reports totals only. The delegated accountant does NOT receive
-- access to tea_orders, guest names, worlds or itemized orders.
create or replace function private.accounting_completed_tea_sales(p_day date)
returns table(completed_orders bigint,total_gil bigint)
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
 select count(*)::bigint,coalesce(sum(o.total_gil),0)::bigint
 from public.tea_orders o
 where o.status='completed'
  and o.created_at >= (p_day::timestamp at time zone 'Asia/Taipei')
  and o.created_at < ((p_day+1)::timestamp at time zone 'Asia/Taipei');
end
$function$;
revoke all on function private.accounting_completed_tea_sales(date) from public,anon;
grant execute on function private.accounting_completed_tea_sales(date) to authenticated;

create or replace function public.get_accounting_daily_sales(p_day date)
returns table(completed_orders bigint,total_gil bigint)
language sql stable security invoker set search_path=''
as $function$
 select * from private.accounting_completed_tea_sales(p_day);
$function$;
revoke all on function public.get_accounting_daily_sales(date) from public,anon;
grant execute on function public.get_accounting_daily_sales(date) to authenticated;

-- Freeze payroll once for each business date. This snapshot makes the equal
-- shares stable if somebody later edits or deletes orders or changes rosters.
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
 from public.shift_attendance s where s.shift_date=p_day;
 if v_count=0 then
  raise exception '此日期尚無員工排班，無法分薪' using errcode='22023';
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
  select s.employee_id,s.employee_name,
   row_number() over(order by s.employee_name,s.employee_id) as position
  from public.shift_attendance s where s.shift_date=p_day
 )
 insert into public.payroll_allocations(
  pay_date,employee_id,employee_name,revenue_gil,employee_count,
  amount_gil,created_by
 )
 select p_day,r.employee_id,r.employee_name,v_sales,v_count,
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

create or replace function public.create_daily_payroll(p_day date)
returns integer language sql security invoker set search_path=''
as $function$
 select private.create_daily_payroll(p_day);
$function$;
revoke all on function public.create_daily_payroll(date) from public,anon;
grant execute on function public.create_daily_payroll(date) to authenticated;

-- Mark a single salary as paid. This is a record of manual in-game Gil
-- delivery, NOT an automatic payment. The expense and paid flag commit
-- atomically, with a locked row protecting against double-clicks.
create or replace function private.confirm_payroll_paid(p_day date,p_employee_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare
 v_row record;
 v_expense_id uuid;
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有登錄薪資發放的權限' using errcode='42501';
 end if;
 if p_day is null or p_employee_id is null then
  raise exception '分薪日期或員工資料錯誤' using errcode='22023';
 end if;
 select p.employee_name,p.amount_gil,p.paid_at into v_row
 from public.payroll_allocations p
 where p.pay_date=p_day and p.employee_id=p_employee_id
 for update;
 if not found then raise exception '找不到該員工的薪資清單' using errcode='P0002'; end if;
 if v_row.paid_at is not null then
  raise exception '這筆薪資已標記發放，請勿重複操作' using errcode='23505';
 end if;
 if v_row.amount_gil>0 then
  insert into public.accounting_entries(
   entry_date,kind,category,amount_gil,description,reference,created_by
  )values(
   p_day,'expense','員工薪酬',v_row.amount_gil,
   '分薪紀錄：'||v_row.employee_name,
   'PAYROLL:'||p_day::text||':'||p_employee_id::text,
   (select auth.uid())
  )returning id into v_expense_id;
 end if;
 update public.payroll_allocations
 set paid_at=pg_catalog.now(),accounting_entry_id=v_expense_id
 where pay_date=p_day and employee_id=p_employee_id;
end
$function$;
revoke all on function private.confirm_payroll_paid(date,uuid) from public,anon;
grant execute on function private.confirm_payroll_paid(date,uuid) to authenticated;

create or replace function public.confirm_payroll_paid(p_day date,p_employee_id uuid)
returns void language sql security invoker set search_path=''
as $function$
 select private.confirm_payroll_paid(p_day,p_employee_id);
$function$;
revoke all on function public.confirm_payroll_paid(date,uuid) from public,anon;
grant execute on function public.confirm_payroll_paid(date,uuid) to authenticated;

-- The dedicated expense rows are audit evidence for confirmed payouts.
-- Do not let general accounting CRUD alter/delete them and desynchronize pay.
create or replace function private.protect_payroll_expense()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if exists(select 1 from public.payroll_allocations p
  where p.accounting_entry_id=old.id) then
  raise exception '此筆為已發薪紀錄，不能直接編輯或刪除'
   using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end
$function$;
drop trigger if exists protect_payroll_expense on public.accounting_entries;
create trigger protect_payroll_expense before update or delete
 on public.accounting_entries for each row
 execute function private.protect_payroll_expense();

comment on table public.payroll_allocations is
 'Snapshot of equal share salary from completed tea sales plus non-tea manual revenue, for scheduled employees; mark paid only after actual in-game Gil handoff.';

-- Existing guest orders are untouched; previously completed orders are
-- calculated live from status and Taiwan-local creation date, not copied.
