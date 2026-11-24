-- 狐隱：員工名帖與預約指名照片升級為獨立多圖相簿。
-- Existing single-photo columns remain as compatibility mirrors of the first photo.
-- Files stay in their existing staff-media / booking-media buckets.
alter table public.staff
 add column if not exists photo_gallery jsonb not null default '[]'::jsonb,
 add column if not exists photo_display_mode text not null default 'single';

do $staff_gallery$
begin
 if not exists(select 1 from pg_constraint where conname='staff_photo_gallery_limit' and conrelid='public.staff'::regclass) then
  alter table public.staff add constraint staff_photo_gallery_limit
   check(jsonb_typeof(photo_gallery)='array' and jsonb_array_length(photo_gallery)<=12);
 end if;
 if not exists(select 1 from pg_constraint where conname='staff_photo_display_mode_valid' and conrelid='public.staff'::regclass) then
  alter table public.staff add constraint staff_photo_display_mode_valid
   check(photo_display_mode in ('single','gallery'));
 end if;
end
$staff_gallery$;

-- Preserve every existing profile image as the first gallery item.
update public.staff
 set photo_gallery=jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid()::text,
  'image_url',image_url,
  'thumbnail_url',coalesce(nullif(thumbnail_url,''),image_url),
  'image_path',null,
  'thumbnail_path',null
 ))
where jsonb_array_length(photo_gallery)=0
 and coalesce(nullif(image_url,''),nullif(thumbnail_url,'')) is not null;

comment on column public.staff.photo_gallery is
 'Ordered staff profile photos, up to 12; each item stores id, image_url, thumbnail_url, image_path and thumbnail_path.';
comment on column public.staff.photo_display_mode is
 'single shows only the first profile photo; gallery enables the mystery slideshow and pagination dots.';

-- The previous booking image field was NOT NULL and represented one photo.
-- It now remains a nullable compatibility mirror while photo_gallery is authoritative.
alter table public.booking_staff_photos
 alter column image_url drop not null,
 add column if not exists photo_gallery jsonb not null default '[]'::jsonb,
 add column if not exists photo_display_mode text not null default 'single',
 add column if not exists secondary_image_url text,
 add column if not exists secondary_object_path text;

do $booking_gallery$
begin
 if not exists(select 1 from pg_constraint where conname='booking_photo_gallery_limit' and conrelid='public.booking_staff_photos'::regclass) then
  alter table public.booking_staff_photos add constraint booking_photo_gallery_limit
   check(jsonb_typeof(photo_gallery)='array' and jsonb_array_length(photo_gallery)<=12);
 end if;
 if not exists(select 1 from pg_constraint where conname='booking_photo_display_mode_valid' and conrelid='public.booking_staff_photos'::regclass) then
  alter table public.booking_staff_photos add constraint booking_photo_display_mode_valid
   check(photo_display_mode in ('single','gallery'));
 end if;
 if not exists(select 1 from pg_constraint where conname='booking_secondary_object_path_valid' and conrelid='public.booking_staff_photos'::regclass) then
  alter table public.booking_staff_photos add constraint booking_secondary_object_path_valid
   check(secondary_object_path is null or secondary_object_path ~
    ('^bookings/'||staff_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'));
 end if;
end
$booking_gallery$;

-- Keep all seven existing independent booking portraits as their first slide.
-- Their existing Storage objects are not moved or deleted.
update public.booking_staff_photos
 set photo_gallery=jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid()::text,
  'image_url',image_url,
  'thumbnail_url',image_url,
  'image_path',object_path,
  'thumbnail_path',null
 ))
where jsonb_array_length(photo_gallery)=0 and image_url is not null;

comment on column public.booking_staff_photos.photo_gallery is
 'Independent ordered booking portraits, up to 12; each photo has its own full image and manually selected thumbnail.';
comment on column public.booking_staff_photos.photo_display_mode is
 'single shows only the first booking portrait; gallery enables the mystery slideshow and pagination dots.';
comment on column public.booking_staff_photos.secondary_image_url is
 'Optional transparent-friendly floating overlay displayed at the bottom-right of the booking portrait.';
comment on column public.booking_staff_photos.secondary_object_path is
 'Storage path in booking-media for the independent floating overlay image.';
