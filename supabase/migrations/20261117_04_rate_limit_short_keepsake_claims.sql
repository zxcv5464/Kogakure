-- 狐隱｜短版 4 位數領取碼的公開查詢配額防護
-- The public endpoint is unauthenticated. The date/photo count prefix is
-- predictable, so cap both a client and the whole short-code prefix.
-- No claim rows, photo paths, encrypted codes or expiry dates are modified.
create table if not exists private.keepsake_lookup_quota(
 bucket text primary key check (bucket ~ '^(client|group):[a-f0-9]{64}$'),
 window_started_at timestamptz not null default now(),
 hits integer not null default 0 check(hits>=0)
);
alter table private.keepsake_lookup_quota enable row level security;
revoke all on private.keepsake_lookup_quota from public,anon,authenticated;

-- Atomic counters make parallel brute-force requests consume the same quota.
-- Per IP: max 8/hour. Per short-code date+count prefix: max 20/24 hours.
create or replace function public.reserve_keepsake_lookup(
 p_client_hash text,p_prefix_hash text
) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_allowed boolean;
begin
 if p_client_hash !~ '^[a-f0-9]{64}$'
  or p_prefix_hash !~ '^[a-f0-9]{64}$'
  or p_client_hash is null or p_prefix_hash is null then
  return false;
 end if;
 with counted as (
  insert into private.keepsake_lookup_quota(bucket,window_started_at,hits)
  values ('client:'||p_client_hash,now(),1),('group:'||p_prefix_hash,now(),1)
  on conflict (bucket) do update set
   hits=case
    when private.keepsake_lookup_quota.window_started_at <= now() -
     (case when private.keepsake_lookup_quota.bucket like 'client:%'
       then interval '1 hour' else interval '24 hours' end)
     then 1 else private.keepsake_lookup_quota.hits+1 end,
   window_started_at=case
    when private.keepsake_lookup_quota.window_started_at <= now() -
     (case when private.keepsake_lookup_quota.bucket like 'client:%'
       then interval '1 hour' else interval '24 hours' end)
     then now() else private.keepsake_lookup_quota.window_started_at end
  returning bucket,hits
 )
 select bool_and(case when bucket like 'client:%' then hits<=8 else hits<=20 end)
 into v_allowed from counted;
 return coalesce(v_allowed,false);
end;
$$;
revoke all on function public.reserve_keepsake_lookup(text,text)
 from public,anon,authenticated;
grant execute on function public.reserve_keepsake_lookup(text,text) to service_role;

-- Called by the existing ten-minute expiry cleanup task; keeps IP-derived
-- hash records bounded without exposing them to the public Data API.
create or replace function public.purge_keepsake_lookup_quota()
returns integer
language plpgsql security definer set search_path='' as $$
declare v_deleted integer;
begin
 delete from private.keepsake_lookup_quota
  where window_started_at < now()-interval '48 hours';
 get diagnostics v_deleted=row_count;
 return v_deleted;
end;
$$;
revoke all on function public.purge_keepsake_lookup_quota()
 from public,anon,authenticated;
grant execute on function public.purge_keepsake_lookup_quota() to service_role;
