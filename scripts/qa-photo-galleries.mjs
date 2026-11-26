// Public portrait gallery regression: shoji reveal, dots, single mode and floating sticker.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
import {createServer} from 'vite'

const [galleryFile,css,staffCard,bookingPage,staffAdmin,bookingAdmin,migration,staffDialog]=await Promise.all([
 'src/components/MysticPhotoGallery.tsx','src/components/mystic-photo-gallery.css',
 'src/components/StaffCard.tsx','src/pages/BookingPage.tsx',
 'src/pages/admin/StaffManagement.tsx','src/pages/admin/BookingPhotoManager.tsx',
 'supabase/migrations/20261124_01_staff_booking_photo_galleries.sql',
 'src/components/StaffDialog.tsx',
].map(path=>readFile(path,'utf8')))
for(const path of ['src/components/MysticPhotoGallery.tsx','src/components/StaffCard.tsx',
 'src/pages/BookingPage.tsx','src/pages/admin/StaffManagement.tsx',
 'src/pages/admin/BookingPhotoManager.tsx']){
 const source=await readFile(path,'utf8')
 const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(parsed.parseDiagnostics.length,0,'TSX parse error: '+path)
}
assert.ok(staffCard.includes('MysticPhotoGallery')&&staffCard.includes('staff.photoDisplayMode'),
 'Staff cards must use the shared photo gallery')
assert.ok(staffCard.includes('<button')&&!staffCard.includes('role="button"')&&
 staffCard.includes('showCounter={false}')&&staffCard.includes('showPagination={false}'),
 'Roster cards must retain the original button/card behavior without counters or dots')
assert.ok(staffDialog.includes('showCounter={false}')&&staffDialog.includes('showPagination={false}'),
 'Roster detail must also hide slideshow counters and pagination')
assert.ok(bookingPage.includes('MysticPhotoGallery')&&bookingPage.includes('secondaryImageUrl'),
 'Booking cards must use the shared gallery and separate overlay')
assert.ok(staffAdmin.includes('新增照片（可多選）')&&staffAdmin.includes('多張輪播'),
 'Staff admin must support multiple photos and a single/gallery display choice')
assert.ok(bookingAdmin.includes('新增照片（可多選）')&&bookingAdmin.includes('新增副圖片'),
 'Booking admin must manage gallery photos and the floating overlay')
assert.ok(migration.includes('photo_gallery jsonb')&&migration.includes('photo_display_mode text')&&
 migration.includes('secondary_image_url text'),
 'Both gallery modes and the secondary image must be stored in Supabase')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:MysticPhotoGallery}=await vite.ssrLoadModule('/src/components/MysticPhotoGallery.tsx')
 const photos=[
  {imageUrl:'https://example.invalid/full-1.webp',thumbnailUrl:'https://example.invalid/thumb-1.webp'},
  {imageUrl:'https://example.invalid/full-2.webp',thumbnailUrl:'https://example.invalid/thumb-2.webp'},
  {imageUrl:'https://example.invalid/full-3.webp',thumbnailUrl:'https://example.invalid/thumb-3.webp'},
 ]
 const detail=renderToStaticMarkup(createElement(MysticPhotoGallery,{
  photos,mode:'gallery',useThumbnail:false,useMobileCrop:true,showCounter:false,showPagination:false,loading:'eager',alt:'詳細名帖',
 }))
 assert.ok(detail.includes('full-1.webp')&&!detail.includes('staff-detail-preview')&&
  !detail.includes('staff-detail-original')&&!detail.includes('thumb-1.webp'),
  'Staff detail must directly render originals without preview thumbnails or a progressive swap')
 assert.ok(!galleryFile.includes('progressiveDetail')&&!galleryFile.includes('DetailPhoto')&&
  !css.includes('transition:opacity .24s ease')&&!css.includes('staff-detail-photo-layer'),
  'Remove obsolete original-vs-thumbnail transition states and 0.24-second crossfade')
 assert.ok(staffCard.includes('ResizeObserver(fit)')&&staffCard.includes('document.fonts')&&staffCard.includes('text.offsetWidth')&&staffCard.includes('prefetchStaffDetailPhoto'),'Full names must fit actual rendered glyphs and preload on intent')
 const singleDetail=renderToStaticMarkup(createElement(MysticPhotoGallery,{
  photos,mode:'single',useThumbnail:false,useMobileCrop:true,alt:'單張詳細名帖',
 }))
 assert.equal((singleDetail.match(/full-1.webp/g)||[]).length,1,
  'Single staff detail must mount exactly one original image rather than duplicate layers')
 const multi=renderToStaticMarkup(createElement(MysticPhotoGallery,{
  photos,mode:'gallery',alt:'測試狐姬',overlayUrl:'https://example.invalid/sticker.webp',
 }))
 assert.equal((multi.match(/class="services-photo-dot(?:\s|")/g)||[]).length,3,'Gallery must render one pagination dot per photo')
 assert.ok(multi.includes('thumb-1.webp')&&multi.includes('sticker.webp')&&
  galleryFile.includes('services-photo-shoji-edges')&&multi.includes('01 / 03'),
  'Gallery must show thumbnails, counter, overlay and mysterious reveal')
 const roster=renderToStaticMarkup(createElement(MysticPhotoGallery,{
  photos,mode:'gallery',showCounter:false,showPagination:false,alt:'名冊輪播',
 }))
 assert.ok(!roster.includes('services-photo-dot')&&!roster.includes('services-photo-counter')&&
  galleryFile.includes('setInterval')&&galleryFile.includes('},5000)'),
  'Roster gallery must auto-rotate without pagination or photo counts')
const single=renderToStaticMarkup(createElement(MysticPhotoGallery,{photos,mode:'single',alt:'單張狐姬'}))
 assert.ok(single.includes('thumb-1.webp')&&!single.includes('thumb-2.webp')&&
  !single.includes('services-photo-dot'),
  'Single mode must display only the first photo and hide pagination')
}finally{await vite.close()}
assert.ok(css.includes('services-photo-dots')&&css.includes('services-photo-dot::before')&&
 css.includes('servicesShogiLeft')&&css.includes('servicesShogiRight'),
 'Gallery styling must share Services page ink-gold pagination and shoji reveal')
console.log('PASS: profile/booking single and multi modes, shared mystery slideshow, dots, counter and sticker overlay')
