-- Booking-page images are independent of staff-directory images and duty portraits.
-- Seed existing booking photos once, then manage them only via booking.manage.
create table if not exists public.booking_staff_photos (
 staff_id uuid primary key references public.staff(id) on delete cascade,
 image_url text not null check (char_length(image_url) between 1 and 2048),
 object_path text,
 updated_at timestamptz not null default now(),
 constraint booking_photo_object_path check (
  object_path is null or object_path ~ (
   '^bookings/' || staff_id::text ||
   '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  )
 )
);
-- The seed preserves the images visitors previously saw. A subsequent booking
-- photo deletion deliberately leaves an empty booking image, without fallback
-- to the staff profile and without mutating staff's original URLs.
insert into public.booking_staff_photos(staff_id,image_url)
select s.id,coalesce(nullif(s.thumbnail_url,''),nullif(s.image_url,''))
from public.staff s
where coalesce(nullif(s.thumbnail_url,''),nullif(s.image_url,'')) is not null
on conflict (staff_id) do nothing;

alter table public.booking_staff_photos enable row level security;
revoke all on public.booking_staff_photos from public,anon,authenticated;
grant select on public.booking_staff_photos to anon,authenticated;
grant insert,update,delete on public.booking_staff_photos to authenticated;

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
create policy "booking managers create booking portraits"
 on public.booking_staff_photos for insert to authenticated
 with check ((select public.has_backoffice_permission('booking.manage')));
create policy "booking managers update booking portraits"
 on public.booking_staff_photos for update to authenticated
 using ((select public.has_backoffice_permission('booking.manage')))
 with check ((select public.has_backoffice_permission('booking.manage')));
create policy "booking managers delete booking portraits"
 on public.booking_staff_photos for delete to authenticated
 using ((select public.has_backoffice_permission('booking.manage')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('booking-media','booking-media',true,4194304,array['image/webp']::text[])
on conflict(id) do nothing;

-- All three operations are scoped to booking.manage, not staff.manage.
-- Files are never uploaded to or deleted from the independent staff-media bucket.
create policy "booking managers upload booking photos"
 on storage.objects for insert to authenticated
 with check (
  bucket_id='booking-media'
  and name ~ '^bookings/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'
  and (select public.has_backoffice_permission('booking.manage'))
 );
create policy "booking managers inspect booking photos"
 on storage.objects for select to authenticated
 using (
  bucket_id='booking-media'
  and (select public.has_backoffice_permission('booking.manage'))
 );
create policy "booking managers remove booking photos"
 on storage.objects for delete to authenticated
 using (
  bucket_id='booking-media'
  and (select public.has_backoffice_permission('booking.manage'))
 );

comment on table public.booking_staff_photos is
 'Booking-only images. Seeded once from staff thumbnail; future edits/deletes do not modify staff profile images.';
