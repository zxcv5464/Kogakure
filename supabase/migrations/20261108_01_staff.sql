-- 狐隱 KOGAKURE / Phase 1: Staff + Admin
-- Before first run: create a Supabase project.
-- Run once as postgres in Supabase Dashboard > SQL Editor.
-- Never place a secret or service_role key in browser source or VITE_* variables.

create extension if not exists pgcrypto;

-- Admin membership is not user-controlled. Grant a new admin explicitly
-- from the Supabase Dashboard using the separate bootstrap instruction.
create table if not exists public.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- Use a fixed, empty search_path in security-definer functions.
-- auth.uid() is the signed-in Supabase Auth user, not the publishable key.
create or replace function public.is_site_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
 select exists (
  select 1 from public.admin_users
  where user_id = (select auth.uid())
 );
$$;
revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated;

drop policy if exists "admin can read own membership" on public.admin_users;
create policy "admin can read own membership" on public.admin_users
 for select to authenticated using (user_id = (select auth.uid()));

-- Data access: visitors see only published cards, including during local dev.
create table if not exists public.staff (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
 role text not null default '接待者',
 tagline text not null default '',
 bio text not null default '',
 image_url text,
 thumbnail_url text,
 theme_color text not null default '#82c8bc' check (theme_color ~ '^#[0-9a-fA-F]{6}$'),
 effect text not null default 'foxfire'
  check (effect in ('foxfire','sakura','starlight','gold','none')),
 socials jsonb not null default '[]'::jsonb check (jsonb_typeof(socials) = 'array'),
 services text[] not null default '{}',
 is_published boolean not null default false,
 sort_order integer not null default 100,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists staff_public_order_idx
 on public.staff (is_published, sort_order);

alter table public.staff enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
 new.updated_at = now();
 return new;
end;
$$;
drop trigger if exists staff_updated_at on public.staff;
create trigger staff_updated_at before update on public.staff
 for each row execute function public.set_updated_at();

-- Avoid calling the admin check for unauthenticated users:
-- visitor RLS is intentionally separate from administrator RLS.
drop policy if exists "public sees published staff" on public.staff;
drop policy if exists "visitors read published staff" on public.staff;
create policy "visitors read published staff" on public.staff
 for select to anon,authenticated using (is_published = true);

drop policy if exists "admins read all staff" on public.staff;
create policy "admins read all staff" on public.staff
 for select to authenticated using ((select public.is_site_admin()));

drop policy if exists "admins create staff" on public.staff;
create policy "admins create staff" on public.staff
 for insert to authenticated with check ((select public.is_site_admin()));

drop policy if exists "admins update staff" on public.staff;
create policy "admins update staff" on public.staff
 for update to authenticated using ((select public.is_site_admin()))
 with check ((select public.is_site_admin()));

drop policy if exists "admins delete staff" on public.staff;
create policy "admins delete staff" on public.staff
 for delete to authenticated using ((select public.is_site_admin()));

-- RLS + table privileges are two distinct layers.
grant usage on schema public to anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;
revoke insert, update, delete on table public.staff from anon;
grant select on table public.staff to anon, authenticated;
grant insert, update, delete on table public.staff to authenticated;

-- Photos are stored outside the database. Public viewing is intentional;
-- only authenticated site admins can write Storage objects.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
 'staff-media','staff-media',true,12582912,
 array['image/webp','image/png','image/jpeg','image/avif']::text[]
)
on conflict (id) do update
 set public=excluded.public,
     file_size_limit=excluded.file_size_limit,
     allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "staff-media admin insert" on storage.objects;
create policy "staff-media admin insert" on storage.objects
 for insert to authenticated
 with check (
  bucket_id = 'staff-media'
  and (storage.foldername(name))[1] = 'staff'
  and (select public.is_site_admin())
 );

drop policy if exists "staff-media admin update" on storage.objects;
create policy "staff-media admin update" on storage.objects
 for update to authenticated
 using (bucket_id = 'staff-media' and (select public.is_site_admin()))
 with check (bucket_id = 'staff-media' and (select public.is_site_admin()));

drop policy if exists "staff-media admin delete" on storage.objects;
create policy "staff-media admin delete" on storage.objects
 for delete to authenticated
 using (bucket_id = 'staff-media' and (select public.is_site_admin()));

-- No storage.objects SELECT policy is needed for a public bucket's normal
-- public image URLs. Never add an unauthenticated INSERT/UPDATE/DELETE policy.

-- AFTER running this file: create a user in Authentication > Users
-- then grant admin membership with the second SQL snippet in docs/SUPABASE_SETUP.md.
