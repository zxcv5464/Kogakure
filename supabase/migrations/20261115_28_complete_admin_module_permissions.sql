-- KOGAKURE backoffice: independently grant every available management module.
-- Owner remains superadmin; delegated account managers may not appoint peers
-- or grant permissions beyond their own scope (server Edge Function enforced).
-- Existing employees retain prior self-service shift registration explicitly.
alter table public.employee_accounts
 drop constraint if exists employee_accounts_permissions_check;
alter table public.employee_accounts
 add constraint employee_accounts_permissions_check
 check (permissions <@ array[
  'accounts.manage','staff.manage','announcements.manage','accounting.manage',
  'menu.manage','services.manage','orders.manage','booking.manage',
  'shifts.manage','shifts.attend'
 ]::text[]);
update public.employee_accounts
 set permissions=array_append(permissions,'shifts.attend')
 where not ('shifts.attend'=any(permissions));

-- Avoid recursive employee_accounts RLS: policies must not recursively
-- query employee_accounts through a security-invoker permission helper.
-- This narrowly-scoped private function can only read access flags.
create or replace function private.check_employee_backoffice_permission(p_permission text)
returns boolean language sql stable security definer set search_path=''
as $function$
 select (select auth.uid()) is not null
 and (
  (select public.is_site_admin())
  or (
   p_permission=any(array[
    'accounts.manage','staff.manage','announcements.manage','accounting.manage',
    'menu.manage','services.manage','orders.manage','booking.manage',
    'shifts.manage','shifts.attend'
   ]::text[])
   and exists(select 1 from public.employee_accounts a
    where a.user_id=(select auth.uid()) and a.active=true
     and p_permission=any(a.permissions))
  )
 );
$function$;
revoke all on function private.check_employee_backoffice_permission(text) from public,anon;
grant execute on function private.check_employee_backoffice_permission(text) to authenticated;

create or replace function public.has_backoffice_permission(p_permission text)
returns boolean language sql stable security invoker set search_path=''
as $function$
 select coalesce((select private.check_employee_backoffice_permission(p_permission)),false);
$function$;
revoke all on function public.has_backoffice_permission(text) from public,anon;
grant execute on function public.has_backoffice_permission(text) to authenticated;

-- Account listing is needed by delegated credential managers and shift schedulers.
-- Employee permission assignments themselves remain Edge Function-only.
drop policy if exists "site admins list employee accounts" on public.employee_accounts;
create policy "authorized supervisors list employee accounts"
 on public.employee_accounts for select to authenticated
 using ((select public.has_backoffice_permission('accounts.manage'))
  or (select public.has_backoffice_permission('shifts.manage')));
drop policy if exists "employees update own shift display name" on public.employee_accounts;
create policy "employees update own shift display name" on public.employee_accounts
 for update to authenticated
 using (user_id=(select auth.uid()) and active=true and
  ((select public.has_backoffice_permission('shifts.attend'))
   or (select public.has_backoffice_permission('shifts.manage'))))
 with check (user_id=(select auth.uid()) and active=true and
  ((select public.has_backoffice_permission('shifts.attend'))
   or (select public.has_backoffice_permission('shifts.manage'))));

-- Service content & private media editing become delegable.
drop policy if exists "site admins read all services" on public.service_contents;
create policy "permitted operators read service drafts" on public.service_contents
 for select to authenticated using ((select public.has_backoffice_permission('services.manage')));
drop policy if exists "site admins insert services" on public.service_contents;
create policy "permitted operators insert services" on public.service_contents
 for insert to authenticated with check ((select public.has_backoffice_permission('services.manage')));
drop policy if exists "site admins update services" on public.service_contents;
create policy "permitted operators update services" on public.service_contents
 for update to authenticated using ((select public.has_backoffice_permission('services.manage')))
 with check ((select public.has_backoffice_permission('services.manage')));
drop policy if exists "site admins delete services" on public.service_contents;
create policy "permitted operators delete services" on public.service_contents
 for delete to authenticated using ((select public.has_backoffice_permission('services.manage')));
drop policy if exists "service photos owners select" on storage.objects;
create policy "permitted operators select service photos" on storage.objects
 for select to authenticated
 using (bucket_id='service-media' and (select public.has_backoffice_permission('services.manage')));
drop policy if exists "service photos owners upload" on storage.objects;
create policy "permitted operators upload service photos" on storage.objects
 for insert to authenticated
 with check (bucket_id='service-media' and (select public.has_backoffice_permission('services.manage')));
