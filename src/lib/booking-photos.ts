import {supabase} from './supabase'
import {cropPixels} from './staff-crop'
import type {StaffCrop} from './staff-crop'

const BUCKET='booking-media'
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fields='staff_id,image_url,object_path,photo_gallery,photo_display_mode,secondary_image_url,secondary_object_path,updated_at'
export type BookingGalleryPhoto={
 id:string;imageUrl:string;thumbnailUrl:string;imagePath:string|null;thumbnailPath:string|null
}
export type BookingPhoto={
 staffId:string;photos:BookingGalleryPhoto[];displayMode:'single'|'gallery'
 secondaryImageUrl:string;secondaryObjectPath:string|null
}
type BookingPhotoRow={
 staff_id:string;image_url:string|null;object_path:string|null;photo_gallery:unknown
 photo_display_mode:string|null;secondary_image_url:string|null;secondary_object_path:string|null;updated_at:string
}
const cacheAgeMs=60_000
let cached:BookingPhoto[]|null=null
let fetchedAt=0
let pending:Promise<BookingPhoto[]>|null=null
let version=0

function client(){if(!supabase)throw new Error('預約照片資料庫尚未連線');return supabase}
function verifyStaffId(staffId:string){if(!idPattern.test(staffId))throw new Error('館員識別資料不正確')}
function normalize(row:BookingPhotoRow):BookingPhoto{
 const raw=Array.isArray(row.photo_gallery)?row.photo_gallery:[]
 const photos=raw.flatMap((item,index)=>{
  if(!item||typeof item!=='object')return []
  const photo=item as Record<string,unknown>
  const imageUrl=typeof photo.image_url==='string'?photo.image_url:''
  const thumbnailUrl=typeof photo.thumbnail_url==='string'?photo.thumbnail_url:imageUrl
  if(!imageUrl&&!thumbnailUrl)return []
  return [{id:typeof photo.id==='string'?photo.id:'legacy-'+row.staff_id+'-'+index,
   imageUrl:imageUrl||thumbnailUrl,thumbnailUrl:thumbnailUrl||imageUrl,
   imagePath:typeof photo.image_path==='string'?photo.image_path:null,
   thumbnailPath:typeof photo.thumbnail_path==='string'?photo.thumbnail_path:null}]
 })
 if(!photos.length&&row.image_url)photos.push({
  id:'legacy-'+row.staff_id,imageUrl:row.image_url,thumbnailUrl:row.image_url,
  imagePath:row.object_path,thumbnailPath:null,
 })
 return {staffId:row.staff_id,photos,displayMode:row.photo_display_mode==='gallery'?'gallery':'single',
  secondaryImageUrl:row.secondary_image_url||'',secondaryObjectPath:row.secondary_object_path}
}
function galleryJson(photos:BookingGalleryPhoto[]){
 return photos.map(photo=>({id:photo.id,image_url:photo.imageUrl,thumbnail_url:photo.thumbnailUrl,
  image_path:photo.imagePath,thumbnail_path:photo.thumbnailPath}))
}
function emptyPhoto(staffId:string):BookingPhoto{
 return {staffId,photos:[],displayMode:'single',secondaryImageUrl:'',secondaryObjectPath:null}
}
function invalidate():void{cached=null;fetchedAt=0;pending=null;version++}
export function invalidateBookingPhotos():void{invalidate()}
export function getCachedBookingPhotos():BookingPhoto[]|null{
 return cached&&Date.now()-fetchedAt<cacheAgeMs?cached:null
}
export async function loadBookingPhotos({force=false}:{force?:boolean}={}):Promise<BookingPhoto[]>{
 if(!force){const fresh=getCachedBookingPhotos();if(fresh)return fresh}
 if(pending)return pending
 const startedAt=version
 const request=(async()=>{
  const {data,error}=await client().from('booking_staff_photos').select(fields)
  if(error)throw new Error('預約圖片讀取失敗：'+error.message)
  const photos=(data as BookingPhotoRow[]||[]).map(normalize)
  if(startedAt===version){cached=photos;fetchedAt=Date.now()}
  return photos
 })()
 pending=request
 try{return await request}finally{if(pending===request)pending=null}
}
async function readPhoto(staffId:string):Promise<BookingPhoto>{
 verifyStaffId(staffId)
 const {data,error}=await client().from('booking_staff_photos').select(fields).eq('staff_id',staffId).maybeSingle()
 if(error)throw new Error('無法讀取預約照片：'+error.message)
 return data?normalize(data as BookingPhotoRow):emptyPhoto(staffId)
}
async function writePhoto(photo:BookingPhoto):Promise<BookingPhoto>{
 const first=photo.photos[0]
 const row={
  staff_id:photo.staffId,
  image_url:first?.thumbnailUrl||first?.imageUrl||null,
  object_path:first?.imagePath||null,
  photo_gallery:galleryJson(photo.photos),
  photo_display_mode:photo.displayMode,
  secondary_image_url:photo.secondaryImageUrl||null,
  secondary_object_path:photo.secondaryObjectPath,
  updated_at:new Date().toISOString(),
 }
 const {data,error}=await client().from('booking_staff_photos').upsert(row,{onConflict:'staff_id'})
  .select(fields).single()
 if(error||!data)throw new Error('儲存預約照片失敗：'+(error?.message||'沒有成功更新資料'))
 invalidate()
 return normalize(data as BookingPhotoRow)
}
async function removeObjects(paths:(string|null|undefined)[]):Promise<void>{
 const unique=[...new Set(paths.filter((path):path is string=>Boolean(path)))]
 if(!unique.length)return
 const {error}=await client().storage.from(BUCKET).remove(unique)
 if(error)console.warn('預約照片已更新，但舊圖片清理失敗：',error.message)
}
function validateImage(file:File):void{
 if(!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type))
  throw new Error('僅支援 JPG、PNG、WebP 或 AVIF 圖片')
 if(!file.size||file.size>12*1024*1024)throw new Error('來源圖片不可為空，且不可超過 12 MB')
}
async function webp(source:Blob,maxSide:number,quality:number):Promise<Blob>{
 let bitmap:ImageBitmap
 try{bitmap=await createImageBitmap(source)}catch{throw new Error('圖片無法讀取，請重新選擇 JPG、PNG 或 WebP 檔案')}
 try{
  if(!bitmap.width||!bitmap.height)throw new Error('圖片尺寸無效')
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(bitmap.width*scale))
  canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('此瀏覽器無法處理預約圖片')
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
  const result=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
   blob=>blob?resolve(blob):reject(new Error('無法轉換 WebP')),'image/webp',quality
  ))
  if(result.size>4*1024*1024)throw new Error('處理後圖片超過 4 MB，請選擇較小的圖片')
  return result
 }finally{bitmap.close()}
}
async function croppedWebp(source:Blob,crop:StaffCrop):Promise<Blob>{
 const bitmap=await createImageBitmap(source)
 try{
  const box=cropPixels(crop,bitmap.width,bitmap.height)
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.min(760,Math.round(box.width)))
  canvas.height=Math.max(1,Math.round(canvas.width/.655))
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('此瀏覽器無法處理照片取景範圍')
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
  ctx.drawImage(bitmap,box.x,box.y,box.width,box.height,0,0,canvas.width,canvas.height)
  const result=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
   blob=>blob?resolve(blob):reject(new Error('無法建立照片取景縮圖')),'image/webp',.9
  ))
  if(result.size>4*1024*1024)throw new Error('取景縮圖超過 4 MB，請縮小選取範圍')
  return result
 }finally{bitmap.close()}
}
async function uploadObject(path:string,blob:Blob):Promise<string>{
 const storage=client().storage.from(BUCKET)
 const {error}=await storage.upload(path,blob,{contentType:'image/webp',upsert:false,cacheControl:'31536000'})
 if(error)throw new Error('上傳預約圖片失敗：'+error.message)
 return storage.getPublicUrl(path).data.publicUrl
}
function objectPath(staffId:string){return 'bookings/'+staffId+'/'+crypto.randomUUID()+'.webp'}

