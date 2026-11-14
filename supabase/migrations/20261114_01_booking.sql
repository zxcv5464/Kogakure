-- 狐隱・即時狐姬指名。僅新增資料表、RLS 與受控 RPC；不修改既有 staff / menu。
-- 依賴 public.staff、public.is_site_admin()、public.set_updated_at()。
-- 請先確認連線到正確的狐隱 Supabase 專案並完成備份。
create table if not exists public.booking_plans (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 70),
 description text not null default '',
 duration_minutes integer not null check (duration_minutes between 5 and 240),
 price_gil integer check (price_gil between 0 and 999999999),
 sort_order integer not null default 100,
 is_active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.booking_requests (
 id uuid primary key default gen_random_uuid(),
 guest_name text not null check (char_length(btrim(guest_name)) between 2 and 48),
 guest_world text not null check (char_length(btrim(guest_world)) between 2 and 48),
 note text not null default '' check (char_length(note) <= 240),
 plan_id uuid not null references public.booking_plans(id) on delete restrict,
 plan_name text not null,
 duration_minutes integer not null check (duration_minutes between 5 and 240),
 price_gil integer check (price_gil between 0 and 999999999),
 status text not null default 'pending' check (status in ('pending','accepted','rejected','completed')),
 created_at timestamptz not null default now(),
 accepted_at timestamptz,
 ends_at timestamptz,
 completed_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.booking_request_staff (
 booking_id uuid not null references public.booking_requests(id) on delete cascade,
 staff_id uuid not null references public.staff(id) on delete restrict,
 staff_name text not null,
 primary key (booking_id,staff_id)
);
-- No guest name, booking ID, or private request data is exposed on this table.
create table if not exists public.staff_booking_presence (
 staff_id uuid primary key references public.staff(id) on delete cascade,
 busy_until timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists booking_requests_status_created_idx on public.booking_requests(status, created_at desc);
create index if not exists booking_request_staff_staff_idx on public.booking_request_staff(staff_id);
create index if not exists booking_plans_published_order_idx on public.booking_plans(is_active,sort_order);
create index if not exists staff_booking_presence_until_idx on public.staff_booking_presence(busy_until);

drop trigger if exists booking_plans_updated_at on public.booking_plans;
create trigger booking_plans_updated_at before update on public.booking_plans
 for each row execute function public.set_updated_at();
drop trigger if exists booking_requests_updated_at on public.booking_requests;
create trigger booking_requests_updated_at before update on public.booking_requests
 for each row execute function public.set_updated_at();
drop trigger if exists staff_booking_presence_updated_at on public.staff_booking_presence;
create trigger staff_booking_presence_updated_at before update on public.staff_booking_presence
 for each row execute function public.set_updated_at();

alter table public.booking_plans enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_request_staff enable row level security;
alter table public.staff_booking_presence enable row level security;

drop policy if exists "published plans visible" on public.booking_plans;
create policy "published plans visible" on public.booking_plans for select to anon,authenticated
 using (is_active);
drop policy if exists "admins select plans" on public.booking_plans;
create policy "admins select plans" on public.booking_plans for select to authenticated
 using ((select public.is_site_admin()));
drop policy if exists "admins insert plans" on public.booking_plans;
create policy "admins insert plans" on public.booking_plans for insert to authenticated
 with check ((select public.is_site_admin()));
drop policy if exists "admins update plans" on public.booking_plans;
create policy "admins update plans" on public.booking_plans for update to authenticated
 using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
drop policy if exists "admins delete plans" on public.booking_plans;
create policy "admins delete plans" on public.booking_plans for delete to authenticated
 using ((select public.is_site_admin()));

drop policy if exists "admins read booking requests" on public.booking_requests;
create policy "admins read booking requests" on public.booking_requests for select to authenticated
 using ((select public.is_site_admin()));
drop policy if exists "admins update booking requests" on public.booking_requests;
create policy "admins update booking requests" on public.booking_requests for update to authenticated
 using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
drop policy if exists "admins read booking selections" on public.booking_request_staff;
create policy "admins read booking selections" on public.booking_request_staff for select to authenticated
 using ((select public.is_site_admin()));

drop policy if exists "public read published staff presence" on public.staff_booking_presence;
create policy "public read published staff presence" on public.staff_booking_presence for select to anon,authenticated
 using (exists (select 1 from public.staff s where s.id=staff_id and s.is_published));
drop policy if exists "admins read staff presence" on public.staff_booking_presence;
create policy "admins read staff presence" on public.staff_booking_presence for select to authenticated
 using ((select public.is_site_admin()));
drop policy if exists "admins insert staff presence" on public.staff_booking_presence;
create policy "admins insert staff presence" on public.staff_booking_presence for insert to authenticated
 with check ((select public.is_site_admin()));
drop policy if exists "admins update staff presence" on public.staff_booking_presence;
create policy "admins update staff presence" on public.staff_booking_presence for update to authenticated
 using ((select public.is_site_admin())) with check ((select public.is_site_admin()));

-- Explicit table grants: anonymous visitors cannot browse guest names or requests.
revoke all on public.booking_requests, public.booking_request_staff from anon;
revoke all on public.booking_plans, public.staff_booking_presence from anon;
revoke all on public.booking_requests, public.booking_request_staff from authenticated;
revoke all on public.booking_plans, public.staff_booking_presence from authenticated;
grant select on public.booking_plans, public.staff_booking_presence to anon,authenticated;
grant select,insert,update,delete on public.booking_plans to authenticated;
grant select,update on public.booking_requests to authenticated;
grant select on public.booking_request_staff to authenticated;
grant insert,update on public.staff_booking_presence to authenticated;

-- Public submissions need a narrowly-scoped SECURITY DEFINER RPC: visitors have
-- no table INSERT or SELECT rights to any guest data. Never return other guests.
create or replace function public.submit_booking_request(
 p_guest_name text, p_guest_world text, p_plan_id uuid,
 p_staff_ids uuid[], p_note text default ''
) returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
 v_guest text := btrim(coalesce(p_guest_name,''));
 v_world text := btrim(coalesce(p_guest_world,''));
 v_note text := btrim(coalesce(p_note,''));
 v_staff_ids uuid[];
 v_count integer;
 v_plan record;
 v_id uuid;
begin
 if char_length(v_guest) not between 2 and 48
    or char_length(v_world) not between 2 and 48
    or v_guest ~ '[[:cntrl:]]' or v_world ~ '[[:cntrl:]]'
    or char_length(v_note)>240 or v_note ~ '[[:cntrl:]]'
 then raise exception '請確認角色姓名、伺服器與備註長度' using errcode='22023'; end if;
 if p_staff_ids is null or coalesce(array_length(p_staff_ids,1),0) not between 1 and 4
 then raise exception '一次最多選擇四位狐姬' using errcode='22023'; end if;
 select array_agg(distinct x order by x) into v_staff_ids from unnest(p_staff_ids) as x;
 if coalesce(array_length(v_staff_ids,1),0) <> array_length(p_staff_ids,1) or array_position(p_staff_ids,null) is not null
 then raise exception '請勿重複指名相同狐姬' using errcode='22023'; end if;
 select p.id,p.name,p.duration_minutes,p.price_gil into v_plan
 from public.booking_plans p where p.id=p_plan_id and p.is_active=true;
 if not found then raise exception '指名方案已變更，請重新整理' using errcode='22023'; end if;
 select count(*) into v_count from public.staff s
 where s.id=any(v_staff_ids) and s.is_published=true and s.role like '%狐姬%';
 if v_count<>array_length(v_staff_ids,1)
 then raise exception '指定狐姬已不開放，請重新整理' using errcode='22023'; end if;
 if exists(select 1 from public.staff_booking_presence o
           where o.staff_id=any(v_staff_ids) and o.busy_until>now())
 then raise exception '部分狐姬正在指名中，請重新選擇' using errcode='22023'; end if;
 -- A small abuse guard; does not replace CAPTCHA / CDN rate limiting.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(v_guest)||'|'||lower(v_world),0));
 if exists(select 1 from public.booking_requests b where lower(b.guest_name)=lower(v_guest)
   and lower(b.guest_world)=lower(v_world)
   and b.created_at>now()-interval '10 minutes' and b.status='pending')
 then raise exception '已收到待審核指名，請勿重複送出' using errcode='22023'; end if;
 if (select count(*) from public.booking_requests b
     where b.status='pending' and b.created_at>now()-interval '1 hour') >= 150
 then raise exception '館內目前申請較多，請稍後再試' using errcode='P0001'; end if;
 insert into public.booking_requests(
  guest_name,guest_world,note,plan_id,plan_name,duration_minutes,price_gil
 ) values (v_guest,v_world,v_note,v_plan.id,v_plan.name,v_plan.duration_minutes,v_plan.price_gil)
 returning id into v_id;
 insert into public.booking_request_staff(booking_id,staff_id,staff_name)
 select v_id,s.id,s.display_name from public.staff s where s.id=any(v_staff_ids);
 return v_id;