drop policy if exists "service photos owners remove" on storage.objects;
create policy "permitted operators remove service photos" on storage.objects
 for delete to authenticated
 using (bucket_id='service-media' and (select public.has_backoffice_permission('services.manage')));
drop policy if exists "permitted operators update service photos" on storage.objects;
create policy "permitted operators update service photos" on storage.objects
 for update to authenticated
 using (bucket_id='service-media' and (select public.has_backoffice_permission('services.manage')))
 with check (bucket_id='service-media' and (select public.has_backoffice_permission('services.manage')));

-- Announcements: published content remains public, unpublished data private.
drop policy if exists "site owners read announcement drafts" on public.site_announcements;
create policy "permitted operators read announcement drafts" on public.site_announcements
 for select to authenticated using ((select public.has_backoffice_permission('announcements.manage')));
drop policy if exists "site owners create announcements" on public.site_announcements;
create policy "permitted operators create announcements" on public.site_announcements
 for insert to authenticated with check ((select public.has_backoffice_permission('announcements.manage')));
drop policy if exists "site owners update announcements" on public.site_announcements;
create policy "permitted operators update announcements" on public.site_announcements
 for update to authenticated using ((select public.has_backoffice_permission('announcements.manage')))
 with check ((select public.has_backoffice_permission('announcements.manage')));
drop policy if exists "site owners delete announcements" on public.site_announcements;
create policy "permitted operators delete announcements" on public.site_announcements
 for delete to authenticated using ((select public.has_backoffice_permission('announcements.manage')));

-- Shift openings: an appointed scheduler may manage the official calendar.
drop policy if exists "owner adds opening dates" on public.shift_open_days;
create policy "permitted schedulers add opening dates" on public.shift_open_days
 for insert to authenticated with check ((select public.has_backoffice_permission('shifts.manage')));
drop policy if exists "owner updates opening dates" on public.shift_open_days;
create policy "permitted schedulers update opening dates" on public.shift_open_days
 for update to authenticated using ((select public.has_backoffice_permission('shifts.manage')))
 with check ((select public.has_backoffice_permission('shifts.manage')));
drop policy if exists "owner removes unannounced dates" on public.shift_open_days;
create policy "permitted schedulers remove opening dates" on public.shift_open_days
 for delete to authenticated using ((select public.has_backoffice_permission('shifts.manage')));

-- Employee shifts: viewers may self-sign up only when granted shifts.attend;
-- schedulers can add, edit or remove staff on open dates. No one gains owner
-- identity privileges from shift permissions.
drop policy if exists "published shift attendance" on public.shift_attendance;
create policy "published shift attendance" on public.shift_attendance
 for select to anon,authenticated
 using (
  exists (select 1 from public.shift_open_days d
   where d.shift_date=shift_attendance.shift_date and d.is_open)
  or (select public.is_site_admin())
  or employee_id=(select auth.uid())
 );
drop policy if exists "active employees signup on open days" on public.shift_attendance;
create policy "permitted shift signups" on public.shift_attendance
 for insert to authenticated with check (
  exists(select 1 from public.employee_accounts e
   where e.user_id=shift_attendance.employee_id and e.active=true)
  and exists(select 1 from public.shift_open_days d
   where d.shift_date=shift_attendance.shift_date and d.is_open=true)
  and (
   (select public.has_backoffice_permission('shifts.manage'))
   or (employee_id=(select auth.uid())
    and (select public.has_backoffice_permission('shifts.attend')))
  )
 );
drop policy if exists "active staff edit own shift display name" on public.shift_attendance;
create policy "permitted edit shift display names" on public.shift_attendance
 for update to authenticated
 using (
  (select public.has_backoffice_permission('shifts.manage'))
  or (employee_id=(select auth.uid())
   and (select public.has_backoffice_permission('shifts.attend')))
 )
 with check (
  (select public.has_backoffice_permission('shifts.manage'))
  or (employee_id=(select auth.uid())
   and (select public.has_backoffice_permission('shifts.attend')))
 );
drop policy if exists "owner or employee cancels attendance" on public.shift_attendance;
create policy "permitted cancel attendance" on public.shift_attendance
 for delete to authenticated
 using (
  (select public.has_backoffice_permission('shifts.manage'))
  or (employee_id=(select auth.uid())
   and (select public.has_backoffice_permission('shifts.attend')))
 );
-- Owner attendance records remain self-service by real site owners only.
comment on column public.employee_accounts.permissions is
 'Independent manager-granted backoffice module permissions. accounts.manage may never be self-assigned by a delegated manager.';
