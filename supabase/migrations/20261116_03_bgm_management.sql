-- KOGAKURE: one live BGM configuration, managed by an independently
-- delegated staff permission. Public users may only read the active config.
alter table public.employee_accounts
 drop constraint if exists employee_accounts_permissions_check;
alter table public.employee_accounts
 add constraint employee_accounts_permissions_check
 check(permissions <@ array[
  'accounts.manage','staff.manage','announcements.manage','accounting.manage',
  'menu.manage','services.manage','orders.manage','booking.manage',
  'shifts.manage','shifts.attend','bgm.manage'
 ]::text[]);

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
    'shifts.manage','shifts.attend','bgm.manage'
   ]::text[])
   and exists(select 1 from public.employee_accounts a
    where a.user_id=(select auth.uid()) and a.active=true
     and p_permission=any(a.permissions))
  )
 );
$function$;
revoke all on function private.check_employee_backoffice_permission(text) from public,anon;
grant execute on function private.check_employee_backoffice_permission(text) to authenticated;

create table if not exists public.site_bgm_settings(
 id smallint primary key default 1 check(id=1),
 enabled boolean not null default true,
 source_kind text not null default 'default'
  check(source_kind in('default','upload','direct','youtube')),
 source_url text not null default '',
 track_title text not null default 'みやびごころ',
 volume real not null default 0.24 check(volume>=0 and volume<=1),
 repeat_track boolean not null default true,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 constraint bgm_source_url_length check(length(source_url)<=2048),
 constraint bgm_track_title_length check(length(track_title) between 1 and 120)
);
insert into public.site_bgm_settings(id,enabled,source_kind,source_url,track_title,volume,repeat_track)
values(1,true,'default','','みやびごころ',0.24,true)
on conflict(id) do nothing;
alter table public.site_bgm_settings enable row level security;
revoke all on public.site_bgm_settings from public,anon,authenticated;
grant select on public.site_bgm_settings to anon,authenticated;
grant update on public.site_bgm_settings to authenticated;
drop policy if exists "public reads current BGM" on public.site_bgm_settings;
create policy "public reads current BGM" on public.site_bgm_settings
 for select to anon,authenticated using(true);
drop policy if exists "delegated BGM managers update BGM" on public.site_bgm_settings;
create policy "delegated BGM managers update BGM" on public.site_bgm_settings
 for update to authenticated
 using((select public.has_backoffice_permission('bgm.manage')))
 with check((select public.has_backoffice_permission('bgm.manage')));

-- Stamp the user and publication time, preventing public clients from
-- spoofing the metadata. Not a SECURITY DEFINER function.
create or replace function private.stamp_bgm_update()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 new.updated_at:=now();
 new.updated_by:=(select auth.uid());
 return new;
end;
$function$;
drop trigger if exists stamp_site_bgm_update on public.site_bgm_settings;
create trigger stamp_site_bgm_update before update on public.site_bgm_settings
 for each row execute function private.stamp_bgm_update();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bgm-media','bgm-media',true,20971520,
 array['audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav',
 'audio/mp4','audio/x-m4a','audio/aac','audio/x-aac','audio/webm','audio/flac','audio/x-flac','audio/wave'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "BGM managers view audio files" on storage.objects;
create policy "BGM managers view audio files" on storage.objects
 for select to authenticated
 using(bucket_id='bgm-media' and (select public.has_backoffice_permission('bgm.manage')));
drop policy if exists "BGM managers upload audio files" on storage.objects;
create policy "BGM managers upload audio files" on storage.objects
 for insert to authenticated
 with check(bucket_id='bgm-media' and (storage.foldername(name))[1]='tracks'
  and (select public.has_backoffice_permission('bgm.manage')));
drop policy if exists "BGM managers remove audio files" on storage.objects;
create policy "BGM managers remove audio files" on storage.objects
 for delete to authenticated
 using(bucket_id='bgm-media' and (select public.has_backoffice_permission('bgm.manage')));

comment on table public.site_bgm_settings is
 'Single currently active BGM for the existing public header music player. Uploaded audio hosted by Supabase; YouTube must use a visible official iframe, not a hidden audio extractor.';
