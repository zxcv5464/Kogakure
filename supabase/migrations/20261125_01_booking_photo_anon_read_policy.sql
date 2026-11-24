-- Keep public visitor reads separate from authenticated booking-manager checks.
-- The anon role intentionally cannot execute has_backoffice_permission().
-- A combined anon/authenticated policy would therefore fail for public visitors
-- even when the public-staff branch of its OR expression matches.
drop policy if exists "visitors and booking managers read booking portraits"
 on public.booking_staff_photos;
drop policy if exists "visitors read booking portraits"
 on public.booking_staff_photos;
drop policy if exists "booking managers read booking portraits"
 on public.booking_staff_photos;

create policy "visitors read booking portraits"
 on public.booking_staff_photos for select to anon
 using (
  exists (
   select 1 from public.staff s
   where s.id=booking_staff_photos.staff_id
    and s.is_published=true
    and s.is_booking_visible=true
  )
 );

create policy "booking managers read booking portraits"
 on public.booking_staff_photos for select to authenticated
 using (
  exists (
   select 1 from public.staff s
   where s.id=booking_staff_photos.staff_id
    and s.is_published=true
    and s.is_booking_visible=true
  )
  or (select public.has_backoffice_permission('booking.manage'))
 );
