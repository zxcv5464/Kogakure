-- Multiple service photos, non-destructive upgrade from the single-image field.
-- Existing image_url values are retained and become the first slide.
alter table public.service_contents
 add column if not exists image_urls text[] not null default '{}'::text[];

update public.service_contents
 set image_urls=array[image_url]
 where image_url is not null
   and cardinality(image_urls)=0;

do $gallery$
begin
 if not exists (
  select 1 from pg_catalog.pg_constraint
  where conname='service_contents_gallery_limit'
   and conrelid='public.service_contents'::regclass
 ) then
  alter table public.service_contents
   add constraint service_contents_gallery_limit
   check (cardinality(image_urls)<=12 and array_position(image_urls,null) is null);
 end if;
end
$gallery$;

comment on column public.service_contents.image_urls is
 'Ordered list of up to 12 photos per service; image_url is mirrored to first photo for legacy clients.';
