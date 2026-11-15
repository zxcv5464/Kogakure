-- An FK ON DELETE SET NULL may run while the actor is not postgres.
-- Permit only that audited change; never let employees spoof PAYROLL references.
create or replace function private.reserve_payroll_reference()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if new.reference like 'PAYROLL:%' and current_user<>'postgres' then
  if tg_op='UPDATE'
   and old.created_by is distinct from new.created_by
   and new.created_by is null
   and old.id=new.id and old.entry_date=new.entry_date
   and old.kind=new.kind and old.category=new.category
   and old.amount_gil=new.amount_gil
   and old.description=new.description
   and old.reference=new.reference
   and old.created_at=new.created_at then
   return new;
  end if;
  raise exception '薪資參考編號只能由分薪系統產生'
   using errcode='42501';
 end if;
 return new;
end
$function$;