end;
$function$;
revoke all on function public.submit_booking_request(text,text,uuid,uuid[],text) from public;
grant execute on function public.submit_booking_request(text,text,uuid,uuid[],text) to anon,authenticated;

-- Admin-only atomic acceptance: staff are locked in deterministic UUID order.
-- The same transaction changes reservation status and public busy indicators.
create or replace function public.decide_booking_request(
 p_booking_id uuid, p_action text
) returns void language plpgsql security invoker set search_path = ''
as $function$
declare
 v_booking public.booking_requests%rowtype;
 v_ids uuid[];
 v_now timestamptz := clock_timestamp();
 v_end timestamptz;
begin
 if not public.is_site_admin() then
  raise exception '管理權限不足' using errcode='42501';
 end if;
 if p_action not in ('accept','reject','complete') then
  raise exception '不支援的預約處理方式' using errcode='22023';
 end if;
 select * into v_booking from public.booking_requests where id=p_booking_id for update;
 if not found then raise exception '預約不存在' using errcode='22023'; end if;
 if p_action='reject' then
  if v_booking.status<>'pending' then
   raise exception '此預約已處理，請更新清單' using errcode='P0001'; end if;
  update public.booking_requests set status='rejected' where id=p_booking_id;
  return;
 end if;
 if p_action='complete' then
  if v_booking.status<>'accepted' then
   raise exception '此預約尚未接取或已結束' using errcode='P0001'; end if;
  update public.booking_requests set status='completed',completed_at=v_now where id=p_booking_id;
  update public.staff_booking_presence o set busy_until=null
    where o.staff_id in(select l.staff_id from public.booking_request_staff l where l.booking_id=p_booking_id)
    and o.busy_until=v_booking.ends_at;
  return;
 end if;
 if v_booking.status<>'pending' then
  raise exception '此預約已處理，請更新清單' using errcode='P0001'; end if;
 select array_agg(l.staff_id order by l.staff_id) into v_ids
 from public.booking_request_staff l where l.booking_id=p_booking_id;
 if coalesce(array_length(v_ids,1),0)=0 then
  raise exception '沒有可接取的狐姬' using errcode='P0001'; end if;
 if exists(select 1 from public.staff s where s.id=any(v_ids) and (not s.is_published or s.role not like '%狐姬%'))
 then raise exception '有狐姬已取消公開，無法接取' using errcode='P0001'; end if;
 insert into public.staff_booking_presence(staff_id) select unnest(v_ids)
  on conflict(staff_id) do nothing;
 -- Locks serialize competing admins booking the same fox maid.
 perform 1 from public.staff_booking_presence o
  where o.staff_id=any(v_ids) order by o.staff_id for update;
 if exists(select 1 from public.staff_booking_presence o
           where o.staff_id=any(v_ids) and o.busy_until>v_now)
 then raise exception '部分狐姬正在指名中，無法重複接取' using errcode='P0001'; end if;
 v_end:=v_now+make_interval(mins=>v_booking.duration_minutes);
 update public.booking_requests set status='accepted',accepted_at=v_now,ends_at=v_end
 where id=p_booking_id;
 update public.staff_booking_presence set busy_until=v_end where staff_id=any(v_ids);
end;
$function$;
revoke all on function public.decide_booking_request(uuid,text) from public,anon;
grant execute on function public.decide_booking_request(uuid,text) to authenticated;

-- Configurable starter durations only; do not invent Gil prices.
-- Admin should review/rename plans and set any official fees before opening.
insert into public.booking_plans(id,name,description,duration_minutes,price_gil,sort_order,is_active)
values
 ('a7000000-0000-4000-8000-000000000001','狐姬指名・30 分鐘','指名體驗方案（初始範例，實際內容依館方確認）',30,null,10,false),
 ('a7000000-0000-4000-8000-000000000002','狐姬指名・60 分鐘','指名體驗方案（初始範例，實際內容依館方確認）',60,null,20,false)
on conflict(id) do nothing;

-- Supabase Realtime: use server-side RLS for bookings; public sees ONLY occupancy.
do $block$
begin
 if exists (select 1 from pg_catalog.pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_catalog.pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='booking_requests') then
   alter publication supabase_realtime add table public.booking_requests;
  end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='staff_booking_presence') then
   alter publication supabase_realtime add table public.staff_booking_presence;
  end if;
 end if;
end;
$block$;
