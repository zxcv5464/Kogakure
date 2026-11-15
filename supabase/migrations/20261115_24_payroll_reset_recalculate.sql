-- KOGAKURE: reset or atomically recalculate an unpaid day/week/month salary snapshot.
-- Paid salary receipts and previously-confirmed game payments are immutable.
-- One advisory lock coordinates with all period payroll creations.
create or replace function private.manage_period_payroll_snapshot(
 p_mode text,p_anchor date,p_action text
)
returns integer language plpgsql security definer set search_path=''
as $function$
declare
 v_start date;v_end date;v_total integer;v_protected integer;v_deleted integer;
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有重置或重算分薪清單的權限' using errcode='42501';
 end if;
 if p_action not in ('reset','recalculate') or p_action is null then
  raise exception '無效的分薪管理操作' using errcode='22023';
 end if;
 select w.start_date,w.end_date into v_start,v_end
 from private.payroll_period_range(p_mode,p_anchor) w;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kogakure-payroll-periods-exclusive',0)
 );
 select count(*)::integer,
  count(*) filter (where p.paid_at is not null or p.accounting_entry_id is not null)::integer
 into v_total,v_protected
 from public.payroll_allocations p
 where p.pay_date=v_start and p.period_mode=p_mode and p.period_end=v_end;

 if v_total=0 then
  raise exception '此期間沒有已建立的分薪清單' using errcode='P0002';
 end if;
 if v_protected>0 then
  raise exception '此分薪清單已有薪水確認發放，不能重置或重算，以保護已發薪帳務'
   using errcode='23514';
 end if;

 -- Delete only still-unpaid allocations. A concurrent payment will change
 -- the row under its own row lock; a mismatched count aborts the transaction.
 delete from public.payroll_allocations p
 where p.pay_date=v_start and p.period_mode=p_mode and p.period_end=v_end
  and p.paid_at is null and p.accounting_entry_id is null;
 get diagnostics v_deleted=row_count;
 if v_deleted<>v_total then
  raise exception '分薪資料已被其他管理員更新，請重新載入後重試'
   using errcode='40001';
 end if;

 if p_action='recalculate' then
  -- The same transaction recreates all shares from the latest roster and
  -- completed orders. On any validation error PostgreSQL restores the old list.
  return private.create_period_payroll(p_mode,p_anchor);
 end if;
 return v_deleted;
end
$function$;
revoke all on function private.manage_period_payroll_snapshot(text,date,text)
 from public,anon;
grant execute on function private.manage_period_payroll_snapshot(text,date,text)
 to authenticated;

create or replace function public.reset_period_payroll(p_mode text,p_anchor date)
returns integer language sql security invoker set search_path=''
as $function$
 select private.manage_period_payroll_snapshot(p_mode,p_anchor,'reset');
$function$;
revoke all on function public.reset_period_payroll(text,date) from public,anon;
grant execute on function public.reset_period_payroll(text,date) to authenticated;

create or replace function public.recalculate_period_payroll(p_mode text,p_anchor date)
returns integer language sql security invoker set search_path=''
as $function$
 select private.manage_period_payroll_snapshot(p_mode,p_anchor,'recalculate');
$function$;
revoke all on function public.recalculate_period_payroll(text,date) from public,anon;
grant execute on function public.recalculate_period_payroll(text,date) to authenticated;