/** Adds a new independent booking photo and its manually selected thumbnail. */
export async function uploadBookingPhoto(staffId:string,file:File,crop:StaffCrop):Promise<BookingPhoto>{
 verifyStaffId(staffId);validateImage(file)
 const current=await readPhoto(staffId)
 if(current.photos.length>=12)throw new Error('每位狐姬最多可設定 12 張預約照片')
 const [full,thumb]=await Promise.all([webp(file,1800,.9),croppedWebp(file,crop)])
 const imagePath=objectPath(staffId),thumbnailPath=objectPath(staffId),uploaded:string[]=[]
 try{
  const imageUrl=await uploadObject(imagePath,full);uploaded.push(imagePath)
  const thumbnailUrl=await uploadObject(thumbnailPath,thumb);uploaded.push(thumbnailPath)
  const next:BookingPhoto={...current,photos:[...current.photos,{
   id:crypto.randomUUID(),imageUrl,thumbnailUrl,imagePath,thumbnailPath,
  }]}
  return await writePhoto(next)
 }catch(error){await removeObjects(uploaded);throw error}
}

/** Re-crops an existing full-size booking photo without replacing its original. */
export async function updateBookingPhotoCrop(staffId:string,photoId:string,crop:StaffCrop):Promise<BookingPhoto>{
 const current=await readPhoto(staffId)
 const photo=current.photos.find(item=>item.id===photoId)
 if(!photo)throw new Error('找不到要調整的預約照片')
 let response:Response
 try{response=await fetch(photo.imageUrl,{mode:'cors',credentials:'omit'})}
 catch{throw new Error('無法讀取原始照片，請重新上傳後再調整取景範圍')}
 if(!response.ok)throw new Error('原始照片無法讀取，請重新上傳')
 const original=await response.blob()
 if(original.size>24*1024*1024)throw new Error('原始照片超過 24 MB，無法重新取景')
 const thumb=await croppedWebp(original,crop)
 const nextPath=objectPath(staffId)
 const url=await uploadObject(nextPath,thumb)
 const updated:BookingPhoto={...current,photos:current.photos.map(item=>item.id===photoId
  ?{...item,thumbnailUrl:url,thumbnailPath:nextPath}:item)}
 try{
  const saved=await writePhoto(updated)
  await removeObjects([photo.thumbnailPath])
  return saved
 }catch(error){await removeObjects([nextPath]);throw error}
}

