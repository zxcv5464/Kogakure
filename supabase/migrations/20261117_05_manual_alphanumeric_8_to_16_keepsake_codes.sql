-- 狐隱｜後台自行設定 8～16 位英數領取碼。
-- Keep the unchanged code-reveal RPC and all historical hashes and encrypted
-- values intact. Old guest links (including hyphenated long codes) remain valid.
-- New create/update values accept ONLY A–Z and 0–9, with no separators.
create or replace function public.create_keepsake_claim(
 p_guest_label text, p_note text, p_code text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_guest text:=btrim(coalesce(p_guest_label,''));
 v_note text:=btrim(coalesce(p_note,''));
 v_display text:=upper(btrim(coalesce(p_code,'')));
 v_normalized text:=lower(v_display);
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
 if v_display !~ '^[A-Z0-9]{8,16}$' then
  raise exception '領取碼須為 8～16 位英文字母或數字，不可包含其他符號';
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
 v_normalized text:=lower(v_display);
 v_secret text;
 v_claim_id uuid;
begin
 if (select auth.uid()) is null or
  not coalesce((select public.has_backoffice_permission('keepsakes.manage')),false) then
  raise exception '沒有狐影留帖管理權限' using errcode='42501';
 end if;
 if v_display !~ '^[A-Z0-9]{8,16}$' then
  raise exception '領取碼須為 8～16 位英文字母或數字，不可包含其他符號';
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

