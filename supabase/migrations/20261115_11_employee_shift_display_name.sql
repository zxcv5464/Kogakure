-- 狐隱：出勤顯示名稱與員工登入帳號名稱分離。
-- Only the employee_name column can be edited. Staff identity and date remain immutable.
-- Existing shift entries and the original employee account information remain untouched.

drop policy if exists "active employees signup on open days" on public.shift_attendance;
create policy "active employees signup on open days" on public.shift_attendance
 for insert to authenticated with check (
  exists(select 1 from public.employee_accounts e
   where e.user_id=employee_id and e.active=true)
  and exists(select 1 from public.shift_open_days d
   where d.shift_date=shift_attendance.shift_date and d.is_open=true)
  and (
   (select public.is_site_admin())
   or employee_id=(select auth.uid())
  )
 );

-- A manager may help correct employee records; an active employee can
-- only correct their own shift display name. Both USING and WITH CHECK
-- prevent access to other employees' records.
drop policy if exists "active staff edit own shift display name" on public.shift_attendance;
create policy "active staff edit own shift display name" on public.shift_attendance
 for update to authenticated
 using (
  (select public.is_site_admin())
  or (
   employee_id=(select auth.uid())
   and exists(select 1 from public.employee_accounts e
    where e.user_id=(select auth.uid()) and e.active=true)
  )
 )
 with check (
  (select public.is_site_admin())
  or (
   employee_id=(select auth.uid())
   and exists(select 1 from public.employee_accounts e
    where e.user_id=(select auth.uid()) and e.active=true)
  )
 );

-- Explicit column-level grants: no one can alter shift_date or employee_id.
revoke update on public.shift_attendance from authenticated;
grant update(employee_name) on public.shift_attendance to authenticated;

-- The owner can also rename an already-registered own shift without
-- cancelling and creating it again. This does not grant access to other owners.
drop policy if exists "owner edits own shift display name" on public.shift_owner_attendance;
create policy "owner edits own shift display name" on public.shift_owner_attendance
 for update to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_site_admin()))
 with check (owner_id=(select auth.uid()) and (select public.is_site_admin()));
revoke update on public.shift_owner_attendance from authenticated;
grant update(display_name) on public.shift_owner_attendance to authenticated;

comment on column public.shift_attendance.employee_name is
 'Public RP duty display name chosen by the employee; separate from employee_accounts.display_name.';
