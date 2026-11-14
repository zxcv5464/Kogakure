-- 狐隱 KOGAKURE: editable public service descriptions and photo placeholders.
-- Non-destructive: existing staff, menus, bookings and orders are unchanged.
-- The original bath and divination content is seeded without overwriting edits.
create table if not exists public.service_contents(
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
 category text not null check (char_length(btrim(category)) between 1 and 60),
 english_label text not null default '' check (char_length(english_label)<=110),
 title text not null check (char_length(btrim(title)) between 1 and 100),
 quote text not null default '' check (char_length(quote)<=300),
 paragraphs text[] not null default '{}',
 details text[] not null default '{}',
 photo_label text not null default '' check (char_length(photo_label)<=100),
 image_url text check (image_url is null or (char_length(image_url)<=1200 and image_url ~ '^https://[^[:space:]]+$')),
 sort_order integer not null default 100 check (sort_order between 0 and 1000000),
 is_published boolean not null default false,
 updated_at timestamptz not null default now(),
 constraint service_paragraphs_limit check (cardinality(paragraphs)<=8),
 constraint service_details_limit check (cardinality(details)<=12)
);
create index if not exists service_contents_public_sort
 on public.service_contents(is_published,sort_order,id);

create or replace function public.touch_service_contents_updated_at()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 new.updated_at=pg_catalog.now();
 return new;
end;
$function$;
revoke all on function public.touch_service_contents_updated_at() from public,anon,authenticated;
drop trigger if exists service_contents_touch_updated_at on public.service_contents;
create trigger service_contents_touch_updated_at
before update on public.service_contents
for each row execute function public.touch_service_contents_updated_at();

alter table public.service_contents enable row level security;
revoke all on public.service_contents from public,anon,authenticated;
grant select on public.service_contents to anon,authenticated;
grant insert,update,delete on public.service_contents to authenticated;

drop policy if exists "public reads published services" on public.service_contents;
create policy "public reads published services" on public.service_contents
 for select to anon,authenticated using (is_published=true);
drop policy if exists "site admins read all services" on public.service_contents;
create policy "site admins read all services" on public.service_contents
 for select to authenticated using ((select public.is_site_admin()));
drop policy if exists "site admins insert services" on public.service_contents;
create policy "site admins insert services" on public.service_contents
 for insert to authenticated with check ((select public.is_site_admin()));
drop policy if exists "site admins update services" on public.service_contents;
create policy "site admins update services" on public.service_contents
 for update to authenticated
 using ((select public.is_site_admin()))
 with check ((select public.is_site_admin()));
drop policy if exists "site admins delete services" on public.service_contents;
create policy "site admins delete services" on public.service_contents
 for delete to authenticated using ((select public.is_site_admin()));

-- Stable slugs retain existing #bath and #divination links. Seed only once.
insert into public.service_contents(
 slug,category,english_label,title,quote,paragraphs,details,photo_label,sort_order,is_published
) values
 ('bath','湯浴之儀','THE BATHING RITUAL','一湯入夢，洗去塵囂',
 '「暖湯氤氳，願旅途的疲憊就此消散。」',
 array['循著山林深處的狐火，走進隱於夜色中的湯宿。讓輕柔燈影與氤氳水氣，陪你暫時放下旅途的紛擾。','無論想獨自沉澱，或與同行旅人靜靜相聚，都願這段湯浴時光，成為今夜值得收藏的片刻。'],
 array['湯泉休憩','靜謐相聚','隱世湯宿'],'湯浴形象照片',10,true),
 ('divination','占卜之儀','THE DIVINATION RITUAL','循狐火，探尋心中之願',
 '「命運藏於夜色，答案或許就在心念之間。」',
 array['於幽燈與狐影交織之處，讓館內的占卜者陪你走進一場帶著神祕色彩的對話，傾聽未說出口的心事。','無須急著尋找唯一的答案。願這一場隱世之儀，能為你的故事添上一點光亮與想像。'],
 array['神祕對談','心願指引','角色扮演體驗'],'占卜形象照片',20,true),
 ('polaroid','留影之儀','THE FOXFIRE KEEPSAKE','一瞬狐影，留住今宵',
 '「若此夜終將散去，便讓一紙留影，替我們記得相逢。」',
 array['當狐火映過衣袖，邀請同行旅人與館中狐姬並肩入鏡。於館內喜愛的角落，留下一張屬於今夜的拍立得合照。','以 FFXIV 遊戲內合照化作拍立得風格的紀念留影，將微笑、月色與相逢收藏在小小畫框裡。實際拍攝及交付方式，依館內接待安排為準。'],
 array['狐姬合影','拍立得風格','旅途紀念'],'拍立得合照展示照片',30,true)
on conflict(slug) do nothing;

-- Public photo files are served via Storage public URLs; uploading/removing
-- them is strictly owner-only and scoped to this dedicated 6 MiB image bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('service-media','service-media',true,6291456,
 array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

drop policy if exists "service photos owners select" on storage.objects;
create policy "service photos owners select" on storage.objects
 for select to authenticated
 using (bucket_id='service-media' and (select public.is_site_admin()));
drop policy if exists "service photos owners upload" on storage.objects;
create policy "service photos owners upload" on storage.objects
 for insert to authenticated
 with check (bucket_id='service-media' and (select public.is_site_admin()));
drop policy if exists "service photos owners remove" on storage.objects;
create policy "service photos owners remove" on storage.objects
 for delete to authenticated
 using (bucket_id='service-media' and (select public.is_site_admin()));
