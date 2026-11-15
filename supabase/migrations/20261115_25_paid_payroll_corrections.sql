-- KOGAKURE: privileged amendments / removals of already-paid payroll records.
-- Keep durable independent audit rows when a paid payroll or its ledger expense
-- is corrected or deleted. The actual FFXIV Gil transfer is not reversed.
create table if not exists public.payroll_correction_audit(
 id uuid primary key default pg_catalog.gen_random_uuid(),
 pay_date date not null,
 period_mode text not null check(period_mode in ('day','week','month')),
 employee_id uuid not null,
 employee_name text not null,
 action text not null check(action in ('edit','delete')),
 previous_gil bigint not null,
 updated_gil bigint,
 previous_paid_at timestamptz,
 ledger_date date,
 ledger_reference text not null default '',
 reason text not null check(char_length(btrim(reason)) between 3 and 240),
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists payroll_correction_audit_period_idx
 on public.payroll_correction_audit(pay_date,period_mode,created_at desc);
alter table public.payroll_correction_audit enable row level security;
revoke all on table public.payroll_correction_audit from public,anon,authenticated;
grant select on table public.payroll_correction_audit to authenticated;
drop policy if exists "accounting staff can view paid payroll corrections" on public.payroll_correction_audit;
create policy "accounting staff can view paid payroll corrections"
 on public.payroll_correction_audit for select to authenticated
 using ((select public.has_backoffice_permission('accounting.manage')));

create or replace function private.manage_paid_payroll(
 p_mode text,p_anchor date,p_employee_id uuid,p_action text,
 p_new_amount bigint,p_reason text
)
returns bigint language plpgsql security definer set search_path=''
as $function$
declare
 v_start date;v_end date;v_pay record;v_ledger record;v_ledger_id uuid;
 v_reason text;v_old_reference text;v_old_date date;
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有修改或刪除已發薪紀錄的權限' using errcode='42501';
 end if;
 if p_employee_id is null or p_action not in ('edit','delete') or p_action is null then
  raise exception '無效的已發薪管理操作' using errcode='22023';
 end if;
 v_reason:=btrim(coalesce(p_reason,''));
 if char_length(v_reason)<3 or char_length(v_reason)>240 then
  raise exception '請填寫 3 至 240 字的調整原因' using errcode='22023';
 end if;
 select w.start_date,w.end_date into v_start,v_end
 from private.payroll_period_range(p_mode,p_anchor) w;

 -- Same global lock as period creation/reset to avoid overlapping state races.
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kogakure-payroll-periods-exclusive',0)
 );
 select p.employee_name,p.amount_gil,p.paid_at,p.accounting_entry_id
 into v_pay
 from public.payroll_allocations p
 where p.pay_date=v_start and p.period_mode=p_mode and p.period_end=v_end
  and p.employee_id=p_employee_id
 for update;
 if not found then
  raise exception '找不到此期間的已發薪資料，可能已被其他管理員刪除' using errcode='P0002';
 end if;
 if v_pay.paid_at is null then
  raise exception '此筆尚未發薪，請使用未發薪的重置或重算功能'
   using errcode='22023';
 end if;

 v_ledger_id:=v_pay.accounting_entry_id;
 v_old_reference:='';
 v_old_date:=null;
 if v_ledger_id is not null then
  select a.id,a.kind,a.category,a.amount_gil,a.entry_date,a.reference into v_ledger
  from public.accounting_entries a where a.id=v_ledger_id for update;
  if not found then
   raise exception '發薪帳務紀錄已遺失，操作取消，請通知管理員'
    using errcode='23503';
  end if;
  if v_ledger.kind<>'expense' or v_ledger.category<>'員工薪酬'
   or v_ledger.amount_gil<>v_pay.amount_gil
   or v_ledger.reference not like 'PAYROLL:%' then
   raise exception '發薪與帳務金額不一致，請先檢查帳務'
    using errcode='23514';
  end if;
  v_old_reference:=v_ledger.reference;
  v_old_date:=v_ledger.entry_date;
 end if;

 if p_action='edit' then
  if p_new_amount is null or p_new_amount<0 or p_new_amount>1000000000 then
   raise exception '已發薪調整金額須為 0 至 1,000,000,000 Gil'
    using errcode='22023';
  end if;
  if p_new_amount=v_pay.amount_gil then
   raise exception '金額尚未改變，請輸入要調整的金額' using errcode='22023';
  end if;
  -- Detach the protected ledger row within this atomic privileged transaction.
  -- This is the only route for changing a paid payroll expense in the application.
  update public.payroll_allocations set accounting_entry_id=null
   where pay_date=v_start and period_mode=p_mode and employee_id=p_employee_id;

  if p_new_amount=0 then
   if v_ledger_id is not null then
    delete from public.accounting_entries where id=v_ledger_id;
    v_ledger_id:=null;
   end if;
  elsif v_ledger_id is not null then
   update public.accounting_entries set amount_gil=p_new_amount
    where id=v_ledger_id;
  else
   insert into public.accounting_entries(
    entry_date,kind,category,amount_gil,description,reference,created_by
   )values(
    (pg_catalog.now() at time zone 'Asia/Taipei')::date,
    'expense','員工薪酬',p_new_amount,
    '補登已發薪校正：'||v_pay.employee_name,
    'PAYROLL:'||p_mode||':'||v_start::text||':'||p_employee_id::text,
    (select auth.uid())
   ) returning id into v_ledger_id;
  end if;
  update public.payroll_allocations
   set amount_gil=p_new_amount,accounting_entry_id=v_ledger_id
   where pay_date=v_start and period_mode=p_mode and employee_id=p_employee_id;
 else
  -- Delete the selected payroll allocation and its linked expense only.
  -- Audit persists independently; no real Gil is returned or recovered.
  update public.payroll_allocations set accounting_entry_id=null
   where pay_date=v_start and period_mode=p_mode and employee_id=p_employee_id;
  if v_ledger_id is not null then
   delete from public.accounting_entries where id=v_ledger_id;
  end if;
  delete from public.payroll_allocations
   where pay_date=v_start and period_mode=p_mode and employee_id=p_employee_id;
 end if;

 insert into public.payroll_correction_audit(
  pay_date,period_mode,employee_id,employee_name,action,
  previous_gil,updated_gil,previous_paid_at,ledger_date,ledger_reference,
  reason,actor_id
 )values(
  v_start,p_mode,p_employee_id,v_pay.employee_name,p_action,
  v_pay.amount_gil,case when p_action='edit' then p_new_amount else null end,
  v_pay.paid_at,v_old_date,v_old_reference,v_reason,(select auth.uid())
 );
 return case when p_action='edit' then p_new_amount else 0 end;
end
$function$;
revoke all on function private.manage_paid_payroll(text,date,uuid,text,bigint,text)
 from public,anon;
grant execute on function private.manage_paid_payroll(text,date,uuid,text,bigint,text)
 to authenticated;

create or replace function public.manage_paid_payroll(
 p_mode text,p_anchor date,p_employee_id uuid,p_action text,
 p_new_amount bigint,p_reason text
)
returns bigint language sql security invoker set search_path=''
as $function$
 select private.manage_paid_payroll(
  p_mode,p_anchor,p_employee_id,p_action,p_new_amount,p_reason
 );
$function$;
revoke all on function public.manage_paid_payroll(text,date,uuid,text,bigint,text)
 from public,anon;
grant execute on function public.manage_paid_payroll(text,date,uuid,text,bigint,text)
 to authenticated;
