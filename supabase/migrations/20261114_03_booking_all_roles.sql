-- 狐隱：指名資格由名帖公開 + 後台「在預約頁面顯示」開關決定，與職稱無關。
-- This migration updates the validation of the three booking RPCs only.
-- No new grants, no table changes, and no changes to existing staff or bookings.
-- Preserve the original public submission rate limits, admin authorization
-- checks, transaction locks, busy state and plan timing.
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
 where s.id=any(v_staff_ids) and s.is_published=true and s.is_booking_visible=true;
 if v_count<>array_length(v_staff_ids,1)
 then raise exception '指定館員已停止開放指名，請重新整理' using errcode='22023'; end if;
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
 if exists(select 1 from public.staff s where s.id=any(v_ids) and (not s.is_published or not s.is_booking_visible))
 then raise exception '有館員已停止公開或指名，無法接取' using errcode='P0001'; end if;
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

create or replace function public.admin_create_booking_request(
 p_guest_name text, p_guest_world text, p_plan_id uuid,
 p_staff_ids uuid[], p_note text default ''
) returns uuid language plpgsql security invoker set search_path = ''
as $function$
declare
 v_guest text:=btrim(coalesce(p_guest_name,''));
 v_world text:=btrim(coalesce(p_guest_world,''));
 v_note text:=btrim(coalesce(p_note,''));
 v_ids uuid[];
 v_plan record;
 v_id uuid;
 v_count integer;
begin
 if not public.is_site_admin() then
  raise exception '只有館方管理員可以建立預約' using errcode='42501';
 end if;
 if char_length(v_guest) not between 2 and 48 or char_length(v_world) not between 2 and 48
   or v_guest ~ '[[:cntrl:]]' or v_world ~ '[[:cntrl:]]'
   or char_length(v_note)>240 or v_note ~ '[[:cntrl:]]'
 then raise exception '請確認角色姓名、伺服器與備註長度' using errcode='22023'; end if;
 if p_staff_ids is null or coalesce(array_length(p_staff_ids,1),0) not between 1 and 4
 then raise exception '每筆申請需要 1～4 位狐姬' using errcode='22023'; end if;
 if array_position(p_staff_ids,null) is not null or
   (select count(distinct x) from unnest(p_staff_ids) as x)<>array_length(p_staff_ids,1)
 then raise exception '指名狐姬不可重複' using errcode='22023'; end if;
 select p.id,p.name,p.duration_minutes,p.price_gil into v_plan
 from public.booking_plans p where p.id=p_plan_id;
 if not found then raise exception '所選指名方案不存在' using errcode='22023'; end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_staff_ids) as x;
 select count(*) into v_count from public.staff s
 where s.id=any(v_ids) and s.is_published and s.is_booking_visible;
 if v_count <> array_length(v_ids,1) then
  raise exception '部分館員未開放指名，請重新整理' using errcode='22023';
 end if;
 insert into public.booking_requests(guest_name,guest_world,note,plan_id,plan_name,duration_minutes,price_gil)
 values(v_guest,v_world,v_note,v_plan.id,v_plan.name,v_plan.duration_minutes,v_plan.price_gil)
 returning id into v_id;
 insert into public.booking_request_staff(booking_id,staff_id,staff_name)
 select v_id,s.id,s.display_name from public.staff s where s.id=any(v_ids);
 return v_id;
end;
$function$;
-- Re-assert the existing explicit EXECUTE grants after function replacement.
revoke all on function public.submit_booking_request(text,text,uuid,uuid[],text) from public;
grant execute on function public.submit_booking_request(text,text,uuid,uuid[],text) to anon,authenticated;
revoke all on function public.decide_booking_request(uuid,text) from public,anon;
grant execute on function public.decide_booking_request(uuid,text) to authenticated;
revoke all on function public.admin_create_booking_request(text,text,uuid,uuid[],text) from public,anon;
grant execute on function public.admin_create_booking_request(text,text,uuid,uuid[],text) to authenticated;
