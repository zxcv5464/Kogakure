-- KOGAKURE: all-time accepted/completed booking quotas. Pending requests
-- do not reserve spots, so unconfirmed guests cannot exhaust an allocation.
-- Null plan quota and missing staff-plan key mean unlimited.
alter table public.booking_plans add column if not exists max_accepted_bookings integer;
alter table public.booking_plans drop constraint if exists booking_plans_max_accepted_bookings_valid;
alter table public.booking_plans add constraint booking_plans_max_accepted_bookings_valid
 check(max_accepted_bookings is null or max_accepted_bookings between 1 and 100000);
alter table public.staff add column if not exists booking_plan_caps jsonb not null default '{}'::jsonb;
alter table public.staff drop constraint if exists staff_booking_plan_caps_object;
alter table public.staff add constraint staff_booking_plan_caps_object
 check(jsonb_typeof(booking_plan_caps)='object');
comment on column public.booking_plans.max_accepted_bookings is
 'NULL = unlimited, else max cumulative accepted/completed requests for this plan. Pending requests do not consume quota.';
comment on column public.staff.booking_plan_caps is
 'Map plan uuid to max cumulative accepted/completed requests for this staff member; missing key = unlimited, zero = block new accepts.';

-- RLS-protected booking operators can update per-staff quotas without needing
-- arbitrary profile edit privileges.
create or replace function public.set_staff_booking_plan_caps(
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
revoke all on function public.set_staff_booking_plan_caps(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_staff_booking_plan_caps(uuid,jsonb) to authenticated;

-- All three booking-only staff settings are saved atomically.
create or replace function public.set_staff_booking_settings(
 p_staff_id uuid,p_allowed_plan_ids uuid[],p_allow_joint boolean,p_caps jsonb
) returns boolean language plpgsql security invoker set search_path=''
as $function$
begin
 perform public.set_staff_booking_rules(p_staff_id,p_allowed_plan_ids,p_allow_joint);
 perform public.set_staff_booking_plan_caps(p_staff_id,p_caps);
 return true;
end;
$function$;
revoke all on function public.set_staff_booking_settings(uuid,uuid[],boolean,jsonb)
 from public,anon,authenticated;
grant execute on function public.set_staff_booking_settings(uuid,uuid[],boolean,jsonb)
 to authenticated;

-- Name/photo editors must not bypass the booking-specific permissions.
create or replace function private.protect_staff_booking_rule_fields()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if (new.booking_allowed_plan_ids is distinct from old.booking_allowed_plan_ids
    or new.booking_allow_joint is distinct from old.booking_allow_joint
    or new.booking_plan_caps is distinct from old.booking_plan_caps)
    and current_user not in ('postgres','service_role') then
  raise exception '狐姬指名規則與次數限制僅可由預約管理設定' using errcode='42501';
 end if;
 return new;
end;
$function$;

-- Serialized on acceptance: concurrent managers cannot both consume the last
-- spot. Counts use the database, NOT the admin's paginated 160-record list.
create or replace function private.enforce_booking_quotas()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_max integer;
declare v_count bigint;
declare v_person record;
begin
 if new.status<>'accepted' or old.status='accepted' then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(14229,81937);
 select p.max_accepted_bookings into v_max
 from public.booking_plans p where p.id=new.plan_id;
 if v_max is not null then
  select count(*) into v_count from public.booking_requests b
   where b.plan_id=new.plan_id and b.status in ('accepted','completed')
     and b.id<>new.id;
  if v_count>=v_max then
   raise exception '此方案的成功接取次數已達上限，請選擇其他方案'
     using errcode='22023';
  end if;
 end if;
 for v_person in
  select s.id,(s.booking_plan_caps ->> new.plan_id::text)::integer as quota
  from public.booking_request_staff l
  join public.staff s on s.id=l.staff_id
  where l.booking_id=new.id
 loop
  if v_person.quota is not null then
   select count(*) into v_count from public.booking_request_staff l
   join public.booking_requests b on b.id=l.booking_id
   where l.staff_id=v_person.id and b.plan_id=new.plan_id
     and b.status in ('accepted','completed') and b.id<>new.id;
   if v_count>=v_person.quota then
    raise exception '其中一位狐姬已達此指名方案的接取次數上限'
     using errcode='22023';
   end if;
  end if;
 end loop;
 return new;
end;
$function$;
revoke all on function private.enforce_booking_quotas() from public,anon,authenticated;
grant execute on function private.enforce_booking_quotas() to authenticated;
drop trigger if exists booking_quotas_before_accept on public.booking_requests;
create trigger booking_quotas_before_accept
 before update of status on public.booking_requests
 for each row execute function private.enforce_booking_quotas();

-- Public capacity indicator only returns anonymous aggregate usage numbers,
-- never booking identities, guest information, notes, or contact data.
create or replace function public.get_booking_quota_usage()
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
revoke all on function public.get_booking_quota_usage() from public,anon,authenticated;
grant execute on function public.get_booking_quota_usage() to anon,authenticated;
comment on function public.get_booking_quota_usage() is
 'Public read-only aggregate capacity, no PII. Atomic allocation enforcement occurs only in private.enforce_booking_quotas.';
