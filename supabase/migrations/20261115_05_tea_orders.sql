-- 狐隱：茶宴訪客點單、員工訂單管理與獨立授權。
-- 既有菜單、預約、員工帳號及訂單以外資料完全不變。
-- Public callers get only a narrowly validated RPC, never private order rows.

alter table public.employee_accounts
 drop constraint if exists employee_accounts_permissions_check;
alter table public.employee_accounts
 add constraint employee_accounts_permissions_check
 check (permissions <@ array['staff.manage','menu.manage','booking.manage','orders.manage']::text[]);

create or replace function public.has_backoffice_permission(p_permission text)
returns boolean language sql stable security invoker set search_path=''
as $function$
 select (select public.is_site_admin())
 or (
  p_permission = any(array['staff.manage','menu.manage','booking.manage','orders.manage']::text[])
  and exists(select 1 from public.employee_accounts e
   where e.user_id=(select auth.uid())
   and e.active=true and p_permission=any(e.permissions))
 );
$function$;
revoke all on function public.has_backoffice_permission(text) from public,anon;
grant execute on function public.has_backoffice_permission(text) to authenticated;

create table if not exists public.tea_orders(
 id uuid primary key default gen_random_uuid(),
 guest_name text not null check(char_length(btrim(guest_name)) between 2 and 48),
 guest_world text not null check(char_length(btrim(guest_world)) between 2 and 48),
 status text not null default 'pending'
   check(status in ('pending','preparing','completed','cancelled')),
 total_gil bigint not null default 0 check(total_gil between 0 and 1000000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.tea_order_items(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.tea_orders(id) on delete cascade,
 menu_item_id uuid references public.menu_items(id) on delete set null,
 item_name text not null check(char_length(btrim(item_name)) between 1 and 80),
 unit_gil integer not null check(unit_gil between 0 and 999999999),
 quantity integer not null check(quantity between 1 and 99),
 line_gil bigint not null check(line_gil between 0 and 1000000000),
 unique(order_id,menu_item_id)
);
create index if not exists tea_orders_status_recent on public.tea_orders(status,created_at desc);
create index if not exists tea_orders_guest_recent on public.tea_orders(guest_name,guest_world,created_at desc);
create index if not exists tea_order_items_order on public.tea_order_items(order_id);

alter table public.tea_orders enable row level security;
alter table public.tea_order_items enable row level security;
revoke all on public.tea_orders,public.tea_order_items from public,anon,authenticated;
grant select on public.tea_orders,public.tea_order_items to authenticated;

drop policy if exists "order operators read tea orders" on public.tea_orders;
create policy "order operators read tea orders" on public.tea_orders for select to authenticated
 using ((select public.has_backoffice_permission('orders.manage')));
drop policy if exists "order operators read tea items" on public.tea_order_items;
create policy "order operators read tea items" on public.tea_order_items for select to authenticated
 using ((select public.has_backoffice_permission('orders.manage')));
-- No public or authenticated INSERT, UPDATE, DELETE on either order table.
-- Even an authorized order operator uses a validated transition RPC.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon,authenticated;

create or replace function private.submit_tea_order(
 p_guest_name text,p_guest_world text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
 v_guest text := pg_catalog.btrim(coalesce(p_guest_name,''));
 v_world text := pg_catalog.btrim(coalesce(p_guest_world,''));
 v_element jsonb;
 v_id_text text;
 v_qty_text text;
 v_menu_item uuid;
 v_quantity integer;
 v_menu record;
 v_order uuid;
 v_total bigint := 0;
 v_qty_sum integer := 0;
 v_seen uuid[] := array[]::uuid[];
begin
 if pg_catalog.char_length(v_guest) not between 2 and 48
   or pg_catalog.char_length(v_world) not between 2 and 48
   then raise exception '請填寫 2～48 字的旅人姓名與伺服器' using errcode='22023'; end if;
 if p_items is null or pg_catalog.jsonb_typeof(p_items)<>'array'
   or pg_catalog.jsonb_array_length(p_items) not between 1 and 20
   then raise exception '請選擇 1～20 種可供應的茶宴品項' using errcode='22023'; end if;

 -- Throttle accidental double-clicks/repeated requests from the same game character.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  pg_catalog.lower(v_guest)||'|'||pg_catalog.lower(v_world), 0));
 if exists(
  select 1 from public.tea_orders o
  where pg_catalog.lower(o.guest_name)=pg_catalog.lower(v_guest)
    and pg_catalog.lower(o.guest_world)=pg_catalog.lower(v_world)
    and o.created_at>pg_catalog.now()-interval '15 seconds'
 ) then
  raise exception '短時間內已有點單送出，請確認後再試' using errcode='22023';
 end if;

 insert into public.tea_orders(guest_name,guest_world)
 values(v_guest,v_world) returning id into v_order;

 for v_element in select value from pg_catalog.jsonb_array_elements(p_items)
 loop
  if pg_catalog.jsonb_typeof(v_element)<>'object'
    or pg_catalog.jsonb_typeof(v_element->'id')<>'string'
    or pg_catalog.jsonb_typeof(v_element->'quantity')<>'number'
    then raise exception '餐點內容格式不正確' using errcode='22023'; end if;
  v_id_text:=v_element->>'id';
  v_qty_text:=v_element->>'quantity';
  if v_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_qty_text !~ '^[1-9][0-9]?$'
    then raise exception '餐點編號或數量不正確' using errcode='22023'; end if;
  v_menu_item:=v_id_text::uuid;
  v_quantity:=v_qty_text::integer;
  if v_menu_item=any(v_seen) then
   raise exception '請勿重複送出同一品項' using errcode='22023'; end if;
  v_seen:=pg_catalog.array_append(v_seen,v_menu_item);
  v_qty_sum:=v_qty_sum+v_quantity;
  if v_qty_sum>100 then raise exception '單次點單最多 100 份餐點' using errcode='22023'; end if;

  select i.name,i.price_gil into v_menu
   from public.menu_items i
   join public.menu_categories c on c.id=i.category_id
   where i.id=v_menu_item and i.is_published=true and i.is_available=true
    and c.is_published=true
   for share of i,c;
  if not found then
   raise exception '部分品項已下架或停止供應，請更新菜單' using errcode='22023'; end if;
  v_total:=v_total+(v_menu.price_gil::bigint*v_quantity::bigint);
  if v_total>1000000000 then
   raise exception '點單總額超過單筆上限' using errcode='22023'; end if;
  insert into public.tea_order_items(
   order_id,menu_item_id,item_name,unit_gil,quantity,line_gil
  ) values(v_order,v_menu_item,v_menu.name,v_menu.price_gil,v_quantity,
    v_menu.price_gil::bigint*v_quantity::bigint);
 end loop;
 update public.tea_orders set total_gil=v_total where id=v_order;
 return v_order;
end
$function$;
revoke all on function private.submit_tea_order(text,text,jsonb) from public;
grant execute on function private.submit_tea_order(text,text,jsonb) to anon,authenticated;

create or replace function public.submit_tea_order(
 p_guest_name text,p_guest_world text,p_items jsonb)
returns uuid language sql security invoker set search_path=''
as $function$
 select private.submit_tea_order(p_guest_name,p_guest_world,p_items);
$function$;
revoke all on function public.submit_tea_order(text,text,jsonb) from public;
grant execute on function public.submit_tea_order(text,text,jsonb) to anon,authenticated;

create or replace function private.advance_tea_order(
 p_order_id uuid,p_next_status text)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_old text;
begin
 if (select auth.uid()) is null or not (
   exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()))
   or exists(select 1 from public.employee_accounts e
    where e.user_id=(select auth.uid()) and e.active=true
    and 'orders.manage'=any(e.permissions))
 ) then raise exception '沒有訂單處理權限' using errcode='42501'; end if;
 if p_order_id is null then raise exception '訂單編號不正確' using errcode='22023'; end if;
 select status into v_old from public.tea_orders where id=p_order_id for update;
 if not found then raise exception '找不到這筆訂單' using errcode='P0002'; end if;
 if not (
  (v_old='pending' and p_next_status in ('preparing','cancelled'))
  or (v_old='preparing' and p_next_status in ('completed','cancelled'))
 ) then raise exception '訂單狀態已更新，請重新整理確認' using errcode='22023'; end if;
 update public.tea_orders set status=p_next_status,updated_at=pg_catalog.now()
 where id=p_order_id;
end
$function$;
revoke all on function private.advance_tea_order(uuid,text) from public,anon;
grant execute on function private.advance_tea_order(uuid,text) to authenticated;
create or replace function public.advance_tea_order(
 p_order_id uuid,p_next_status text)
returns void language sql security invoker set search_path=''
as $function$
 select private.advance_tea_order(p_order_id,p_next_status);
$function$;
revoke all on function public.advance_tea_order(uuid,text) from public,anon;
grant execute on function public.advance_tea_order(uuid,text) to authenticated;

-- Supabase Realtime push if publication is enabled; polling remains fallback.
do $realtime$
begin
 if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_catalog.pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename='tea_orders') then
  alter publication supabase_realtime add table public.tea_orders;
 end if;
end $realtime$;
