// Regression for booking-only portrait data and independent upload/delete.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const targets=[
 'src/lib/booking-photos.ts','src/pages/BookingPage.tsx',
 'src/pages/admin/BookingManagement.tsx',
 'src/pages/admin/booking-management.css',
 'supabase/migrations/20261123_02_booking_staff_photos.sql',
 'src/lib/staff.ts','src/lib/shift-portraits.ts',
]
const [api,publicPage,manager,style,sql,staff,shift]=await Promise.all(targets.map(p=>readFile(p,'utf8')))
for(const path of targets.filter(p=>/\.tsx?$/.test(p))){
 const text=await readFile(path,'utf8')
 const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(source.parseDiagnostics.length,0,'TypeScript parsing failed: '+path)
}
assert.ok(publicPage.includes('loadBookingPhotos()')&&publicPage.includes('bookingImage(person.id)'),
 'Booking public cards must use independent pictures')
assert.ok(publicPage.includes('bookingImage(selected.id)'),
 'Reservation confirmation dialog must use booking picture, not the staff profile')
assert.ok(!publicPage.includes('person.thumbnailUrl||person.imageUrl')&&!publicPage.includes('selected.thumbnailUrl||selected.imageUrl'),
 'Never use staff thumbnails in the booking UI after migration')
assert.ok(manager.includes('changeBookingPhoto(person,file)')&&
 manager.includes('removeBookingPhoto(person)')&&
 manager.includes('booking-admin-photo-upload')&&manager.includes('booking-admin-photo-delete'),
 'Manager must independently upload, replace and delete a booking image')
assert.ok(manager.includes('loadBookingPhotos({force:true})')&&
 manager.includes("deleteBookingPhoto(person.id)")&&
 manager.includes('uploadBookingPhoto(person.id,file)'),
 'Manager must refresh independent photo records from the server')
assert.ok(style.includes('.booking-admin-photo-editor')&&style.includes('.booking-admin-photo-upload')&&
 style.includes('.booking-admin-photo-delete'),'Photo controls need dedicated styling')
assert.ok(api.includes("const BUCKET='booking-media'")&&
 api.includes("from('booking_staff_photos')")&&
 api.includes('invalidateBookingPhotos()')&&api.includes('deleteBookingPhoto(staffId:string)'),
 'Booking media must have its own storage bucket and cache invalidation')
assert.ok(api.includes("contentType:'image/webp',upsert:false")&&
 api.includes('ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)'),
 'Photographs must be optimized without a destructive square crop')
assert.ok(!api.includes("from('staff').update(")&&!api.includes("from('staff-media')"),
 'Booking image edits must not change or remove staff gallery photos')
assert.ok(sql.includes('create table if not exists public.booking_staff_photos')&&
 sql.includes('references public.staff(id) on delete cascade')&&
 sql.includes('alter table public.booking_staff_photos enable row level security'),
 'Booking images need a separately secured table and cascaded deletion')
assert.ok(sql.includes('coalesce(nullif(s.thumbnail_url')&&sql.includes('on conflict (staff_id) do nothing'),
 'Migration should retain pre-existing booking-card photos')
assert.ok(sql.includes("public.has_backoffice_permission('booking.manage')")&&
 sql.includes("bucket_id='booking-media'")&&
 sql.includes("s.is_published=true")&&sql.includes("s.is_booking_visible=true"),
 'Public read and manager write must respect booking permissions')
assert.ok(!sql.includes('delete from public.staff')&&!sql.includes('update public.staff')&&
 !sql.includes('grant update on public.staff to authenticated'),
 'Migration must not rewrite employee profiles or booking rules')
assert.ok(staff.includes('image_url:s.imageUrl')&&shift.includes('shift_profile_images')===false,
 'Existing unrelated staff photo writes must remain independent')
console.log('PASS: booking-only photo lifecycle, public card media, scoped permissions and untouched staff profile')
