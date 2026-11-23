-- KOGAKURE: independent shift portraits for employees and site owners.
-- Never join publicly readable employee_accounts or admin_users: those tables
-- contain account data that must not be shared with visitors.
create table if not exists public.shift_profile_images (
 user_id uuid primary key references auth.users(id) on delete cascade,
 image_path text not null,
 updated_at timestamptz not null default now(),
 constraint shift_profile_image_path check (
  image_path ~ ('^avatars/' || user_id::text || '/[0-9a-f-]+[.]webp$')
 )
);
alter table public.shift_profile_images enable row level security;
revoke all on public.shift_profile_images from public,anon,authenticated;
grant select on public.shift_profile_images to anon,authenticated;
grant insert,update,delete on public.shift_profile_images to authenticated;

-- A public visitor only sees portraits of people announced on an open day.
create policy "public reads portraits for announced shifts"
 on public.shift_profile_images for select to anon,authenticated
 using (
  exists (
   select 1 from public.shift_attendance a
   join public.shift_open_days d on d.shift_date=a.shift_date and d.is_open
   where a.employee_id=shift_profile_images.user_id
  )
  or exists (
   select 1 from public.shift_owner_attendance a
   join public.shift_open_days d on d.shift_date=a.shift_date and d.is_open
   where a.owner_id=shift_profile_images.user_id
  )
 );
create policy "shift editors view uploaded portraits"
 on public.shift_profile_images for select to authenticated
 using (
  user_id=(select auth.uid())
  or (select public.has_backoffice_permission('shifts.manage'))
 );

-- Authorization is based on an actual login, not a chosen public duty name.
create or replace function public.can_edit_shift_portrait(p_user_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $fn$
 select (select auth.uid()) is not null and (
  (
   p_user_id=(select auth.uid()) and (
    (select public.is_site_admin())
    or (select public.has_backoffice_permission('shifts.attend'))
    or (select public.has_backoffice_permission('shifts.manage'))
   )
  )
  or (
   (select public.has_backoffice_permission('shifts.manage'))
   and exists (
    select 1 from public.employee_accounts e
    where e.user_id=p_user_id and e.active=true
   )
  )
 );
$fn$;
revoke all on function public.can_edit_shift_portrait(uuid) from public,anon;
grant execute on function public.can_edit_shift_portrait(uuid) to authenticated;

create policy "permitted shift portrait insert"
 on public.shift_profile_images for insert to authenticated
 with check ((select public.can_edit_shift_portrait(user_id)));
create policy "permitted shift portrait update"
 on public.shift_profile_images for update to authenticated
 using ((select public.can_edit_shift_portrait(user_id)))
 with check ((select public.can_edit_shift_portrait(user_id)));
create policy "permitted shift portrait delete"
 on public.shift_profile_images for delete to authenticated
 using ((select public.can_edit_shift_portrait(user_id)));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('shift-avatars','shift-avatars',true,3145728,array['image/webp']::text[])
 on conflict (id) do nothing;

-- Never cast an unverified arbitrary object path into uuid.
create or replace function public.can_edit_shift_portrait_path(p_path text)
returns boolean language sql stable security invoker set search_path=''
as $fn$
 select case when p_path ~
  '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]+[.]webp$'
 then (select public.can_edit_shift_portrait(split_part(p_path,'/',2)::uuid))
 else false end;
$fn$;
revoke all on function public.can_edit_shift_portrait_path(text) from public,anon;
grant execute on function public.can_edit_shift_portrait_path(text) to authenticated;

create policy "shift avatar uploads by permitted staff"
 on storage.objects for insert to authenticated
 with check (
  bucket_id='shift-avatars'
  and (select public.can_edit_shift_portrait_path(name))
 );
create policy "shift avatar reads by permitted staff"
 on storage.objects for select to authenticated
 using (
  bucket_id='shift-avatars'
  and (select public.can_edit_shift_portrait_path(name))
 );
create policy "shift avatar cleanup by permitted staff"
 on storage.objects for delete to authenticated
 using (
  bucket_id='shift-avatars'
  and (select public.can_edit_shift_portrait_path(name))
 );

comment on table public.shift_profile_images is
 'Public RP shift portraits; authorization identity is auth user_id, independent of names or account profiles.';
