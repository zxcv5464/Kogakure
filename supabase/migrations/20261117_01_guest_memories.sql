-- 狐隱｜旅人繪卷：私人拍立得交付、七日自動清除、匿名留言審核
-- All guest photos use a private bucket; only a possession-based one-time album code can request signed download URLs.
alter table public.employee_accounts drop constraint if exists employee_accounts_permissions_check;
alter table public.employee_accounts add constraint employee_accounts_permissions_check
check(permissions <@ array[
 'accounts.manage','staff.manage','announcements.manage','accounting.manage',
 'menu.manage','services.manage','orders.manage','booking.manage','shifts.manage',
 'shifts.attend','bgm.manage','keepsakes.manage','feedback.manage'
]::text[]);

create or replace function private.check_employee_backoffice_permission(p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and
 ((select public.is_site_admin()) or (
  p_permission=any(array[
   'accounts.manage','staff.manage','announcements.manage','accounting.manage',
   'menu.manage','services.manage','orders.manage','booking.manage',
   'shifts.manage','shifts.attend','bgm.manage','keepsakes.manage','feedback.manage'
  ]::text[]) and exists (
   select 1 from public.employee_accounts a
    where a.user_id=(select auth.uid()) and a.active=true
      and p_permission=any(a.permissions)
  )
 ));
$$;
revoke all on function private.check_employee_backoffice_permission(text) from public,anon,authenticated;
grant execute on function private.check_employee_backoffice_permission(text) to authenticated;

create table if not exists public.keepsake_claims(
 id uuid primary key default gen_random_uuid(),
 guest_label text not null check(char_length(btrim(guest_label)) between 1 and 100),
 token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
 note text not null default '' check(char_length(note)<=400),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '7 days'),
 constraint keepsake_expiry_window check(expires_at>created_at and expires_at<=created_at+interval '7 days')
);
create index if not exists keepsake_claim_expiry_idx on public.keepsake_claims(expires_at);
create table if not exists public.keepsake_photos(
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references public.keepsake_claims(id) on delete cascade,
 storage_path text not null unique check(char_length(storage_path) between 40 and 240),
 original_name text not null check(char_length(btrim(original_name)) between 1 and 200),
 created_at timestamptz not null default now()
);
create index if not exists keepsake_photo_claim_idx on public.keepsake_photos(claim_id);

alter table public.keepsake_claims enable row level security;
alter table public.keepsake_photos enable row level security;
revoke all on public.keepsake_claims,public.keepsake_photos from public,anon,authenticated;
grant select,insert,update,delete on public.keepsake_claims,public.keepsake_photos to authenticated;
create policy "keepsake operators read claims" on public.keepsake_claims for select to authenticated
 using((select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators create claims" on public.keepsake_claims for insert to authenticated
 with check((select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators update claims" on public.keepsake_claims for update to authenticated
 using((select public.has_backoffice_permission('keepsakes.manage')))
 with check((select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators remove claims" on public.keepsake_claims for delete to authenticated
 using((select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators read photos" on public.keepsake_photos for select to authenticated
 using((select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators create photos" on public.keepsake_photos for insert to authenticated
 with check((select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators remove photos" on public.keepsake_photos for delete to authenticated
 using((select public.has_backoffice_permission('keepsakes.manage')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('keepsake-deliveries','keepsake-deliveries',false,15728640,
 array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=15728640,allowed_mime_types=excluded.allowed_mime_types;
create policy "keepsake operators inspect private photos" on storage.objects for select to authenticated
 using(bucket_id='keepsake-deliveries' and (select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators upload private photos" on storage.objects for insert to authenticated
 with check(bucket_id='keepsake-deliveries' and (select public.has_backoffice_permission('keepsakes.manage')));
create policy "keepsake operators remove private photos" on storage.objects for delete to authenticated
 using(bucket_id='keepsake-deliveries' and (select public.has_backoffice_permission('keepsakes.manage')));

create table if not exists public.guest_feedback(
 id uuid primary key default gen_random_uuid(),
 guest_name text not null default '匿名旅人' check(char_length(btrim(guest_name)) between 1 and 70),
 is_anonymous boolean not null default true,
 message text not null check(char_length(btrim(message)) between 2 and 1000),
 reply text not null default '' check(char_length(reply)<=1000),
 status text not null default 'pending' check(status in ('pending','published','hidden')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists feedback_public_idx on public.guest_feedback(status,created_at desc);
alter table public.guest_feedback enable row level security;
revoke all on public.guest_feedback from public,anon,authenticated;
grant select on public.guest_feedback to anon,authenticated;
grant update,delete on public.guest_feedback to authenticated;
create policy "guests see approved feedback" on public.guest_feedback for select to anon,authenticated
 using(status='published');
create policy "feedback moderators see all feedback" on public.guest_feedback for select to authenticated
 using((select public.has_backoffice_permission('feedback.manage')));
create policy "feedback moderators edit feedback" on public.guest_feedback for update to authenticated
 using((select public.has_backoffice_permission('feedback.manage')))
 with check((select public.has_backoffice_permission('feedback.manage')));
create policy "feedback moderators delete feedback" on public.guest_feedback for delete to authenticated
 using((select public.has_backoffice_permission('feedback.manage')));

create or replace function public.submit_guest_feedback(p_name text,p_anonymous boolean,p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_name text;v_message text;
begin
 v_message:=btrim(coalesce(p_message,''));
 v_name:=case when coalesce(p_anonymous,true) then '匿名旅人' else btrim(coalesce(p_name,'')) end;
 if char_length(v_message) not between 2 and 1000 then
  raise exception '留言內容需介於 2 至 1000 字';
 end if;
 if char_length(v_name) not between 1 and 70 then
  raise exception '請填寫 1 至 70 字的稱呼，或使用匿名留言';
 end if;
 insert into public.guest_feedback(guest_name,is_anonymous,message)
 values(v_name,coalesce(p_anonymous,true),v_message) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.submit_guest_feedback(text,boolean,text) from public;
grant execute on function public.submit_guest_feedback(text,boolean,text) to anon,authenticated;

-- Retention job authenticates using a Vault secret, not a key shipped in the website.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$
begin
 if not exists(select 1 from vault.secrets where name='kogakure_keepsake_cleanup') then
  perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'kogakure_keepsake_cleanup','Keepsake retention task auth');
 end if;
end;
$$;
create or replace function public.keepsake_cleanup_token_valid(p_token text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_token is not null and length(p_token)=64 and exists(
  select 1 from vault.decrypted_secrets
   where name='kogakure_keepsake_cleanup' and decrypted_secret=p_token
 );
$$;
revoke all on function public.keepsake_cleanup_token_valid(text) from public,anon,authenticated;
grant execute on function public.keepsake_cleanup_token_valid(text) to service_role;

select cron.schedule('kogakure-keepsake-expiry','*/10 * * * *',$task$
 select net.http_post(
  url:='https://akocsanwytansrdptaho.supabase.co/functions/v1/guest-keepsakes',
  headers:=jsonb_build_object(
   'Content-Type','application/json',
   'x-cleanup-key',(select decrypted_secret from vault.decrypted_secrets where name='kogakure_keepsake_cleanup')
  ),
  body:='{"action":"cleanup"}'::jsonb,
  timeout_milliseconds:=15000
 );
$task$);
