-- A booking operator must be able to see unpublished/stale staff when
-- deciding a previously submitted nomination. Otherwise an INVOKER RPC
-- could fail to detect a newly hidden person because ordinary public RLS
-- hides that row. This policy grants SELECT only, never staff editing.
drop policy if exists "booking operator reads staff for validation" on public.staff;
create policy "booking operator reads staff for validation" on public.staff
 for select to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));