export async function deleteBookingGalleryPhoto(staffId:string,photoId:string):Promise<BookingPhoto>{
 const current=await readPhoto(staffId)
 const photo=current.photos.find(item=>item.id===photoId)
 if(!photo)throw new Error('這張預約照片已不存在，請重新整理')
 const saved=await writePhoto({...current,photos:current.photos.filter(item=>item.id!==photoId)})
 await removeObjects([photo.imagePath,photo.thumbnailPath])
 return saved
}
export async function moveBookingPhoto(staffId:string,photoId:string,direction:-1|1):Promise<BookingPhoto>{
 const current=await readPhoto(staffId)
 const index=current.photos.findIndex(item=>item.id===photoId),target=index+direction
 if(index<0||target<0||target>=current.photos.length)return current
 const photos=[...current.photos]
 ;[photos[index],photos[target]]=[photos[target],photos[index]]
 return writePhoto({...current,photos})
}
export async function setBookingPhotoDisplayMode(staffId:string,displayMode:'single'|'gallery'):Promise<BookingPhoto>{
 const current=await readPhoto(staffId)
 return writePhoto({...current,displayMode})
}

/** The overlay is stored separately from the main portrait carousel. */
export async function uploadBookingOverlay(staffId:string,file:File):Promise<BookingPhoto>{
 verifyStaffId(staffId);validateImage(file)
 const current=await readPhoto(staffId)
 const blob=await webp(file,1000,.92)
 const path=objectPath(staffId)
 const url=await uploadObject(path,blob)
 try{
  const saved=await writePhoto({...current,secondaryImageUrl:url,secondaryObjectPath:path})
  await removeObjects([current.secondaryObjectPath])
  return saved
 }catch(error){await removeObjects([path]);throw error}
}
export async function deleteBookingOverlay(staffId:string):Promise<BookingPhoto>{
 const current=await readPhoto(staffId)
 if(!current.secondaryImageUrl)throw new Error('目前沒有設定副圖片')
 const saved=await writePhoto({...current,secondaryImageUrl:'',secondaryObjectPath:null})
 await removeObjects([current.secondaryObjectPath])
 return saved
}
