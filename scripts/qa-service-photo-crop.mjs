// Per-image crop QA for the public gallery, admin service editor and DB schema.
// No production writes, user data or live image files are needed.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
import {createServer} from 'vite'

const paths=[
 'src/lib/service-photo-crop.ts',
 'src/lib/service-content.ts',
 'src/pages/admin/ServiceManagement.tsx',
 'src/pages/admin/ServicePhotoCropEditor.tsx',
 'src/pages/admin/service-management.css',
 'src/components/ServicePhotoGallery.tsx',
 'src/pages/services-page.css',
 'supabase/migrations/20261115_15_service_photo_crop.sql',
]
const [model,lib,admin,cropEditor,css,gallery,publicCss,sql]=
 await Promise.all(paths.map(path=>readFile(path,'utf8')))

for(const path of paths.filter(path=>path.endsWith('.tsx')||path.endsWith('.ts'))){
 const source=await readFile(path,'utf8')
 const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,
  path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(file.parseDiagnostics.length,0,'TSX parse error: '+path)
}
assert.ok(lib.includes('imageCrops:ServicePhotoCrop[]')&&
 lib.includes('image_crops:normalizeServiceCrops(service.imageCrops,service.imageUrls.length)'),
 'Photo positions and zoom must be persisted with the same image order')
assert.ok(lib.includes('imageCrops:normalizeServiceCrops(row.image_crops,imageUrls.length)'),
 'Public and admin reads must restore saved crop metadata')
assert.ok(lib.includes('imageUrl:service.imageUrls[0]||null'),
 'The original single-photo compatibility mirror must be preserved')
assert.ok(admin.includes('crop:ServicePhotoCrop')&&
 admin.includes('const crops=normalizeServiceCrops(record?.imageCrops,urls.length)'),
 'Existing photos need a normalized per-photo crop on edit')
assert.ok(admin.includes('setPhotoSlots(prev=>prev.map(item=>item.id===photo.id?{...item,crop}:item))')&&
 admin.includes('photoSlots.map(photo=>photo.crop)'),
 'Applying a crop must update just the selected image and save each position')
assert.ok(admin.includes('JSON.stringify(photoSlots.map(photo=>photo.crop))')&&
 admin.includes('normalizeServiceCrops(original?.imageCrops'),
 'Cropping must mark the service form dirty, but never mark an unchanged old photo as modified')
assert.ok(admin.includes('const next=[...prev]')&&
 admin.includes('[next[index],next[target]]=[next[target],next[index]]'),
 'Photo reordering must carry the crop along with its photo')
assert.ok(admin.includes('ServicePhotoCropEditor')&&
 admin.includes('套用顯示範圍')===false,
 'Photo editor must be a separate dialog launched from the service photos list')
assert.ok(cropEditor.includes('圈選照片顯示範圍')&&
 cropEditor.includes('onPointerDown={pointerDown}')&&
 cropEditor.includes('onPointerMove={pointerMove}')&&
 cropEditor.includes('setPointerCapture')&&
 cropEditor.includes('onPointerCancel={pointerUp}'),
 'The original-photo selection box must respond to mouse and touch dragging')
assert.ok(cropEditor.includes('type="range" min="1" max="3"')&&
 cropEditor.includes('水平位置')&&cropEditor.includes('垂直位置'),
 'Cropping needs independently adjustable zoom and both alignment axes')
assert.ok(cropEditor.includes('套用顯示範圍')&&cropEditor.includes('儲存服務'),
 'The manager must understand that crop changes require saving the service')
assert.ok(cropEditor.includes('is-desktop')&&cropEditor.includes('is-mobile')&&
 cropEditor.includes('style={frameStyle}'),
 'Manager needs real front-end vertical and horizontal framing previews')
assert.ok(css.includes('.service-admin-crop-selection')&&
 css.includes('.service-admin-crop-original')&&css.includes('touch-action:none'),
 'Crop selection must be visible and touch draggable')
assert.ok(css.includes('@media(max-width:760px)')&&
 css.includes('.service-admin-crop-dialog'),
 'Crop controls must work on phones as well as desktop')
assert.ok(gallery.includes('servicePhotoFrameStyle(photoCrops[photoIndex])')&&
 publicCss.includes('.services-photo-slide{'),
 'The public gallery must use the saved photo-specific crop')
assert.ok(sql.includes('add column if not exists image_crops jsonb not null default')&&
 sql.includes('jsonb_array_length(image_crops)<=12'),
 'The crop migration should be backward compatible with bounded metadata')
assert.ok(!sql.includes('drop table')&&!sql.includes('delete from')&&
 !sql.includes('update public.service_contents'),
 'Migration must not modify or destroy existing services or image files')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {
  normalizeServiceCrop,normalizeServiceCrops,servicePhotoFrameStyle,
  servicePhotoSelectionRect,
 }=await vite.ssrLoadModule('/src/lib/service-photo-crop.ts')
 assert.deepEqual(normalizeServiceCrop(null),{x:50,y:50,zoom:1},
  'Missing legacy photo crop must default to center and no enlargement')
 assert.deepEqual(normalizeServiceCrop({x:130,y:-70,zoom:999}),{x:100,y:0,zoom:3},
  'Invalid values must be safely clamped')
 assert.deepEqual(normalizeServiceCrops([],2),[
  {x:50,y:50,zoom:1},{x:50,y:50,zoom:1},
 ])
 assert.deepEqual(normalizeServiceCrops([{x:23,y:81,zoom:1.4}],2),[
  {x:23,y:81,zoom:1.4},{x:50,y:50,zoom:1},
 ])
 assert.deepEqual(servicePhotoFrameStyle({x:75,y:25,zoom:2}),{
  width:'200%',height:'200%',left:'-75%',top:'-25%',objectPosition:'75% 25%',
 },'Frame must pan through full available overflow after zoom')
 const full=servicePhotoSelectionRect(1600,900,{x:50,y:50,zoom:1})
 const zoomed=servicePhotoSelectionRect(1600,900,{x:100,y:0,zoom:2})
 assert.ok(Math.abs(full.height-100)<.001&&full.width<50)
 assert.ok(zoomed.width<full.width&&zoomed.height<full.height)
 assert.ok(Math.abs(zoomed.left+zoomed.width-100)<.001&&zoomed.top===0,
  'Selected rectangle should stay within the original image at extreme positions')
 const {default:ServicePhotoGallery}=await vite.ssrLoadModule('/src/components/ServicePhotoGallery.tsx')
 const {previewServices}=await vite.ssrLoadModule('/src/lib/service-content.ts')
 const markup=renderToStaticMarkup(createElement(ServicePhotoGallery,{
  service:{...previewServices[0],imageUrls:['https://example.invalid/photo.webp'],
   imageCrops:[{x:75,y:25,zoom:2}]},number:'01',
 }))
 assert.ok(markup.includes('left:-75%')&&markup.includes('top:-25%')&&markup.includes('object-position:75% 25%'),
  'Public photo should render with saved focal crop metadata')
 assert.ok(markup.includes('alt='),'Cropped photos must retain alt text')
 const legacy=renderToStaticMarkup(createElement(ServicePhotoGallery,{
  service:{...previewServices[0],imageUrls:['https://example.invalid/photo.webp'],
   imageCrops:[]},number:'01',
 }))
 assert.ok(legacy.includes('object-position:50% 50%'),
  'Existing legacy photos with no crop metadata must remain centered')
 console.log('PASS: draggable per-photo crop UI, bounded focal/zoom values, admin save/reorder, desktop/mobile previews, public slideshow and legacy compatibility')
}finally{await vite.close()}
