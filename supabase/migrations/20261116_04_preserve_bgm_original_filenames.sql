-- Preserve uploaded BGM filenames separately from ASCII-safe storage keys.
-- Only owner and staff delegated bgm.manage may access the names.
create table if not exists public.bgm_track_names (
  path text primary key check (path like 'tracks/%'),
  display_name text not null check (char_length(display_name) between 1 and 255),
  updated_at timestamptz not null default now()
);

alter table public.bgm_track_names enable row level security;
revoke all on public.bgm_track_names from public, anon, authenticated;
grant select, insert, update, delete on public.bgm_track_names to authenticated;

drop policy if exists "BGM managers read original filenames" on public.bgm_track_names;
create policy "BGM managers read original filenames"
 on public.bgm_track_names for select to authenticated
 using ((select public.has_backoffice_permission('bgm.manage')));

drop policy if exists "BGM managers add original filenames" on public.bgm_track_names;
create policy "BGM managers add original filenames"
 on public.bgm_track_names for insert to authenticated
 with check ((select public.has_backoffice_permission('bgm.manage')));

drop policy if exists "BGM managers edit original filenames" on public.bgm_track_names;
create policy "BGM managers edit original filenames"
 on public.bgm_track_names for update to authenticated
 using ((select public.has_backoffice_permission('bgm.manage')))
 with check ((select public.has_backoffice_permission('bgm.manage')));

drop policy if exists "BGM managers delete original filenames" on public.bgm_track_names;
create policy "BGM managers delete original filenames"
 on public.bgm_track_names for delete to authenticated
 using ((select public.has_backoffice_permission('bgm.manage')));

-- Restore the currently selected legacy upload's name from its saved title.
insert into public.bgm_track_names(path,display_name)
select o.name, s.track_title || substring(o.name from '\.[^.]+$')
from public.site_bgm_settings s
join storage.objects o
 on o.bucket_id='bgm-media'
 and s.source_url=(
  'https://akocsanwytansrdptaho.supabase.co/storage/v1/object/public/bgm-media/'||o.name
 )
where s.id=1 and s.source_kind='upload' and s.track_title <> ''
 and o.name ~* '\.(mp3|ogg|wav|m4a|aac|webm|flac)$'
on conflict(path) do nothing;
