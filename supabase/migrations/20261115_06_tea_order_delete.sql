-- KOGAKURE: operator-only permanent deletion of a tea order and its lines.
-- This preserves the existing independent orders.manage permission boundary.
-- Only a constrained RPC can delete orders; no table DELETE grants are added.

create or replace function private.delete_tea_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path=''
as $function$
declare
 v_deleted uuid;
begin
 if (select auth.uid()) is null or not (
   exists(select 1 from public.admin_users a
     where a.user_id=(select auth.uid()))
   or exists(select 1 from public.employee_accounts e
     where e.user_id=(select auth.uid()) and e.active=true
       and 'orders.manage'=any(e.permissions))
 ) then
   raise exception '沒有刪除訂單的權限' using errcode='42501';
 end if;
 if p_order_id is null then
   raise exception '訂單編號不正確' using errcode='22023';
 end if;

 -- The FK on tea_order_items.order_id is ON DELETE CASCADE.
 -- Remove one order and its lines atomically, regardless of order status.
 delete from public.tea_orders
 where id=p_order_id
 returning id into v_deleted;
 if v_deleted is null then
   raise exception '找不到這筆訂單，可能已被其他館員刪除' using errcode='P0002';
 end if;
end
$function$;

revoke all on function private.delete_tea_order(uuid) from public,anon;
grant execute on function private.delete_tea_order(uuid) to authenticated;

create or replace function public.delete_tea_order(p_order_id uuid)
returns void language sql security invoker set search_path=''
as $function$
 select private.delete_tea_order(p_order_id);
$function$;
revoke all on function public.delete_tea_order(uuid) from public,anon;
grant execute on function public.delete_tea_order(uuid) to authenticated;

-- No anonymous/private order data access or direct table DELETE is granted.
