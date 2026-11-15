-- KOGAKURE: owner-controlled delegation of the full accounting module.
-- Only the owner may assign/remove accounting.manage using the existing
-- manage-employee-accounts Edge Function. No employees can edit permissions.
-- No existing Gil entries or employee accounts are modified by this migration.

alter table public.employee_accounts
 drop constraint if exists employee_accounts_permissions_check;
alter table public.employee_accounts
 add constraint employee_accounts_permissions_check
 check (permissions <@ array[
  'staff.manage','menu.manage','booking.manage','orders.manage','accounting.manage'
 ]::text[]);

-- Keep the helper SECURITY INVOKER and limited to recognized module IDs.
create or replace function public.has_backoffice_permission(p_permission text)
returns boolean language sql stable security invoker set search_path=''
as $function$
 select (select public.is_site_admin())
 or (
  p_permission = any(array[
   'staff.manage','menu.manage','booking.manage','orders.manage','accounting.manage'
  ]::text[])
  and exists(select 1 from public.employee_accounts e
   where e.user_id=(select auth.uid())
   and e.active=true and p_permission=any(e.permissions))
 );
$function$;
revoke all on function public.has_backoffice_permission(text) from public,anon;
grant execute on function public.has_backoffice_permission(text) to authenticated;

-- An employee who used to handle accounting may later be deleted. Preserve all
-- historical ledger rows rather than letting the Auth user deletion fail or
-- cascade into financial history. The creator field then becomes NULL.
alter table public.accounting_entries
 alter column created_by drop not null;
alter table public.accounting_entries
 drop constraint if exists accounting_entries_created_by_fkey;
alter table public.accounting_entries
 add constraint accounting_entries_created_by_fkey
 foreign key (created_by) references auth.users(id) on delete set null;

-- Existing access policies were owner-only. Replace them with the same
-- *single explicitly assigned* accounting.manage permission for each operation.
-- SELECT is needed for UPDATE/DELETE RETURNING and existing page refresh.
drop policy if exists "owners read accounting entries" on public.accounting_entries;
drop policy if exists "owners record accounting entries" on public.accounting_entries;
drop policy if exists "owners edit accounting entries" on public.accounting_entries;
drop policy if exists "owners remove accounting entries" on public.accounting_entries;

create policy "accounting operators read entries"
 on public.accounting_entries for select to authenticated
 using ((select public.has_backoffice_permission('accounting.manage')));

create policy "accounting operators record entries"
 on public.accounting_entries for insert to authenticated
 with check (
  (select public.has_backoffice_permission('accounting.manage'))
  and created_by=(select auth.uid())
 );

create policy "accounting operators edit entries"
 on public.accounting_entries for update to authenticated
 using ((select public.has_backoffice_permission('accounting.manage')))
 with check ((select public.has_backoffice_permission('accounting.manage')));

create policy "accounting operators remove entries"
 on public.accounting_entries for delete to authenticated
 using ((select public.has_backoffice_permission('accounting.manage')));

-- Retain column-level INSERT/UPDATE GRANTs, preventing direct mutation of
-- created_by and audit timestamps; keep anon denied and RLS enabled.
revoke all on public.accounting_entries from anon;
alter table public.accounting_entries enable row level security;
comment on table public.accounting_entries is
 'Manually recorded Gil ledger, accessible only to the owner or active employees explicitly granted accounting.manage; deleted creator accounts do not erase entries.';
