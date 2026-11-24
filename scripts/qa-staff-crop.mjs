// Regression: multi-photo staff and booking galleries keep manual crop selection.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'

const files=['src/components/StaffPhotoCrop.tsx','src/pages/admin/StaffManagement.tsx',
 'src/lib/upload.ts','src/lib/staff-crop.ts','src/components/staff-card.css',
 'src/components/StaffCard.tsx','src/pages/BookingPage.tsx',
 'src/pages/admin/BookingPhotoManager.tsx','src/lib/booking-photos.ts',
 'src/pages/admin/staff-management.css','src/components/staff-photo-crop.css']
const [editor,admin,upload,model,cardCss,card,booking,bookingAdmin,bookingApi,adminCss,previewCss]=
 await Promise.all(files.map(path=>readFile(path,'utf8')))
for(const phrase of [
 '自訂{title}照片顯示範圍','套用這個範圍','onPointerDown','onPointerMove',
 'type="range"','staff-crop-card-preview','defaultStaffCrop','aspectRatio',
])assert.ok(editor.includes(phrase),'Crop UI missing: '+phrase)
for(const phrase of [
 'pendingPhotos','photoCrops','uploadStaffImage(pending.file,sanitized.id,photoCrops[pending.id])',
 'uploadStaffCrop(photo.imageUrl','<StaffPhotoCrop','multiple',
 'photoDisplayMode','function movePhoto','function removePhoto',
])assert.ok(admin.includes(phrase),'Multi-photo staff editor missing: '+phrase)
assert.ok(upload.includes('croppedWebp(file, crop)'),'New staff photos must use the selected crop')
assert.ok(upload.includes('webp(file, 2000, .94)'),'Full-size staff photograph remains intact')
assert.ok(upload.includes('uploadStaffCrop(sourceUrl'),'Existing staff photos must be recroppable')
assert.ok(cardCss.includes('.staff-entry .omamori-art .mystic-photo-gallery .services-photo-slide')&&
 cardCss.includes('transform:none'),'The manually selected thumbnail must not be auto-zoomed')
assert.ok(card.includes('MysticPhotoGallery')&&card.includes("staff.photoDisplayMode||'single'"),
 'Staff cards must render single or multi-photo mode')
assert.ok(booking.includes('MysticPhotoGallery')&&bookingAdmin.includes('StaffPhotoCrop')&&
 bookingAdmin.includes('aspectRatio={BOOKING_CARD_RATIO}')&&bookingAdmin.includes('previewShape="rectangle"')&&
 previewCss.includes('.staff-crop-card-preview.is-rectangle{clip-path:none'),
 'Booking photos must reuse the selection UI with their own framing ratio')
assert.ok(bookingApi.includes('croppedWebp')&&bookingApi.includes('BOOKING_CARD_RATIO'),
 'Booking uploads and re-crops must persist the selected range')
assert.ok(adminCss.includes('.staff-gallery-photo')&&adminCss.includes('staff-crop-applied'),
 'Admin must display staged, cropped and saved gallery items')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {STAFF_CARD_RATIO,BOOKING_CARD_RATIO,defaultStaffCrop,moveStaffCrop,
  resizeStaffCrop,cropPixels,cropScale}=await vite.ssrLoadModule('/src/lib/staff-crop.ts')
 assert.equal(STAFF_CARD_RATIO,.655)
 assert.equal(BOOKING_CARD_RATIO,.55)
 const epsilon=1e-6
 for(const [w,h] of [[1920,1080],[1000,1600],[1080,1920],[1200,800],[640,640],[100,220]]){
  const source=defaultStaffCrop(w,h)
  const px=cropPixels(source,w,h)
  assert.ok(Math.abs(px.width/px.height-.655)<epsilon,'Staff card aspect mismatch '+w+'x'+h)
  assert.ok(px.x>=0&&px.y>=0&&px.x+px.width<=w+.001&&px.y+px.height<=h+.001)
  const zoomed=resizeStaffCrop(source,.43,w,h)
  const z=cropPixels(zoomed,w,h)
  assert.ok(Math.abs(z.width/z.height-.655)<epsilon,'Staff crop zoom changed aspect')
  assert.ok(Math.abs(cropScale(zoomed,w,h)-.43)<epsilon,'Wrong staff crop zoom size')
  const booking=defaultStaffCrop(w,h,BOOKING_CARD_RATIO)
  const bookingPixels=cropPixels(booking,w,h,BOOKING_CARD_RATIO)
  assert.ok(Math.abs(bookingPixels.width/bookingPixels.height-BOOKING_CARD_RATIO)<epsilon,
   'Booking crop aspect mismatch '+w+'x'+h)
  const bookingZoom=resizeStaffCrop(booking,.6,w,h,BOOKING_CARD_RATIO)
  assert.ok(Math.abs(cropScale(bookingZoom,w,h,BOOKING_CARD_RATIO)-.6)<epsilon,
   'Wrong booking crop zoom size')
  const moved=moveStaffCrop(bookingZoom,9000,9000)
  assert.ok(moved.x+moved.width<=1+epsilon&&moved.y+moved.height<=1+epsilon,'Moved outside image')
  const reverse=moveStaffCrop(bookingZoom,-9000,-9000)
  assert.equal(reverse.x,0);assert.equal(reverse.y,0)
 }
 assert.throws(()=>cropPixels({x:-.2,y:0,width:.5,height:.5},1200,800))
 assert.throws(()=>cropPixels({x:0,y:0,width:.8,height:.8},1200,800))
 const {default:StaffPhotoCrop}=await vite.ssrLoadModule('/src/components/StaffPhotoCrop.tsx')
 const markup=renderToStaticMarkup(createElement(StaffPhotoCrop,{
  source:'https://example.invalid/portrait.webp',title:'指名',aspectRatio:BOOKING_CARD_RATIO,previewShape:'rectangle',
  onConfirm:()=>{},onCancel:()=>{},
 }))
 assert.ok(markup.includes('自訂指名照片顯示範圍')&&markup.includes('0.55')&&markup.includes('is-rectangle'),
  'The booking crop selector must identify the booking card frame')
 console.log('PASS: multi-photo profile editor, per-image crop, separate booking crop ratio and legacy 0.655 staff crop')
}finally{await vite.close()}
