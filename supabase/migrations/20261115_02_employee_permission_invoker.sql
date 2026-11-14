-- Reduce employee permission helper privileges after adding table grants and RLS.
-- Authenticated callers can SELECT their own employee_accounts row and their own
-- admin_users membership; therefore no SECURITY DEFINER privileges are required.
-- All existing checks remain; only execution identity changes.
alter function public.has_backoffice_permission(text) security invoker;
revoke all on function public.has_backoffice_permission(text) from public,anon;
grant execute on function public.has_backoffice_permission(text) to authenticated;
