-- 狐隱 KOGAKURE • employee invitations and scoped administrator-assigned access.
-- The original admin_users owner membership remains unchanged.
-- Employees are never inserted into admin_users, and cannot change any accounts.
create table if not exists public.employee_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 display_name text not null default '' check (char_length(btrim(display_name)) between 1 and 70),
 permissions text[] not null default '{}'::text[]
   check (permissions <@ array['staff.manage','menu.manage','booking.manage']::text[]),
 active boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint employee_accounts_valid_email check (char_length(email) between 5 and 254 and position('@' in email)>1)
);
create unique index if not exists employee_accounts_email_ci_unique on public.employee_accounts(lower(email));
drop trigger if exists employee_accounts_updated_at on public.employee_accounts;
create trigger employee_accounts_updated_at before update on public.employee_accounts
for each row execute function public.set_updated_at();
alter table public.employee_accounts enable row level security;
revoke all on public.employee_accounts from public,anon,authenticated;
grant select on public.employee_accounts to authenticated;
drop policy if exists "employees can read own account" on public.employee_accounts;
create policy "employees can read own account" on public.employee_accounts for select to authenticated
 using (user_id=(select auth.uid()));
drop policy if exists "site admins list employee accounts" on public.employee_accounts;
create policy "site admins list employee accounts" on public.employee_accounts for select to authenticated
 using ((select public.is_site_admin()));
-- Do NOT grant INSERT/UPDATE/DELETE to authenticated and never add a write policy.
-- The only writer is the separate authenticated owner-verified Edge Function with secret credentials.

create or replace function public.has_backoffice_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = ''
as $function$
 select
  (select public.is_site_admin())
  or (
   p_permission = any(array['staff.manage','menu.manage','booking.manage']::text[])
   and exists(
    select 1 from public.employee_accounts a
    where a.user_id=(select auth.uid()) and a.active=true
    and p_permission=any(a.permissions)
   )
  );
$function$;
revoke all on function public.has_backoffice_permission(text) from public,anon;
grant execute on function public.has_backoffice_permission(text) to authenticated;

-- Staff directory: visitors still see published names; employee editing is scoped.
drop policy if exists "permitted employee reads staff" on public.staff;
create policy "permitted employee reads staff" on public.staff for select to authenticated
 using ((select public.has_backoffice_permission('staff.manage')));
drop policy if exists "permitted employee creates staff" on public.staff;
create policy "permitted employee creates staff" on public.staff for insert to authenticated
 with check ((select public.has_backoffice_permission('staff.manage')));
drop policy if exists "permitted employee edits staff" on public.staff;
create policy "permitted employee edits staff" on public.staff for update to authenticated
 using ((select public.has_backoffice_permission('staff.manage')))
 with check ((select public.has_backoffice_permission('staff.manage')));
drop policy if exists "permitted employee deletes staff" on public.staff;
create policy "permitted employee deletes staff" on public.staff for delete to authenticated
 using ((select public.has_backoffice_permission('staff.manage')));

-- Storage uploads remain in the existing staff-media bucket under the staff/ prefix.
drop policy if exists "permitted employee upload staff media" on storage.objects;
create policy "permitted employee upload staff media" on storage.objects for insert to authenticated
 with check (bucket_id='staff-media' and (storage.foldername(name))[1]='staff'
 and (select public.has_backoffice_permission('staff.manage')));
drop policy if exists "permitted employee update staff media" on storage.objects;
create policy "permitted employee update staff media" on storage.objects for update to authenticated
 using (bucket_id='staff-media' and (select public.has_backoffice_permission('staff.manage')))
 with check (bucket_id='staff-media' and (select public.has_backoffice_permission('staff.manage')));
drop policy if exists "permitted employee remove staff media" on storage.objects;
create policy "permitted employee remove staff media" on storage.objects for delete to authenticated
 using (bucket_id='staff-media' and (select public.has_backoffice_permission('staff.manage')));

