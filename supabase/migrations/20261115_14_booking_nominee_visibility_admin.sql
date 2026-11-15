-- Move the nomination-availability control into booking management.
-- Keep the existing staff.is_booking_visible column and all current values.
-- Staff profiles are not rewritten; only the single booking visibility flag may be changed.
-- This SECURITY DEFINER RPC is deliberately narrow because booking.manage
-- users must not acquire permission to update other staff profile columns.
create or replace function public.set_staff_booking_visibility(
 p_staff_id uuid,
 p_visible boolean
) returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
 if not (select public.has_backoffice_permission('booking.manage')) then
  raise exception '沒有指名管理權限' using errcode='42501';
 end if;

 if p_staff_id is null or p_visible is null then
  raise exception '請提供有效的人員及指名狀態' using errcode='22023';
 end if;

 update public.staff
 set is_booking_visible=p_visible
 where id=p_staff_id;
 if not found then
  raise exception '找不到這位館員，請重新整理' using errcode='P0002';
 end if;

 return true;
end;
$function$;

revoke all on function public.set_staff_booking_visibility(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_staff_booking_visibility(uuid,boolean) to authenticated;
comment on function public.set_staff_booking_visibility(uuid,boolean) is
 'Booking operators can toggle only is_booking_visible, without staff.manage or full profile update permission.';
