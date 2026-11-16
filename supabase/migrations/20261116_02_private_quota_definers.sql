-- Keep only invoker wrappers in the exposed public API. Privileged SQL
-- stays in private (which already has USAGE for anon/authenticated); grant
-- EXECUTE solely to the known clients. No data or quota values are changed.
create or replace function private.set_staff_booking_plan_caps_impl(
 p_staff_id uuid,p_caps jsonb
) returns boolean language plpgsql security definer set search_path=''
as $function$
declare v record;
begin
 if (select auth.uid()) is null
  or not (select public.has_backoffice_permission('booking.manage')) then
  raise exception '沒有預約管理權限' using errcode='42501';
 end if;
 if p_staff_id is null or p_caps is null or jsonb_typeof(p_caps)<>'object' then
  raise exception '每位狐姬的方案次數設定無效' using errcode='22023';
 end if;
 if (select count(*) from jsonb_each(p_caps))>100 then
  raise exception '最多設定 100 個個別方案' using errcode='22023';
 end if;
 for v in select key,value from jsonb_each(p_caps) loop
  if jsonb_typeof(v.value)<>'number'
   or v.value::text !~ '^(0|[1-9][0-9]{0,5})$'
   or (v.value::text)::integer>100000
   or not exists(select 1 from public.booking_plans p where p.id::text=v.key) then
   raise exception '個別方案的上限應為 0～100000，且必須是現有方案'
    using errcode='22023';
  end if;
 end loop;
 update public.staff set booking_plan_caps=p_caps where id=p_staff_id;
 if not found then raise exception '狐姬不存在' using errcode='P0002'; end if;
 return true;
end;
$function$;
revoke all on function private.set_staff_booking_plan_caps_impl(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.set_staff_booking_plan_caps_impl(uuid,jsonb) to authenticated;

create or replace function public.set_staff_booking_plan_caps(p_staff_id uuid,p_caps jsonb)
returns boolean language sql security invoker set search_path=''
as $function$
 select private.set_staff_booking_plan_caps_impl(p_staff_id,p_caps);
$function$;
revoke all on function public.set_staff_booking_plan_caps(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_staff_booking_plan_caps(uuid,jsonb) to authenticated;

create or replace function private.get_booking_quota_usage_impl()
returns jsonb language sql stable security definer set search_path=''
as $function$
 select jsonb_build_object(
  'plans',coalesce((
   select jsonb_object_agg(q.plan_id::text,q.total) from (
    select b.plan_id,count(*) as total from public.booking_requests b
    where b.status in ('accepted','completed') group by b.plan_id
   ) q
  ),'{}'::jsonb),
  'staff',coalesce((
   select jsonb_object_agg(q.staff_id::text||':'||q.plan_id::text,q.total)
   from (
    select l.staff_id,b.plan_id,count(*) as total
    from public.booking_requests b
    join public.booking_request_staff l on l.booking_id=b.id
    where b.status in ('accepted','completed')
    group by l.staff_id,b.plan_id
   ) q
  ),'{}'::jsonb)
 );
$function$;
revoke all on function private.get_booking_quota_usage_impl() from public,anon,authenticated;
grant execute on function private.get_booking_quota_usage_impl() to anon,authenticated;

create or replace function public.get_booking_quota_usage()
returns jsonb language sql stable security invoker set search_path=''
as $function$
 select private.get_booking_quota_usage_impl();
$function$;
revoke all on function public.get_booking_quota_usage() from public,anon,authenticated;
grant execute on function public.get_booking_quota_usage() to anon,authenticated;
