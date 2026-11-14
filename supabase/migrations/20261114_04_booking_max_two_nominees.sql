-- 狐隱：每筆指名最多主要 1 位 + 追加 1 位，不更動既有預約資料。
-- Existing accepted/completed reservations with more nominees remain untouched.
-- Only update the quantity guard in public and admin create RPCs.
-- Preserve permissions, data validation, rate-limits, admin authentication and transaction integrity.

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
 if p_staff_ids is null or coalesce(array_length(p_staff_ids,1),0) not between 1 and 2
 then raise exception '每筆預約最多指名兩位館員（主要指名＋追加一位）' using errcode='22023'; end if;
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
 if p_staff_ids is null or coalesce(array_length(p_staff_ids,1),0) not between 1 and 2
 then raise exception '每筆預約只能指名 1～2 位館員（最多追加一位）' using errcode='22023'; end if;
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

revoke all on function public.submit_booking_request(text,text,uuid,uuid[],text) from public;
grant execute on function public.submit_booking_request(text,text,uuid,uuid[],text) to anon,authenticated;
revoke all on function public.admin_create_booking_request(text,text,uuid,uuid[],text) from public,anon;
grant execute on function public.admin_create_booking_request(text,text,uuid,uuid[],text) to authenticated;
