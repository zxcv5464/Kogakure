-- The booking trigger runs as the authenticated booking operator. Allow it
-- to invoke the private read-only eligibility check. This private schema is
-- not part of the public PostgREST RPC API; anonymous direct use stays denied.
grant execute on function private.validate_staff_booking_rules(uuid) to authenticated;
revoke execute on function private.validate_staff_booking_rules(uuid) from anon;
