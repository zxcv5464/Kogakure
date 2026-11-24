// Regression: independent multi-photo booking gallery, per-photo crop and floating overlay.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const targets=[
 'src/lib/booking-photos.ts','src/pages/BookingPage.tsx',
 'src/pages/admin/BookingManagement.tsx','src/pages/admin/BookingPhotoManager.tsx',
 'src/pages/admin/booking-photo-manager.css','src/pages/booking-page.css',
 'src/components/MysticPhotoGallery.tsx','src/components/mystic-photo-gallery.css',
 'supabase/migrations/20261123_02_booking_staff_photos.sql',
 'supabase/migrations/20261124_01_staff_booking_photo_galleries.sql',
 'supabase/migrations/20261124_02_booking_photo_read_policy.sql',
 'src/lib/staff.ts','src/lib/staff-crop.ts','src/lib/shift-portraits.ts',
]
const files=await Promise.all(targets.map(path=>readFile(path,'utf8')))
const sourceByPath=Object.fromEntries(targets.map((path,index)=>[path,files[index]]))
for(const path of targets.filter(path=>/\.tsx?$/.test(path))){
 const source=ts.createSourceFile(path,sourceByPath[path],ts.ScriptTarget.Latest,true,
  path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(source.parseDiagnostics.length,0,'TypeScript parsing failed: '+path)
}
const api=sourceByPath['src/lib/booking-photos.ts']
const page=sourceByPath['src/pages/BookingPage.tsx']
const manager=sourceByPath['src/pages/admin/BookingPhotoManager.tsx']
const sql=sourceByPath['supabase/migrations/20261124_01_staff_booking_photo_galleries.sql']
const policySql=sourceByPath['supabase/migrations/20261124_02_booking_photo_read_policy.sql']
assert.ok(api.includes("const BUCKET='booking-media'")&&api.includes("from('booking_staff_photos')"),
 'Booking photos must remain isolated in their own data table and bucket')
for(const name of ['uploadBookingPhoto','updateBookingPhotoCrop','deleteBookingGalleryPhoto',
 'moveBookingPhoto','setBookingPhotoDisplayMode','uploadBookingOverlay','deleteBookingOverlay'])
 assert.ok(api.includes('function '+name),'Missing booking photo operation: '+name)
assert.ok(api.includes('photo_gallery:galleryJson(photo.photos)')&&api.includes('secondary_image_url:photo.secondaryImageUrl'),
 'Booking gallery and overlay metadata must persist independently')
assert.ok(api.includes('BOOKING_CARD_RATIO')&&api.includes('cropPixels(crop,bitmap.width,bitmap.height,BOOKING_CARD_RATIO)'),
 'Booking photo crop must use its own responsive portrait framing')
assert.ok(!api.includes("from('staff-media')")&&!api.includes("from('staff').update("),
 'Booking photo operations must not modify staff gallery media')
assert.ok(page.includes('MysticPhotoGallery')&&page.includes('bookingPhotosByStaff')&&
 page.includes('overlayUrl={photo.secondaryImageUrl}'),
 'Booking front end must show its independent photo gallery and floating overlay')
assert.ok(!page.includes('setPhotoUrls')&&!page.includes('person.thumbnailUrl||person.imageUrl'),
 'Booking front end must not fall back to staff profile images')
assert.ok(manager.includes('multiple')&&manager.includes('StaffPhotoCrop')&&
 manager.includes('updateBookingPhotoCrop')&&manager.includes('deleteBookingGalleryPhoto'),
 'Booking manager must upload multiple photos and retain per-photo crop/delete controls')
assert.ok(manager.includes('uploadBookingOverlay')&&manager.includes('deleteBookingOverlay')&&
 manager.includes('更換副圖片')&&manager.includes('刪除副圖片'),
 'Booking manager must independently add, replace and delete the floating overlay')
assert.ok(manager.includes('setBookingPhotoDisplayMode')&&manager.includes('moveBookingPhoto'),
 'Booking manager must persist single/gallery mode and photo ordering')
assert.ok(sql.includes('add column if not exists photo_gallery jsonb')&&
 sql.includes('add column if not exists photo_display_mode text')&&
 sql.includes('secondary_image_url text')&&sql.includes('secondary_object_path text'),
 'Migration must add bounded multi-image galleries and a separate overlay')
assert.ok(sql.includes('alter column image_url drop not null')&&
 sql.includes('jsonb_array_length(photo_gallery)<=12'),
 'Deleting the last main photo must be supported while limiting galleries to 12')
assert.ok(sql.includes('update public.booking_staff_photos')&&
 sql.includes('image_path', 'image_path')&&sql.includes('on delete cascade')===false,
 'Existing booking photos must be migrated in place, not dropped')
assert.ok(sql.includes('photo_display_mode in (\'single\',\'gallery\')'),
 'Display mode must be constrained to known values')
assert.ok(sourceByPath['src/lib/shift-portraits.ts'].includes("const BUCKET='shift-avatars'"),
 'Duty roster photos must remain in their independent storage')
assert.ok(sourceByPath['src/lib/staff.ts'].includes('photo_gallery:')&&
 sourceByPath['src/lib/staff.ts'].includes('photo_display_mode:'),
 'Staff profiles must save their own separate gallery metadata')
console.log('PASS: booking gallery, crop, single/gallery mode, overlay lifecycle, legacy photo migration and storage isolation')
