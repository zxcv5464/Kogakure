-- 狐隱 KOGAKURE: rolling four-week opening calendar and voluntary staff attendance.
-- Dates are local Taiwan calendar dates. Changing the visible four-week window
-- does not delete historical rows.
create table if not exists public.shift_open_days(
 shift_date date primary key,
 is_open boolean not null default false,
 hours_label text not null default '' check (char_length(hours_label)<=80),
 note text not null default '' check (char_length(note)<=240),
 updated_at timestamptz not null default now()
);
create table if not exists public.shift_attendance(
 shift_date date not null,
 employee_id uuid not null references public.employee_accounts(user_id) on delete cascade,
 employee_name text not null check(char_length(btrim(employee_name)) between 1 and 100),
 created_at timestamptz not null default now(),
 primary key(shift_date,employee_id)
);
create index if not exists shift_attendance_employee_date on public.shift_attendance(employee_id,shift_date);

create or replace function public.touch_shift_open_day()
returns trigger language plpgsql security invoker set search_path=''
as $fn$
begin
 new.updated_at=pg_catalog.now();
 return new;
end;
$fn$;
revoke all on function public.touch_shift_open_day() from public,anon,authenticated;
drop trigger if exists shift_open_days_touch on public.shift_open_days;
create trigger shift_open_days_touch before update on public.shift_open_days
for each row execute function public.touch_shift_open_day();

alter table public.shift_open_days enable row level security;
alter table public.shift_attendance enable row level security;
revoke all on public.shift_open_days,public.shift_attendance from public,anon,authenticated;
grant select on public.shift_open_days,public.shift_attendance to anon,authenticated;
grant insert,update,delete on public.shift_open_days to authenticated;
grant insert,delete on public.shift_attendance to authenticated;

drop policy if exists "visitors see opening days" on public.shift_open_days;
create policy "visitors see opening days" on public.shift_open_days
 for select to anon,authenticated using(true);
drop policy if exists "owner adds opening dates" on public.shift_open_days;
create policy "owner adds opening dates" on public.shift_open_days
 for insert to authenticated with check ((select public.is_site_admin()));
drop policy if exists "owner updates opening dates" on public.shift_open_days;
create policy "owner updates opening dates" on public.shift_open_days
 for update to authenticated
 using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
drop policy if exists "owner removes unannounced dates" on public.shift_open_days;
create policy "owner removes unannounced dates" on public.shift_open_days
 for delete to authenticated using ((select public.is_site_admin()));

-- Anonymous viewers can only see attendance on dates explicitly marked open.
-- Managers and the individual can inspect an attendance row even if a date
-- subsequently changes to closed. No user emails or login names are exposed.
drop policy if exists "published shift attendance" on public.shift_attendance;
create policy "published shift attendance" on public.shift_attendance
 for select to anon,authenticated
 using (
   exists (select 1 from public.shift_open_days d where d.shift_date=shift_attendance.shift_date and d.is_open)
   or (select public.is_site_admin())
   or employee_id=(select auth.uid())
 );

drop policy if exists "active employees signup on open days" on public.shift_attendance;
create policy "active employees signup on open days" on public.shift_attendance
 for insert to authenticated with check (
   exists (select 1 from public.employee_accounts e
    where e.user_id=employee_id and e.active=true and e.display_name=employee_name)
   and exists(select 1 from public.shift_open_days d
    where d.shift_date=shift_attendance.shift_date and d.is_open=true)
   and (
    (select public.is_site_admin())
    or (
     employee_id=(select auth.uid())
     and exists (select 1 from public.employee_accounts e
      where e.user_id=(select auth.uid()) and e.active=true)
    )
   )
 );
drop policy if exists "owner or employee cancels attendance" on public.shift_attendance;
create policy "owner or employee cancels attendance" on public.shift_attendance
 for delete to authenticated using (
   (select public.is_site_admin())
   or (employee_id=(select auth.uid())
    and exists(select 1 from public.employee_accounts e
     where e.user_id=(select auth.uid()) and e.active=true))
 );

comment on table public.shift_open_days is 'Four-week calendar opening dates; unannounced dates have no row; closed dates have is_open=false.';
comment on table public.shift_attendance is 'Active employee-submitted attendance; employee names validated at insertion, no credentials in public schedule.';
