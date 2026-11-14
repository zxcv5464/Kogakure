// Regression: manual portrait cropping is an explicit editor action, not
// another CSS object-fit:cover crop. Safe: no Supabase calls or uploads.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'

const files=['src/components/StaffPhotoCrop.tsx','src/pages/admin/StaffManagement.tsx',
 'src/lib/upload.ts','src/components/staff-card.css','src/components/StaffCard.tsx',
 'src/pages/BookingPage.tsx','src/pages/admin/staff-management.css']
const [editor,admin,upload,cardCss,card,booking,adminCss]=await Promise.all(files.map(p=>readFile(p,'utf8')))
for(const phrase of [
 '自訂名冊照片顯示範圍','套用這個範圍','onPointerDown','onPointerMove',
 'type="range"','staff-crop-card-preview','defaultStaffCrop',
])assert.ok(editor.includes(phrase),'Crop UI missing: '+phrase)
for(const phrase of [
 'uploadStaffCrop','uploadStaffImage(photoFile, sanitized.id, confirmedCrop)',
 'if (cropEditing || (photoFile && !confirmedCrop))',
 '重新圈選名冊照片範圍','<StaffPhotoCrop',
 'setConfirmedCrop(null)','setCropEditing(true)',
])assert.ok(admin.includes(phrase),'Admin integration missing: '+phrase)
assert.ok(upload.includes('croppedWebp(file, crop)'),'New uploads must use selected crop')
assert.ok(upload.includes('webp(file, 2000, .94)'),'Full photograph remains intact')
assert.ok(upload.includes('uploadStaffCrop(sourceUrl'),'Existing photos must be recroppable')
assert.ok(upload.includes("'-crop.webp'"),'Manual crop needs distinct storage path')
assert.ok(cardCss.includes('.staff-entry.has-manual-crop .omamori-art img'),'Must disable auto crop on manual photos')
assert.ok(cardCss.includes('transform: none'),'Manual crop cannot be zoomed')
assert.ok(card.includes("has-manual-crop"),'Staff gallery must recognize cropped photos')
assert.ok(booking.includes("has-manual-crop"),'Booking cards must use the same crop')
assert.ok(adminCss.includes('staff-crop-applied'),'Admin must distinguish applied but unsaved selection')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {STAFF_CARD_RATIO,defaultStaffCrop,moveStaffCrop,resizeStaffCrop,cropPixels,cropScale} =
  await vite.ssrLoadModule('/src/lib/staff-crop.ts')
 assert.equal(STAFF_CARD_RATIO,.655)
 const epsilon=1e-6
 for(const [w,h] of [[1920,1080],[1000,1600],[1080,1920],[1200,800],[640,640],[100,220]]){
  const source=defaultStaffCrop(w,h)
  const px=cropPixels(source,w,h)
  assert.ok(Math.abs(px.width/px.height-.655)<epsilon,'Card aspect mismatch '+w+'x'+h)
  assert.ok(px.x>=0&&px.y>=0&&px.x+px.width<=w+.001&&px.y+px.height<=h+.001)
  const zoomed=resizeStaffCrop(source,.43,w,h)
  const z=cropPixels(zoomed,w,h)
  assert.ok(Math.abs(z.width/z.height-.655)<epsilon,'Zoom changed the crop aspect')
  assert.ok(Math.abs(cropScale(zoomed,w,h)-.43)<epsilon,'Wrong zoom size')
  const moved=moveStaffCrop(zoomed,9000,9000)
  assert.ok(moved.x+moved.width<=1+epsilon && moved.y+moved.height<=1+epsilon,'Moved outside image')
  const reverse=moveStaffCrop(zoomed,-9000,-9000)
  assert.equal(reverse.x,0)
  assert.equal(reverse.y,0)
 }
 assert.throws(()=>cropPixels({x:-.2,y:0,width:.5,height:.5},1200,800))
 assert.throws(()=>cropPixels({x:0,y:0,width:.8,height:.8},1200,800))
 console.log('PASS: manual staff photo crop geometry, upload, preview, saved state and card non-zoom rendering')
}finally{await vite.close()}
