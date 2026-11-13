-- 狐隱 KOGAKURE · Phase 2: Tea banquet menu
-- Prerequisite: 20261108_01_staff.sql (public.is_site_admin and public.set_updated_at).
-- Apply in Supabase SQL Editor after verifying project and taking a DB backup.
-- Safe to re-run: seed rows are insert-on-conflict-do-nothing, preserving admin edits.

create table if not exists public.menu_categories (
 id uuid primary key default gen_random_uuid(),
 ordinal_label text not null default '',
 name text not null check (char_length(btrim(name)) between 1 and 60),
 subtitle text not null default '',
 description text not null default '',
 sort_order integer not null default 100,
 is_published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.menu_items (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.menu_categories(id) on delete restrict,
 name text not null check (char_length(btrim(name)) between 1 and 80),
 description text not null default '',
 price_gil integer not null check (price_gil >= 0 and price_gil <= 999999999),
 sort_order integer not null default 100,
 is_published boolean not null default false,
 is_available boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists menu_categories_public_order_idx on public.menu_categories (is_published, sort_order);
create index if not exists menu_items_public_order_idx on public.menu_items (category_id, is_published, sort_order);
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;

drop trigger if exists menu_categories_updated_at on public.menu_categories;
create trigger menu_categories_updated_at before update on public.menu_categories
 for each row execute function public.set_updated_at();
drop trigger if exists menu_items_updated_at on public.menu_items;
create trigger menu_items_updated_at before update on public.menu_items
 for each row execute function public.set_updated_at();

drop policy if exists "visitors read published menu categories" on public.menu_categories;
create policy "visitors read published menu categories" on public.menu_categories
 for select to anon,authenticated using (is_published = true);
drop policy if exists "admins read all menu categories" on public.menu_categories;
create policy "admins read all menu categories" on public.menu_categories
 for select to authenticated using ((select public.is_site_admin()));
drop policy if exists "admins insert menu categories" on public.menu_categories;
create policy "admins insert menu categories" on public.menu_categories
 for insert to authenticated with check ((select public.is_site_admin()));
drop policy if exists "admins update menu categories" on public.menu_categories;
create policy "admins update menu categories" on public.menu_categories
 for update to authenticated using ((select public.is_site_admin()))
 with check ((select public.is_site_admin()));
drop policy if exists "admins delete menu categories" on public.menu_categories;
create policy "admins delete menu categories" on public.menu_categories
 for delete to authenticated using ((select public.is_site_admin()));

drop policy if exists "visitors read published menu items" on public.menu_items;
create policy "visitors read published menu items" on public.menu_items
 for select to anon,authenticated using (
  is_published = true
  and exists (
   select 1 from public.menu_categories c
   where c.id = category_id and c.is_published = true
  )
 );
drop policy if exists "admins read all menu items" on public.menu_items;
create policy "admins read all menu items" on public.menu_items
 for select to authenticated using ((select public.is_site_admin()));
drop policy if exists "admins insert menu items" on public.menu_items;
create policy "admins insert menu items" on public.menu_items
 for insert to authenticated with check ((select public.is_site_admin()));
drop policy if exists "admins update menu items" on public.menu_items;
create policy "admins update menu items" on public.menu_items
 for update to authenticated using ((select public.is_site_admin()))
 with check ((select public.is_site_admin()));
drop policy if exists "admins delete menu items" on public.menu_items;
create policy "admins delete menu items" on public.menu_items
 for delete to authenticated using ((select public.is_site_admin()));

-- RLS AND table grants are both required.
grant usage on schema public to anon, authenticated;
revoke insert,update,delete on public.menu_categories from anon;
revoke insert,update,delete on public.menu_items from anon;
grant select on public.menu_categories, public.menu_items to anon,authenticated;
grant insert,update,delete on public.menu_categories, public.menu_items to authenticated;

-- Official first release: 3 sections and 11 items. Re-running never resets edits.
insert into public.menu_categories (id,ordinal_label,name,subtitle,description,sort_order,is_published) values
 ('10000000-0000-4000-8000-000000000001','壹','茶飲','茶寮之卷','',10,true),
 ('10000000-0000-4000-8000-000000000002','貳','和菓','甘味之卷','',20,true),
 ('10000000-0000-4000-8000-000000000003','參','御膳','狐宴之卷','由館內精選茶飲與茶點相佐，為旅人獻上一席雅緻茶宴。',30,true)
on conflict (id) do nothing;

insert into public.menu_items (id,category_id,name,description,price_gil,sort_order,is_published,is_available) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','月白蕎麥茶','淡雅蕎麥香氣，溫潤而悠長。',5000,10,true,true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','狐火多瑪茶','來自多瑪的茶韻，藏著一縷異鄉風情。',5000,20,true,true),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','紫宵莓果茶','仙子莓的清甜果香，宛如紫夜中的微光。',5000,30,true,true),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','狐隱抹茶','細緻而醇厚的抹茶香，靜享片刻茶寮時光。',5000,40,true,true),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','月見芝麻酥','芝麻烘焙的酥香，佐以月下茶韻。',10000,10,true,true),
 ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','狐面可可脆菓','香濃可可與酥脆口感交織的小茶點。',10000,20,true,true),
 ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000002','櫻雪果凝','晶瑩果凍中藏著輕盈果香，清甜如雪。',10000,30,true,true),
 ('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002','九尾甜菓盛合','柿子布丁、蘆薈水果凍與芝麻餅乾，三品甘味一次品嚐。',20000,40,true,true),
 ('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003','月詠茶香','高級瑪黛茶餅乾 ＋ 狐隱抹茶',25000,10,true,true),
 ('20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000003','狐火炙香','烤乳酪莫雷特 ＋ 狐火多瑪茶',25000,20,true,true),
 ('20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000003','雪月乳香','乳酪麵包球 ＋ 月白蕎麥茶',25000,30,true,true)
on conflict (id) do nothing;