-- Tea menu item/category editing.

drop policy if exists "permitted employee selects menu_categories" on public.menu_categories;
create policy "permitted employee selects menu_categories" on public.menu_categories for select to authenticated
 using ((select public.has_backoffice_permission('menu.manage')));
drop policy if exists "permitted employee inserts menu_categories" on public.menu_categories;
create policy "permitted employee inserts menu_categories" on public.menu_categories for insert to authenticated
 with check ((select public.has_backoffice_permission('menu.manage')));
drop policy if exists "permitted employee updates menu_categories" on public.menu_categories;
create policy "permitted employee updates menu_categories" on public.menu_categories for update to authenticated
 using ((select public.has_backoffice_permission('menu.manage')))
 with check ((select public.has_backoffice_permission('menu.manage')));
drop policy if exists "permitted employee deletes menu_categories" on public.menu_categories;
create policy "permitted employee deletes menu_categories" on public.menu_categories for delete to authenticated
 using ((select public.has_backoffice_permission('menu.manage')));

drop policy if exists "permitted employee selects menu_items" on public.menu_items;
create policy "permitted employee selects menu_items" on public.menu_items for select to authenticated
 using ((select public.has_backoffice_permission('menu.manage')));
drop policy if exists "permitted employee inserts menu_items" on public.menu_items;
create policy "permitted employee inserts menu_items" on public.menu_items for insert to authenticated
 with check ((select public.has_backoffice_permission('menu.manage')));
drop policy if exists "permitted employee updates menu_items" on public.menu_items;
create policy "permitted employee updates menu_items" on public.menu_items for update to authenticated
 using ((select public.has_backoffice_permission('menu.manage')))
 with check ((select public.has_backoffice_permission('menu.manage')));
drop policy if exists "permitted employee deletes menu_items" on public.menu_items;
create policy "permitted employee deletes menu_items" on public.menu_items for delete to authenticated
 using ((select public.has_backoffice_permission('menu.manage')));

-- Booking data is private: only the owner or a booking-authorized employee may read it.
drop policy if exists "permitted employee reads bookings" on public.booking_requests;
create policy "permitted employee reads bookings" on public.booking_requests for select to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee inserts bookings" on public.booking_requests;
create policy "permitted employee inserts bookings" on public.booking_requests for insert to authenticated
 with check ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee updates bookings" on public.booking_requests;
create policy "permitted employee updates bookings" on public.booking_requests for update to authenticated
 using ((select public.has_backoffice_permission('booking.manage')))
 with check ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee deletes bookings" on public.booking_requests;
create policy "permitted employee deletes bookings" on public.booking_requests for delete to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee reads booking selections" on public.booking_request_staff;
create policy "permitted employee reads booking selections" on public.booking_request_staff for select to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee inserts booking selections" on public.booking_request_staff;
create policy "permitted employee inserts booking selections" on public.booking_request_staff for insert to authenticated
 with check ((select public.has_backoffice_permission('booking.manage')));

drop policy if exists "permitted employee reads booking_plans" on public.booking_plans;
create policy "permitted employee reads booking_plans" on public.booking_plans for select to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee inserts booking_plans" on public.booking_plans;
create policy "permitted employee inserts booking_plans" on public.booking_plans for insert to authenticated
 with check ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee updates booking_plans" on public.booking_plans;
create policy "permitted employee updates booking_plans" on public.booking_plans for update to authenticated
 using ((select public.has_backoffice_permission('booking.manage')))
 with check ((select public.has_backoffice_permission('booking.manage')));

drop policy if exists "permitted employee reads staff_booking_presence" on public.staff_booking_presence;
create policy "permitted employee reads staff_booking_presence" on public.staff_booking_presence for select to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee inserts staff_booking_presence" on public.staff_booking_presence;
create policy "permitted employee inserts staff_booking_presence" on public.staff_booking_presence for insert to authenticated
 with check ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee updates staff_booking_presence" on public.staff_booking_presence;
