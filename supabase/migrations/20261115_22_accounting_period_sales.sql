-- KOGAKURE read-only completed-order gross for day/month/all finance dashboards.
-- No guest names, worlds, items or order IDs; the date is the Taipei business date.
create or replace function private.accounting_period_completed_tea_sales(p_start date,p_end date)
returns table(completed_orders bigint,total_gil bigint)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null
 or not (select public.has_backoffice_permission('accounting.manage')) then
  raise exception '沒有帳務檢視權限' using errcode='42501';
 end if;
 if (p_start is null) <> (p_end is null) then
  raise exception '日期範圍必須完整' using errcode='22023';
 end if;
 if p_start is not null and (
  p_start < date '2020-01-01' or p_end > date '2101-01-01' or p_end <= p_start
 ) then
  raise exception '帳務查詢日期範圍無效' using errcode='22023';
 end if;
 return query
 select count(*)::bigint,coalesce(sum(o.total_gil),0)::bigint
 from public.tea_orders o
 where o.status='completed'
  and (p_start is null or o.created_at >= (p_start::timestamp at time zone 'Asia/Taipei'))
  and (p_end is null or o.created_at < (p_end::timestamp at time zone 'Asia/Taipei'));
end
$function$;
revoke all on function private.accounting_period_completed_tea_sales(date,date) from public,anon;
grant execute on function private.accounting_period_completed_tea_sales(date,date) to authenticated;

create or replace function public.get_accounting_period_sales(p_start date,p_end date)
returns table(completed_orders bigint,total_gil bigint)
language sql stable security invoker set search_path=''
as $function$
 select * from private.accounting_period_completed_tea_sales(p_start,p_end);
$function$;
revoke all on function public.get_accounting_period_sales(date,date) from public,anon;
grant execute on function public.get_accounting_period_sales(date,date) to authenticated;

create index if not exists tea_orders_completed_sales_date_idx
 on public.tea_orders(created_at) where status='completed';
