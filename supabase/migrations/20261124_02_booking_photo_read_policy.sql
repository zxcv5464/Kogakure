-- Merge the public-visible and booking-manager read rules into one policy.
-- This preserves access while avoiding two permissive SELECT policies for authenticated users.
drop policy if exists "visitors see booking portraits of visible staff" on public.booking_staff_photos;
drop policy if exists "booking managers read all booking portraits" on public.booking_staff_photos;
drop policy if exists "visitors and booking managers read booking portraits" on public.booking_staff_photos;
create policy "visitors and booking managers read booking portraits"
 on public.booking_staff_photos for select to anon,authenticated
 using (
  exists (
   select 1 from public.staff s
   where s.id=booking_staff_photos.staff_id and s.is_published=true
    and s.is_booking_visible=true
  )
  or ((select auth.role())='authenticated'
   and (select public.has_backoffice_permission('booking.manage')))
 );
