-- A persistent, employee-controlled duty nickname for manager-assigned shifts.
-- This is intentionally separate from account display_name and login credentials.
ALTER TABLE public.employee_accounts
 ADD COLUMN IF NOT EXISTS shift_display_name text
 CONSTRAINT employee_accounts_shift_display_name_valid
 CHECK (
  shift_display_name IS NULL OR
  (char_length(btrim(shift_display_name)) BETWEEN 1 AND 100
   AND shift_display_name=btrim(shift_display_name))
 );

-- Preserve the latest existing RP duty nickname without editing past rosters.
-- A user with no previous shifts keeps the existing account name as a fallback.
UPDATE public.employee_accounts AS account
SET shift_display_name=(
 SELECT duty.employee_name
 FROM public.shift_attendance duty
 WHERE duty.employee_id=account.user_id
   AND char_length(btrim(duty.employee_name)) BETWEEN 1 AND 100
   AND duty.employee_name=btrim(duty.employee_name)
 ORDER BY duty.shift_date DESC,duty.created_at DESC
 LIMIT 1
)
WHERE account.shift_display_name IS NULL
 AND EXISTS (
  SELECT 1 FROM public.shift_attendance duty
  WHERE duty.employee_id=account.user_id
    AND char_length(btrim(duty.employee_name)) BETWEEN 1 AND 100
    AND duty.employee_name=btrim(duty.employee_name)
 );

-- Employees can edit only their own preferred duty name, never their
-- permissions, active status, account display_name, email, or user ID.
GRANT UPDATE(shift_display_name) ON public.employee_accounts TO authenticated;
DROP POLICY IF EXISTS "employees update own shift display name" ON public.employee_accounts;
CREATE POLICY "employees update own shift display name" ON public.employee_accounts
 FOR UPDATE TO authenticated
 USING (
  user_id=(SELECT auth.uid())
  AND active=true
 )
 WITH CHECK (
  user_id=(SELECT auth.uid())
  AND active=true
 );

COMMENT ON COLUMN public.employee_accounts.shift_display_name IS
 'Optional employee-selected public RP shift name used when the owner assigns new shifts; independent from login display_name.';
