-- 狐隱：per-image display crop. Existing photos remain unmodified;
-- legacy image_urls default to center framing, not a destructive file edit.
alter table public.service_contents
 add column if not exists image_crops jsonb not null default '[]'::jsonb;

do $crop$
begin
 if not exists (
  select 1 from pg_catalog.pg_constraint
  where conname='service_contents_image_crops_limit'
   and conrelid='public.service_contents'::regclass
 ) then
  alter table public.service_contents
   add constraint service_contents_image_crops_limit
   check (
    jsonb_typeof(image_crops)='array'
    and jsonb_array_length(image_crops)<=12
  );
 end if;
end
$crop$;

comment on column public.service_contents.image_crops is
 'Service photos display framing by image_urls index, [{x:0..100,y:0..100,zoom:1..3}]. Missing legacy entries default to center. Files are never edited.';
