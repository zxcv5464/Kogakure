-- Keep immutable paid-salary ledger rows, while still allowing deletion of
-- a former employee's Auth login (created_by is intentionally SET NULL).
-- Restrict spoofed payroll references to the trusted server-side RPC only.
create or replace function private.protect_payroll_expense()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if exists(select 1 from public.payroll_allocations p
  where p.accounting_entry_id=old.id) then
  if tg_op='UPDATE'
   and old.created_by is distinct from new.created_by
   and new.created_by is null
   and old.id=new.id and old.entry_date=new.entry_date
   and old.kind=new.kind and old.category=new.category
   and old.amount_gil=new.amount_gil
   and old.description=new.description
   and old.reference=new.reference
   and old.created_at=new.created_at then
    -- ON DELETE SET NULL of the related Auth user: no change to money,
    -- date, category, reference or original recording timestamp.
    return new;
  end if;
  raise exception '此筆為已發薪紀錄，不能直接編輯或刪除'
   using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end
$function$;

create or replace function private.reserve_payroll_reference()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if new.reference like 'PAYROLL:%'
  and current_user<>'postgres' then
  raise exception '薪資參考編號只能由分薪系統產生'
   using errcode='42501';
 end if;
 return new;
end
$function$;
drop trigger if exists reserve_payroll_reference on public.accounting_entries;
create trigger reserve_payroll_reference before insert or update
 on public.accounting_entries for each row
 execute function private.reserve_payroll_reference();
