-- 狐隱｜由後台設定專屬領取碼；保留既有 32 位舊碼與七天交付記錄。
-- Operators can choose 12-32 ASCII letters/digits, optionally grouped with hyphens.
-- Codes are normalized for lookup and uniqueness; only private encrypted display
-- values may be revealed by authorized backoffice staff.
create or replace function public.create_keepsake_claim(
 p_guest_label text, p_note text, p_code text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_guest text:=btrim(coalesce(p_guest_label,''));
 v_note text:=btrim(coalesce(p_note,''));
 v_display text:=upper(btrim(coalesce(p_code,'')));
 v_normalized text:=lower(replace(v_display,'-',''));
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
 if char_length(v_display)>48
  or v_display !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
  or char_length(v_normalized) not between 12 and 32 then
  raise exception '領取碼須為 12～32 位英文字母或數字，可使用連字號分組';
 end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets
  where name='kogakure_keepsake_code_key';
 if v_secret is null then raise exception '領取碼加密設定尚未完成'; end if;
 insert into public.keepsake_claims (guest_label,note,token_sha256)
 values(v_guest,v_note,encode(extensions.digest(v_normalized,'sha256'),'hex'))
 returning id into v_claim_id;
 insert into private.keepsake_claim_codes(claim_id,encrypted_code)
 values(v_claim_id,extensions.pgp_sym_encrypt(v_display,v_secret,'cipher-algo=aes256'));
 return v_claim_id;
exception when unique_violation then
 raise exception '此領取碼已被使用，請更換一組' using errcode='23505';
end;
$$;
revoke all on function public.create_keepsake_claim(text,text,text) from public,anon,authenticated;
grant execute on function public.create_keepsake_claim(text,text,text) to authenticated;

-- Changing a code updates the digest and encrypted display atomically, never the
-- claim ID, photos, creation time, expiration, or private storage permissions.
create or replace function public.update_keepsake_claim_code(
 p_claim_id uuid, p_code text
) returns text
language plpgsql security definer set search_path='' as $$
declare
 v_display text:=upper(btrim(coalesce(p_code,'')));
 v_normalized text:=lower(replace(v_display,'-',''));
 v_secret text;
 v_claim_id uuid;
begin
 if (select auth.uid()) is null or
  not coalesce((select public.has_backoffice_permission('keepsakes.manage')),false) then
  raise exception '沒有狐影留帖管理權限' using errcode='42501';
 end if;
 if char_length(v_display)>48
  or v_display !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
  or char_length(v_normalized) not between 12 and 32 then
  raise exception '領取碼須為 12～32 位英文字母或數字，可使用連字號分組';
 end if;
 select id into v_claim_id
 from public.keepsake_claims
 where id=p_claim_id and expires_at>now()
 for update;
 if v_claim_id is null then
  raise exception '交付單不存在或已過期，無法修改領取碼';
 end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets
  where name='kogakure_keepsake_code_key';
 if v_secret is null then raise exception '領取碼加密設定尚未完成'; end if;
 update public.keepsake_claims set
  token_sha256=encode(extensions.digest(v_normalized,'sha256'),'hex')
 where id=v_claim_id;
 update private.keepsake_claim_codes set
  encrypted_code=extensions.pgp_sym_encrypt(v_display,v_secret,'cipher-algo=aes256')
 where claim_id=v_claim_id;
 if not found then raise exception '交付單尚無可更新的領取碼'; end if;
 return v_display;
exception when unique_violation then
 raise exception '此領取碼已被使用，請更換一組' using errcode='23505';
end;
$$;
revoke all on function public.update_keepsake_claim_code(uuid,text) from public,anon,authenticated;
grant execute on function public.update_keepsake_claim_code(uuid,text) to authenticated;

-- Existing encrypted 32-hex tokens are restored to their previous 8-8-8-8
-- grouped display. New custom labels retain the operator's chosen separators.
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
 if v_plain ~ '^[a-f0-9]{32}$' then
  return upper(substring(v_plain,1,8)||'-'||substring(v_plain,9,8)||'-'||
   substring(v_plain,17,8)||'-'||substring(v_plain,25,8));
 end if;
 return upper(v_plain);
end;
$$;
revoke all on function public.reveal_keepsake_claim_code(uuid) from public,anon,authenticated;
grant execute on function public.reveal_keepsake_claim_code(uuid) to authenticated;
