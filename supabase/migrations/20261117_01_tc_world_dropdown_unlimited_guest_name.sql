-- Public guest forms now use the official TC World list in a native <select>.
-- Remove the obsolete 2-48 character restriction on guest names and worlds.
-- Keep non-empty and control-character checks; preserve all existing order
-- and booking RPC business rules, throttles, authentication, and grants.
alter table public.tea_orders
 drop constraint if exists tea_orders_guest_name_check;
alter table public.tea_orders
 add constraint tea_orders_guest_name_check
 check (btrim(guest_name)<>'' and guest_name !~ '[[:cntrl:]]');

alter table public.tea_orders
 drop constraint if exists tea_orders_guest_world_check;
alter table public.tea_orders
 add constraint tea_orders_guest_world_check
 check (btrim(guest_world)<>'' and guest_world !~ '[[:cntrl:]]');

alter table public.booking_requests
 drop constraint if exists booking_requests_guest_name_check;
alter table public.booking_requests
 add constraint booking_requests_guest_name_check
 check (btrim(guest_name)<>'' and guest_name !~ '[[:cntrl:]]');

alter table public.booking_requests
 drop constraint if exists booking_requests_guest_world_check;
alter table public.booking_requests
 add constraint booking_requests_guest_world_check
 check (btrim(guest_world)<>'' and guest_world !~ '[[:cntrl:]]');

-- Preserve the deployed RPC definitions exactly except for the obsolete
-- character bounds. Do not recreate the security-sensitive functions from
-- an older migration, which could revert newer booking/order protections.
do $migration$
declare
 fn_text text;
begin
 fn_text:=pg_get_functiondef('private.submit_tea_order(text,text,jsonb)'::regprocedure);
 if position('pg_catalog.char_length(v_guest) not between 2 and 48' in fn_text)=0
   or position('pg_catalog.char_length(v_world) not between 2 and 48' in fn_text)=0 then
  raise exception 'Tea submission function changed; inspect live validation before migrating';
 end if;
 fn_text:=replace(fn_text,'pg_catalog.char_length(v_guest) not between 2 and 48','v_guest = ''''');
 fn_text:=replace(fn_text,'pg_catalog.char_length(v_world) not between 2 and 48','v_world = ''''');
 fn_text:=replace(fn_text,'請填寫 2～48 字的旅人姓名與伺服器','請填寫旅人角色姓名與所在伺服器');
 execute fn_text;

 fn_text:=pg_get_functiondef('public.submit_booking_request(text,text,uuid,uuid[],text)'::regprocedure);
 if position('char_length(v_guest) not between 2 and 48' in fn_text)=0
   or position('char_length(v_world) not between 2 and 48' in fn_text)=0 then
  raise exception 'Booking submission function changed; inspect live validation before migrating';
 end if;
 fn_text:=replace(fn_text,'char_length(v_guest) not between 2 and 48','v_guest = ''''');
 fn_text:=replace(fn_text,'char_length(v_world) not between 2 and 48','v_world = ''''');
 fn_text:=replace(fn_text,'請確認角色姓名、伺服器與備註長度','請確認角色姓名、伺服器與備註內容');
 execute fn_text;
end
$migration$;