create policy "permitted employee updates staff_booking_presence" on public.staff_booking_presence for update to authenticated
 using ((select public.has_backoffice_permission('booking.manage')))
 with check ((select public.has_backoffice_permission('booking.manage')));
drop policy if exists "permitted employee deletes booking_plans" on public.booking_plans;
create policy "permitted employee deletes booking_plans" on public.booking_plans for delete to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));

-- The atomic booking RPCs previously checked only admin_users; allow only
-- booking-authorized employees while keeping all locks, validation and timing.

create or replace function public.decide_booking_request(
 p_booking_id uuid, p_action text
) returns void language plpgsql security invoker set search_path = ''
as $function$
declare
 v_booking public.booking_requests%rowtype;
 v_ids uuid[];
 v_now timestamptz := clock_timestamp();
 v_end timestamptz;
begin
 if not public.has_backoffice_permission('booking.manage') then
  raise exception '管理權限不足' using errcode='42501';
 end if;
 if p_action not in ('accept','reject','complete') then
  raise exception '不支援的預約處理方式' using errcode='22023';
 end if;
 select * into v_booking from public.booking_requests where id=p_booking_id for update;
 if not found then raise exception '預約不存在' using errcode='22023'; end if;
 if p_action='reject' then
  if v_booking.status<>'pending' then
   raise exception '此預約已處理，請更新清單' using errcode='P0001'; end if;
  update public.booking_requests set status='rejected' where id=p_booking_id;
  return;
 end if;
 if p_action='complete' then
  if v_booking.status<>'accepted' then
   raise exception '此預約尚未接取或已結束' using errcode='P0001'; end if;
  update public.booking_requests set status='completed',completed_at=v_now where id=p_booking_id;
  update public.staff_booking_presence o set busy_until=null
    where o.staff_id in(select l.staff_id from public.booking_request_staff l where l.booking_id=p_booking_id)
    and o.busy_until=v_booking.ends_at;
  return;
 end if;
 if v_booking.status<>'pending' then
  raise exception '此預約已處理，請更新清單' using errcode='P0001'; end if;
 select array_agg(l.staff_id order by l.staff_id) into v_ids
 from public.booking_request_staff l where l.booking_id=p_booking_id;
 if coalesce(array_length(v_ids,1),0)=0 then
  raise exception '沒有可接取的狐姬' using errcode='P0001'; end if;
 if exists(select 1 from public.staff s where s.id=any(v_ids) and (not s.is_published or not s.is_booking_visible))
 then raise exception '有館員已停止公開或指名，無法接取' using errcode='P0001'; end if;
 insert into public.staff_booking_presence(staff_id) select unnest(v_ids)
  on conflict(staff_id) do nothing;
 -- Locks serialize competing admins booking the same fox maid.
 perform 1 from public.staff_booking_presence o
  where o.staff_id=any(v_ids) order by o.staff_id for update;
 if exists(select 1 from public.staff_booking_presence o
           where o.staff_id=any(v_ids) and o.busy_until>v_now)
 then raise exception '部分狐姬正在指名中，無法重複接取' using errcode='P0001'; end if;
 v_end:=v_now+make_interval(mins=>v_booking.duration_minutes);
 update public.booking_requests set status='accepted',accepted_at=v_now,ends_at=v_end
 where id=p_booking_id;
 update public.staff_booking_presence set busy_until=v_end where staff_id=any(v_ids);
end;
$function$;

create or replace function public.admin_create_booking_request(
 p_guest_name text, p_guest_world text, p_plan_id uuid,
 p_staff_ids uuid[], p_note text default ''
) returns uuid language plpgsql security invoker set search_path = ''
as $function$
declare
 v_guest text:=btrim(coalesce(p_guest_name,''));
 v_world text:=btrim(coalesce(p_guest_world,''));
 v_note text:=btrim(coalesce(p_note,''));
 v_ids uuid[];
 v_plan record;
 v_id uuid;
 v_count integer;
