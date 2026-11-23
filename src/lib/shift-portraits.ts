import {supabase} from './supabase'

const BUCKET='shift-avatars'
export type ShiftPortraitRecord={userId:string;path:string;url:string}

function client(){if(!supabase)throw new Error('排班頭像資料庫尚未連線');return supabase}
function imageUrl(path:string):string{return client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl}
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function checkedId(id:string){if(!validId.test(id))throw new Error('出勤人員資料無效')}

export async function listShiftPortraits():Promise<ShiftPortraitRecord[]>{
 const {data,error}=await client().from('shift_profile_images').select('user_id,image_path')
 if(error)throw new Error('讀取值班頭像失敗（請確認已安裝新版排班資料表）：'+error.message)
 return (data||[]).map(row=>({userId:row.user_id,path:row.image_path,url:imageUrl(row.image_path)}))
}

/** Retain the source image ratio in an optimized WebP, without any square crop. */
async function convertPortrait(file:File):Promise<Blob>{
 if(!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type))
  throw new Error('請選擇 JPG、PNG、WebP 或 AVIF 圖片')
 if(!file.size||file.size>12*1024*1024)throw new Error('圖片需小於 12 MB')
 let bitmap:ImageBitmap
 try{bitmap=await createImageBitmap(file)}
 catch{throw new Error('無法開啟圖片，請改用 JPG 或 PNG 格式')}
 try{
  if(!bitmap.width||!bitmap.height)throw new Error('圖片尺寸無效')
  const canvas=document.createElement('canvas')
  const scale=Math.min(1,720/Math.max(bitmap.width,bitmap.height))
  canvas.width=Math.max(1,Math.round(bitmap.width*scale))
  canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  const context=canvas.getContext('2d')
  if(!context)throw new Error('瀏覽器無法處理圖片')
  context.imageSmoothingEnabled=true
  context.imageSmoothingQuality='high'
  context.drawImage(bitmap,0,0,canvas.width,canvas.height)
  const blob=await new Promise<Blob>((resolve,reject)=>
   canvas.toBlob(value=>value?resolve(value):reject(new Error('無法產生頭像縮圖')),'image/webp',.86))
  if(blob.size>3*1024*1024)throw new Error('頭像輸出檔案過大')
  return blob
 }finally{bitmap.close()}
}

export async function uploadShiftPortrait(userId:string,file:File):Promise<ShiftPortraitRecord>{
 checkedId(userId)
 const db=client()
 const blob=await convertPortrait(file)
 const {data:previous,error:readError}=await db.from('shift_profile_images')
  .select('image_path').eq('user_id',userId).maybeSingle()
 if(readError)throw new Error('讀取原頭像失敗：'+readError.message)
 const path='avatars/'+userId+'/'+crypto.randomUUID()+'.webp'
 const {error:uploadError}=await db.storage.from(BUCKET).upload(path,blob,{
  contentType:'image/webp',upsert:false,cacheControl:'31536000'
 })
 if(uploadError)throw new Error('上傳頭像失敗：'+uploadError.message)
 const {data,error}=await db.from('shift_profile_images')
  .upsert({user_id:userId,image_path:path,updated_at:new Date().toISOString()},{onConflict:'user_id'})
  .select('user_id,image_path').single()
 if(error||!data){
  await db.storage.from(BUCKET).remove([path]).catch(()=>{})
  throw new Error('儲存頭像失敗：'+(error?.message||'資料未寫入'))
 }
 // Delete the obsolete upload only if this exact image is still selected.
 if(previous?.image_path&&previous.image_path!==path){
  const {data:current}=await db.from('shift_profile_images')
   .select('image_path').eq('user_id',userId).maybeSingle()
  if(current?.image_path===path)
   await db.storage.from(BUCKET).remove([previous.image_path]).catch(()=>{})
 }
 return {userId,path,url:imageUrl(path)}
}

export async function removeShiftPortrait(userId:string):Promise<void>{
 checkedId(userId)
 const db=client()
 const {data,error}=await db.from('shift_profile_images')
  .delete().eq('user_id',userId).select('image_path')
 if(error)throw new Error('移除頭像失敗：'+error.message)
 if(!data?.length)throw new Error('頭像已不存在或目前沒有修改權限')
 // The database reference is removed first so failed storage cleanup is harmless.
 await db.storage.from(BUCKET).remove(data.map(row=>row.image_path)).catch(()=>{})
}
