-- 狐隱 KOGAKURE · 每項指名方案可獨立設定是否允許雙人指名。
-- Default true preserves all existing plans and existing booking behavior.
alter table public.booking_plans
 add column if not exists allow_joint_nomination boolean not null default true;
comment on column public.booking_plans.allow_joint_nomination is
 'Whether this plan permits simultaneous nomination of two staff. The staff-specific joint rule must also permit it.';

-- Trigger invoked by public submission, backoffice creation, and acceptance.
-- Keeps all existing staff, plan, published visibility, and 2-person checks.
create or replace function private.validate_staff_booking_rules(p_booking_id uuid)
returns void language plpgsql security invoker set search_path=''
as $function$
declare v_people integer;
begin
 if exists (
  select 1 from public.booking_requests b
  join public.booking_request_staff l on l.booking_id=b.id
  left join public.staff s on s.id=l.staff_id
  where b.id=p_booking_id
   and (
    s.id is null
    or not coalesce(s.is_published,false)
    or not coalesce(s.is_booking_visible,false)
    or (s.booking_allowed_plan_ids is not null
      and not (b.plan_id=any(s.booking_allowed_plan_ids)))
   )
 ) then
  raise exception '指名人員無法接受這個方案或已停止開放預約，請重新選擇'
   using errcode='22023';
 end if;
 select count(*) into v_people
 from public.booking_request_staff l where l.booking_id=p_booking_id;
 if v_people>2 then
  raise exception '最多只能同時指名兩位狐姬' using errcode='22023';
 end if;
 if v_people>1 and exists(
  select 1 from public.booking_requests r
  join public.booking_plans p on p.id=r.plan_id
  where r.id=p_booking_id and p.allow_joint_nomination=false
 ) then
  raise exception '此指名方案未開放同時指名，請選擇單人預約或其他方案'
   using errcode='22023';
 end if;
 if v_people>1 and exists(
  select 1 from public.booking_request_staff l
  join public.staff s on s.id=l.staff_id
  where l.booking_id=p_booking_id and not s.booking_allow_joint
 ) then
  raise exception '選擇的狐姬未開放同時指名，請改為單人預約'
   using errcode='22023';
 end if;
end;
$function$;

-- Preserve invoker-only validation and the previously scoped execution grant.
revoke all on function private.validate_staff_booking_rules(uuid) from public,anon,authenticated;
grant execute on function private.validate_staff_booking_rules(uuid) to authenticated;