begin
 if not public.has_backoffice_permission('booking.manage') then
  raise exception '只有館方管理員可以建立預約' using errcode='42501';
 end if;
 if char_length(v_guest) not between 2 and 48 or char_length(v_world) not between 2 and 48
   or v_guest ~ '[[:cntrl:]]' or v_world ~ '[[:cntrl:]]'
   or char_length(v_note)>240 or v_note ~ '[[:cntrl:]]'
 then raise exception '請確認角色姓名、伺服器與備註長度' using errcode='22023'; end if;
 if p_staff_ids is null or coalesce(array_length(p_staff_ids,1),0) not between 1 and 2
 then raise exception '每筆預約只能指名 1～2 位館員（最多追加一位）' using errcode='22023'; end if;
 if array_position(p_staff_ids,null) is not null or
   (select count(distinct x) from unnest(p_staff_ids) as x)<>array_length(p_staff_ids,1)
 then raise exception '指名狐姬不可重複' using errcode='22023'; end if;
 select p.id,p.name,p.duration_minutes,p.price_gil into v_plan
 from public.booking_plans p where p.id=p_plan_id;
 if not found then raise exception '所選指名方案不存在' using errcode='22023'; end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_staff_ids) as x;
 select count(*) into v_count from public.staff s
 where s.id=any(v_ids) and s.is_published and s.is_booking_visible;
 if v_count <> array_length(v_ids,1) then
  raise exception '部分館員未開放指名，請重新整理' using errcode='22023';
 end if;
 insert into public.booking_requests(guest_name,guest_world,note,plan_id,plan_name,duration_minutes,price_gil)
 values(v_guest,v_world,v_note,v_plan.id,v_plan.name,v_plan.duration_minutes,v_plan.price_gil)
 returning id into v_id;
 insert into public.booking_request_staff(booking_id,staff_id,staff_name)
 select v_id,s.id,s.display_name from public.staff s where s.id=any(v_ids);
 return v_id;
end;
$function$;

create or replace function public.admin_delete_booking_request(p_booking_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $function$
declare
 v_booking public.booking_requests%rowtype;
 v_ids uuid[];
begin
 if not public.has_backoffice_permission('booking.manage') then
  raise exception '只有館方管理員可以刪除預約' using errcode='42501';
 end if;
 select * into v_booking from public.booking_requests
  where id=p_booking_id for update;
 if not found then raise exception '此預約已不存在，請更新清單' using errcode='P0001'; end if;
 if v_booking.status='accepted' then
  select array_agg(s.staff_id order by s.staff_id) into v_ids
  from public.booking_request_staff s where s.booking_id=p_booking_id;
  if v_ids is not null then
   perform 1 from public.staff_booking_presence o
    where o.staff_id=any(v_ids) order by o.staff_id for update;
   update public.staff_booking_presence o set busy_until=null
    where o.staff_id=any(v_ids) and o.busy_until=v_booking.ends_at;
  end if;
 end if;
 delete from public.booking_requests where id=p_booking_id;
 if not found then raise exception '預約刪除未成功' using errcode='P0001'; end if;
end;
$function$;

-- Retain the narrow authorized invoker execution grants; never expose to anon.
revoke all on function public.decide_booking_request(uuid,text) from public,anon;
grant execute on function public.decide_booking_request(uuid,text) to authenticated;
revoke all on function public.admin_create_booking_request(text,text,uuid,uuid[],text) from public,anon;
grant execute on function public.admin_create_booking_request(text,text,uuid,uuid[],text) to authenticated;
revoke all on function public.admin_delete_booking_request(uuid) from public,anon;
grant execute on function public.admin_delete_booking_request(uuid) to authenticated;
