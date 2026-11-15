-- Site owners can sign up for their own shifts without having an employee account.
-- Employee attendance retains its original employee_accounts FK and RLS.
create table if not exists public.shift_owner_attendance(
 shift_date date not null,
 owner_id uuid not null references public.admin_users(user_id) on delete cascade,
 display_name text not null check(char_length(btrim(display_name)) between 1 and 100),
 created_at timestamptz not null default now(),
 primary key(shift_date,owner_id)
);
create index if not exists shift_owner_attendance_owner_date
 on public.shift_owner_attendance(owner_id,shift_date);

alter table public.shift_owner_attendance enable row level security;
revoke all on public.shift_owner_attendance from public,anon,authenticated;
grant select on public.shift_owner_attendance to anon,authenticated;
grant insert,delete on public.shift_owner_attendance to authenticated;

drop policy if exists "public reads owner shifts on open dates" on public.shift_owner_attendance;
create policy "public reads owner shifts on open dates" on public.shift_owner_attendance
 for select to anon,authenticated using (
  exists (
   select 1 from public.shift_open_days day
   where day.shift_date=shift_owner_attendance.shift_date and day.is_open=true
  )
  or (select public.is_site_admin())
 );

drop policy if exists "owner marks own shifts" on public.shift_owner_attendance;
create policy "owner marks own shifts" on public.shift_owner_attendance
 for insert to authenticated with check (
  owner_id=(select auth.uid())
  and (select public.is_site_admin())
  and shift_date >= (now() at time zone 'Asia/Taipei')::date
  and exists (
   select 1 from public.shift_open_days day
   where day.shift_date=shift_owner_attendance.shift_date and day.is_open=true
  )
 );

drop policy if exists "owner cancels own shifts" on public.shift_owner_attendance;
create policy "owner cancels own shifts" on public.shift_owner_attendance
 for delete to authenticated using (
  owner_id=(select auth.uid())
  and (select public.is_site_admin())
 );

comment on table public.shift_owner_attendance is
 'Site-owner self-submitted shifts; no fake employee account is required. Public rows show only when a date is open.';
