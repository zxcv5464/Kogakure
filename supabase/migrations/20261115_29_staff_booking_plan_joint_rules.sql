-- 狐隱 KOGAKURE: Each fox maid can accept chosen booking plans,
-- and independently opt out of double nominations.
-- NULL plan list = accept every plan (including future plans); empty list = none.
-- Existing staff and booking histories are left untouched.
alter table public.staff
 add column if not exists booking_allowed_plan_ids uuid[] default null,
 add column if not exists booking_allow_joint boolean not null default true;

alter table public.staff drop constraint if exists staff_booking_allowed_plan_ids_valid;
alter table public.staff add constraint staff_booking_allowed_plan_ids_valid
 check (booking_allowed_plan_ids is null or
  (array_position(booking_allowed_plan_ids,null) is null
   and cardinality(booking_allowed_plan_ids)<=100));

comment on column public.staff.booking_allowed_plan_ids is
 'NULL permits all booking plans. [] permits none. Otherwise specific plan ids only.';
comment on column public.staff.booking_allow_joint is
 'False prevents the staff member being nominated with any second staff member.';

-- Existing booking operators may modify only these two fields through this RPC,
-- not edit any other profile attributes.
create or replace function public.set_staff_booking_rules(
 p_staff_id uuid,p_allowed_plan_ids uuid[],p_allow_joint boolean
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_ids uuid[];
begin
 if (select auth.uid()) is null or
  not (select public.has_backoffice_permission('booking.manage')) then
  raise exception '沒有預約管理權限' using errcode='42501';
 end if;
 if p_staff_id is null or p_allow_joint is null then
  raise exception '請提供有效館員及指名設定' using errcode='22023';
 end if;
 if p_allowed_plan_ids is not null then
  if cardinality(p_allowed_plan_ids)>100
   or array_position(p_allowed_plan_ids,null) is not null then
   raise exception '可接受方案清單不正確' using errcode='22023';
  end if;
  select coalesce(array_agg(p.id order by p.id),'{}'::uuid[]) into v_ids
  from public.booking_plans p where p.id=any(p_allowed_plan_ids);
  if cardinality(v_ids)<>cardinality(p_allowed_plan_ids) then
   raise exception '方案已遭刪除或重複，請重新整理方案清單' using errcode='22023';
  end if;
 else
  v_ids:=null;
 end if;
 update public.staff
 set booking_allowed_plan_ids=v_ids,booking_allow_joint=p_allow_joint
 where id=p_staff_id;
 if not found then
  raise exception '狐姬資料不存在，請重新整理' using errcode='P0002';
 end if;
 return true;
end;
$function$;
revoke all on function public.set_staff_booking_rules(uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.set_staff_booking_rules(uuid,uuid[],boolean) to authenticated;

-- Recheck in the database for BOTH public visitor and admin-created bookings.
-- AFTER INSERT permits checking the full multi-row nomination in one statement.
-- BEFORE acceptance rechecks changes made after a pending application was sent.
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
  select 1 from public.booking_request_staff l
  join public.staff s on s.id=l.staff_id
  where l.booking_id=p_booking_id and not s.booking_allow_joint
 ) then
  raise exception '選擇的狐姬未開放同時指名，請改為單人預約'
   using errcode='22023';
 end if;
end;
$function$;
revoke all on function private.validate_staff_booking_rules(uuid) from public,anon,authenticated;

create or replace function private.check_new_booking_nominees()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 perform private.validate_staff_booking_rules(new.booking_id);
 return new;
end;
$function$;
revoke all on function private.check_new_booking_nominees() from public,anon,authenticated;
drop trigger if exists booking_staff_rules_on_insert on public.booking_request_staff;
create trigger booking_staff_rules_on_insert
 after insert or update of staff_id,booking_id on public.booking_request_staff
 for each row execute function private.check_new_booking_nominees();

create or replace function private.check_booking_acceptance_rules()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if new.status='accepted' and old.status is distinct from new.status then
  perform private.validate_staff_booking_rules(new.id);
 end if;
 return new;
end;
$function$;
revoke all on function private.check_booking_acceptance_rules() from public,anon,authenticated;
drop trigger if exists booking_rules_before_acceptance on public.booking_requests;
create trigger booking_rules_before_acceptance
 before update of status on public.booking_requests
 for each row execute function private.check_booking_acceptance_rules();

-- The RPC and triggers do not remove any existing staff/bookings/plans.
