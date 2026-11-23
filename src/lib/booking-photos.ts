import {supabase} from './supabase'

const BUCKET='booking-media'
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type BookingPhoto={staffId:string;imageUrl:string;objectPath:string|null}
type BookingPhotoRow={staff_id:string;image_url:string;object_path:string|null}
const cacheAgeMs=60_000
let cached:BookingPhoto[]|null=null
let fetchedAt=0
let pending:Promise<BookingPhoto[]>|null=null
let version=0

function client(){if(!supabase)throw new Error('預約照片資料庫尚未連線');return supabase}
function verifyStaffId(staffId:string){
 if(!idPattern.test(staffId))throw new Error('館員識別資料不正確')
}
function normalize(row:BookingPhotoRow):BookingPhoto{
 return {staffId:row.staff_id,imageUrl:row.image_url,objectPath:row.object_path}
}
export function invalidateBookingPhotos():void{
 cached=null;fetchedAt=0;pending=null;version++
}
export function getCachedBookingPhotos():BookingPhoto[]|null{
 return cached&&Date.now()-fetchedAt<cacheAgeMs?cached:null
}
export async function loadBookingPhotos({force=false}:{force?:boolean}={}):Promise<BookingPhoto[]>{
 if(!force){const fresh=getCachedBookingPhotos();if(fresh)return fresh}
 if(pending)return pending
 const startedAt=version
 const request=(async()=>{
  const {data,error}=await client().from('booking_staff_photos').select('staff_id,image_url,object_path')
  if(error)throw new Error('預約圖片讀取失敗：'+error.message)
  const photos=(data as BookingPhotoRow[]||[]).map(normalize)
  if(startedAt===version){cached=photos;fetchedAt=Date.now()}
  return photos
 })()
 pending=request
 try{return await request}
 finally{if(pending===request)pending=null}
}

/** Prepare booking-only pictures without altering staff profile photos. */
async function optimizedWebp(file:File):Promise<Blob>{
 if(!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type))
  throw new Error('僅支援 JPG、PNG、WebP 或 AVIF 圖片')
 if(!file.size||file.size>12*1024*1024)throw new Error('來源圖片不可超過 12 MB')
 let bitmap:ImageBitmap
 try{bitmap=await createImageBitmap(file)}
 catch{throw new Error('圖片無法讀取，請使用 JPG 或 PNG 檔案')}
 try{
  if(!bitmap.width||!bitmap.height)throw new Error('圖片尺寸無效')
  const ratio=Math.min(1,1200/Math.max(bitmap.width,bitmap.height))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio))
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio))
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('瀏覽器無法轉換圖片')
  ctx.imageSmoothingEnabled=true
  ctx.imageSmoothingQuality='high'
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
  const result=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
   value=>value?resolve(value):reject(new Error('無法產生 WebP 預約圖片')),'image/webp',.88
  ))
  if(result.size>4*1024*1024)throw new Error('處理後圖片超過 4 MB，請選擇較小圖片')
  return result
 }finally{bitmap.close()}
}

export async function uploadBookingPhoto(staffId:string,file:File):Promise<BookingPhoto>{
 verifyStaffId(staffId)
 const db=client()
 const blob=await optimizedWebp(file)
 const {data:existing,error:fetchError}=await db.from('booking_staff_photos')
  .select('object_path').eq('staff_id',staffId).maybeSingle()
 if(fetchError)throw new Error('無法讀取原預約圖片：'+fetchError.message)
 const path='bookings/'+staffId+'/'+crypto.randomUUID()+'.webp'
 const storage=db.storage.from(BUCKET)
 const {error:uploadError}=await storage.upload(path,blob,{
  contentType:'image/webp',upsert:false,cacheControl:'31536000',
 })
 if(uploadError)throw new Error('上傳預約圖片失敗：'+uploadError.message)
 const publicUrl=storage.getPublicUrl(path).data.publicUrl
 const {data,error}=await db.from('booking_staff_photos')
  .upsert({staff_id:staffId,image_url:publicUrl,object_path:path,updated_at:new Date().toISOString()},{onConflict:'staff_id'})
  .select('staff_id,image_url,object_path').single()
 if(error||!data){
  await storage.remove([path]).catch(()=>{})
  throw new Error('儲存預約圖片失敗：'+(error?.message||'沒有成功更新圖片'))
 }
 // The previous file belongs exclusively to booking pictures. Never remove staff-media objects.
 if(existing?.object_path&&existing.object_path!==path){
  const {data:latest}=await db.from('booking_staff_photos')
   .select('object_path').eq('staff_id',staffId).maybeSingle()
  if(latest?.object_path===path)
   await storage.remove([existing.object_path]).catch(()=>{})
 }
 invalidateBookingPhotos()
 return normalize(data as BookingPhotoRow)
}

export async function deleteBookingPhoto(staffId:string):Promise<void>{
 verifyStaffId(staffId)
 const db=client()
 const {data,error}=await db.from('booking_staff_photos')
  .delete().eq('staff_id',staffId).select('object_path')
 if(error)throw new Error('刪除預約圖片失敗：'+error.message)
 if(!data?.length)throw new Error('這位人員目前沒有預約專用圖片')
 const paths=data.map(item=>item.object_path).filter((item):item is string=>Boolean(item))
 if(paths.length)await db.storage.from(BUCKET).remove(paths).catch(()=>{})
 invalidateBookingPhotos()
}
