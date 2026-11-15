-- 狐隱 KOGAKURE: public home announcements and owner-operated newsroom.
-- Newly created content is a draft; no unapproved announcements are seeded.
create table if not exists public.site_announcements (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 category text not null check(category in ('notice','news')),
 title text not null check(char_length(btrim(title)) between 1 and 100),
 content text not null default '' check(char_length(content)<=3000),
 is_pinned boolean not null default false,
 is_published boolean not null default false,
 published_at timestamptz,
 created_at timestamptz not null default pg_catalog.now(),
 updated_at timestamptz not null default pg_catalog.now()
);
create index if not exists site_announcements_public_sort_idx
 on public.site_announcements(category,is_pinned desc,published_at desc,id)
 where is_published=true;
create index if not exists site_announcements_admin_sort_idx
 on public.site_announcements(updated_at desc,id);

create or replace function public.touch_site_announcements()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 new.updated_at:=pg_catalog.now();
 if tg_op='INSERT' or new.is_published is distinct from old.is_published then
  new.published_at:=case when new.is_published then pg_catalog.now() else null end;
 elsif not new.is_published then
  new.published_at:=null;
 else
  new.published_at:=old.published_at;
 end if;
 return new;
end
$function$;
revoke all on function public.touch_site_announcements() from public,anon,authenticated;
drop trigger if exists touch_site_announcements on public.site_announcements;
create trigger touch_site_announcements
 before insert or update on public.site_announcements
 for each row execute function public.touch_site_announcements();

alter table public.site_announcements enable row level security;
revoke all on public.site_announcements from public,anon,authenticated;
grant select on public.site_announcements to anon,authenticated;
grant insert,update,delete on public.site_announcements to authenticated;

drop policy if exists "visitors read published announcements" on public.site_announcements;
create policy "visitors read published announcements" on public.site_announcements
 for select to anon,authenticated using (is_published=true);
drop policy if exists "site owners read announcement drafts" on public.site_announcements;
create policy "site owners read announcement drafts" on public.site_announcements
 for select to authenticated using ((select public.is_site_admin()));
drop policy if exists "site owners create announcements" on public.site_announcements;
create policy "site owners create announcements" on public.site_announcements
 for insert to authenticated with check ((select public.is_site_admin()));
drop policy if exists "site owners update announcements" on public.site_announcements;
create policy "site owners update announcements" on public.site_announcements
 for update to authenticated
 using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
drop policy if exists "site owners delete announcements" on public.site_announcements;
create policy "site owners delete announcements" on public.site_announcements
 for delete to authenticated using ((select public.is_site_admin()));

comment on table public.site_announcements is
 'KOGAKURE owner-managed front-page announcements. Published rows are public; drafts and write operations are owner-only.';
