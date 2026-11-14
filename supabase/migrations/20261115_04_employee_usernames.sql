-- KOGAKURE: administrator-created employee login name (not email invitations).
-- Keep the internal Auth email field for Supabase email/password authentication.
-- Existing employee rows (if any) retain identity and are given a unique legacy username.
alter table public.employee_accounts add column if not exists username text;
update public.employee_accounts
set username='legacy_' || left(replace(user_id::text,'-',''),16)
where username is null;
alter table public.employee_accounts alter column username set not null;
create unique index if not exists employee_accounts_username_unique
on public.employee_accounts (lower(username));
do $migration$
begin
 if not exists (
  select 1 from pg_constraint
  where conrelid='public.employee_accounts'::regclass
   and conname='employee_accounts_username_format'
 ) then
  alter table public.employee_accounts
   add constraint employee_accounts_username_format
   check (username = lower(username)
    and username ~ '^[a-z][a-z0-9_-]{2,23}$');
 end if;
end
$migration$;
-- The old email column now stores a reserved internal credential identifier.
-- It is never used for mail delivery. Passwords are only held by Supabase Auth.
-- No new grants, auth admin memberships, or public access are introduced.
