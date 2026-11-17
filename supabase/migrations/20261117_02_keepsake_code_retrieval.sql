-- 狐隱｜可重複取回的拍立得領取碼
-- A code is stored encrypted in a private schema, not in the public claim row.
-- Only active backoffice operators holding keepsakes.manage can reveal it.
create table if not exists private.keepsake_claim_codes (
 claim_id uuid primary key references public.keepsake_claims(id) on delete cascade,
 encrypted_code bytea not null,
 created_at timestamptz not null default now()
);
alter table private.keepsake_claim_codes enable row level security;
revoke all on private.keepsake_claim_codes from public, anon, authenticated;

do $$
begin
 if not exists(select 1 from vault.secrets where name='kogakure_keepsake_code_key') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
   'kogakure_keepsake_code_key','Private traveler photo claim codes encryption key');
 end if;
end;
$$;

-- Block legacy direct inserts into claims without a matching encrypted code.
-- Photos and claimed records remain available through existing scoped policies.
revoke insert,update on public.keepsake_claims from authenticated;
drop policy if exists "keepsake operators create claims" on public.keepsake_claims;
drop policy if exists "keepsake operators update claims" on public.keepsake_claims;

create or replace function public.create_keepsake_claim(
 p_guest_label text, p_note text, p_code text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_guest text:=btrim(coalesce(p_guest_label,''));
 v_note text:=btrim(coalesce(p_note,''));
 v_code text:=lower(btrim(coalesce(p_code,'')));
 v_secret text;
 v_claim_id uuid;
begin
 if (select auth.uid()) is null or
  not coalesce((select public.has_backoffice_permission('keepsakes.manage')),false) then
  raise exception '沒有狐影留帖管理權限' using errcode='42501';
 end if;
 if char_length(v_guest) not between 1 and 100 then
  raise exception '旅人稱呼長度需為 1 至 100 字';
 end if;
 if char_length(v_note)>400 then
  raise exception '交付備註最多 400 字';
 end if;
 if v_code !~ '^[a-f0-9]{32}$' then
  raise exception '領取碼格式不正確';
 end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets
  where name='kogakure_keepsake_code_key';
 if v_secret is null then raise exception '領取碼加密設定尚未完成'; end if;
 insert into public.keepsake_claims (guest_label,note,token_sha256)
 values(v_guest,v_note,encode(extensions.digest(v_code,'sha256'),'hex'))
 returning id into v_claim_id;
 insert into private.keepsake_claim_codes(claim_id,encrypted_code)
 values(v_claim_id,extensions.pgp_sym_encrypt(v_code,v_secret,'cipher-algo=aes256'));
 return v_claim_id;
end;
$$;
revoke all on function public.create_keepsake_claim(text,text,text) from public,anon,authenticated;
grant execute on function public.create_keepsake_claim(text,text,text) to authenticated;

create or replace function public.reveal_keepsake_claim_code(p_claim_id uuid)
returns text
language plpgsql security definer set search_path='' as $$
declare
 v_secret text;
 v_encrypted bytea;
 v_plain text;
begin
 if (select auth.uid()) is null or
  not coalesce((select public.has_backoffice_permission('keepsakes.manage')),false) then
  raise exception '沒有狐影留帖管理權限' using errcode='42501';
 end if;
 select s.encrypted_code into v_encrypted
 from private.keepsake_claim_codes s
 join public.keepsake_claims c on c.id=s.claim_id
 where c.id=p_claim_id and c.expires_at>now();
 if v_encrypted is null then return null; end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets
  where name='kogakure_keepsake_code_key';
 if v_secret is null then raise exception '領取碼加密設定尚未完成'; end if;
 v_plain:=extensions.pgp_sym_decrypt(v_encrypted,v_secret);
 return upper(substring(v_plain,1,8)||'-'||substring(v_plain,9,8)||'-'||
  substring(v_plain,17,8)||'-'||substring(v_plain,25,8));
end;
$$;
revoke all on function public.reveal_keepsake_claim_code(uuid) from public,anon,authenticated;
grant execute on function public.reveal_keepsake_claim_code(uuid) to authenticated;
