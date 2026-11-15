-- Keep staff.manage and booking.manage independently scoped.
-- General profile editors may update staff biography/photos, but must not
-- bypass the narrow, authorized set_staff_booking_rules(...) RPC.
create or replace function private.protect_staff_booking_rule_fields()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if (new.booking_allowed_plan_ids is distinct from old.booking_allowed_plan_ids
    or new.booking_allow_joint is distinct from old.booking_allow_joint)
    and current_user not in ('postgres','service_role') then
  raise exception '狐姬可接受方案與同時指名僅可由預約管理功能設定'
   using errcode='42501';
 end if;
 return new;
end;
$function$;
revoke all on function private.protect_staff_booking_rule_fields() from public,anon,authenticated;
drop trigger if exists staff_protect_booking_rule_fields on public.staff;
create trigger staff_protect_booking_rule_fields
 before update on public.staff for each row
 execute function private.protect_staff_booking_rule_fields();
