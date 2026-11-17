import {configured,supabaseUrl} from './config'
import {supabase} from './supabase'

export type KeepsakePhoto={id:string;storage_path:string;original_name:string}
export type KeepsakeClaim={
 id:string;guest_label:string;note:string;created_at:string;expires_at:string;keepsake_photos:KeepsakePhoto[]
}
export type PickupPhoto={id:string;name:string;url:string}
export type Pickup={guestLabel:string;note:string;expiresAt:string;photos:PickupPhoto[]}
export type Feedback={id:string;guest_name:string;is_anonymous:boolean;message:string;reply:string;status:'pending'|'published'|'hidden';created_at:string}
const bucket='keepsake-deliveries'
const db=()=>{if(!configured||!supabase)throw new Error('狐隱服務尚未連線');return supabase}
const err=(error:{message:string}|null,context:string)=>{if(error)throw new Error(context+'：'+error.message)}
export const formatExpiry=(expires:string)=>new Date(expires).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
export const isExpired=(expires:string)=>Date.parse(expires)<=Date.now()
/** New backoffice codes are explicitly set by staff: ASCII letters and
 * digits only, 8–16 characters. Historical longer codes remain valid in
 * the public lookup API until their original seven-day expiry. */
export function validateKeepsakeCode(code:string):string{
 const display=code.trim().toUpperCase()
 if(!/^[A-Z0-9]{8,16}$/.test(display))
  throw new Error('專屬領取碼須為 8～16 位英文字母或數字，不可包含空格或符號')
 return display
}
export async function createKeepsake(guestLabel:string,note:string,code:string):Promise<{claim:KeepsakeClaim;code:string}>{
 if(guestLabel.trim().length<1||guestLabel.trim().length>100)throw new Error('請輸入 1～100 字的旅人稱呼')
 if(note.length>400)throw new Error('交付備註最多 400 字')
 const display=validateKeepsakeCode(code)
 const {data:id,error}=await db().rpc('create_keepsake_claim',{
  p_guest_label:guestLabel.trim(),p_note:note.trim(),p_code:display,
 })
 err(error,'建立交付單失敗')
 if(typeof id!=='string')throw new Error('交付單建立後無法取得編號')
 const {data,error:readError}=await db().from('keepsake_claims')
  .select('id,guest_label,note,created_at,expires_at').eq('id',id).single()
 err(readError,'交付單建立後無法讀取')
 return {claim:{...(data as Omit<KeepsakeClaim,'keepsake_photos'>),keepsake_photos:[]},code:display}
}
/** A replacement invalidates all previously shared links without changing
 * the photos, claim ID, or the seven-day expiry. */
export async function updateKeepsakeCode(claimId:string,code:string):Promise<string>{
 const display=validateKeepsakeCode(code)
 const {data,error}=await db().rpc('update_keepsake_claim_code',{
  p_claim_id:claimId,p_code:display,
 })
 err(error,'變更領取碼失敗')
 if(typeof data!=='string'||!data)throw new Error('變更後無法取得新領取碼')
 return data
}
/** Code is decrypted by a permission-checked RPC only when an operator clicks Reveal. */
export async function revealKeepsakeCode(claimId:string):Promise<string>{
 const {data,error}=await db().rpc('reveal_keepsake_claim_code',{p_claim_id:claimId})
 err(error,'無法取得領取碼')
 if(typeof data!=='string'||!data)throw new Error('此交付單已過期或尚未存有可還原的領取碼')
 return data
}
export async function uploadKeepsakePhoto(claimId:string,file:File):Promise<void>{
 const allowed=new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']])
 const ext=allowed.get(file.type)
 if(!ext)throw new Error('僅接受 JPG、PNG 或 WebP 照片')
 if(file.size<=0||file.size>15*1024*1024)throw new Error('單張照片不得超過 15 MB')
 const path=claimId+'/'+crypto.randomUUID()+'.'+ext
 const storage=db().storage.from(bucket)
 const uploaded=await storage.upload(path,file,{upsert:false,contentType:file.type,cacheControl:'60'})
 err(uploaded.error,'照片上傳失敗')
 const name=(file.name||'狐影留帖.'+ext).slice(0,200)
 const inserted=await db().from('keepsake_photos')
  .insert({claim_id:claimId,storage_path:path,original_name:name})
 if(inserted.error){
  await storage.remove([path])
  throw new Error('照片登錄失敗：'+inserted.error.message)
 }
}
export async function fetchAdminKeepsakes():Promise<KeepsakeClaim[]>{
 const {data,error}=await db().from('keepsake_claims')
  .select('id,guest_label,note,created_at,expires_at,keepsake_photos(id,storage_path,original_name)')
  .order('created_at',{ascending:false}).limit(250)
 err(error,'交付清單讀取失敗')
 return (data||[]) as KeepsakeClaim[]
}
export async function deleteKeepsake(claim:KeepsakeClaim):Promise<void>{
 const paths=claim.keepsake_photos.map(photo=>photo.storage_path)
 if(paths.length){
  const result=await db().storage.from(bucket).remove(paths)
  err(result.error,'刪除照片失敗')
 }
 const result=await db().from('keepsake_claims').delete().eq('id',claim.id)
 err(result.error,'刪除交付單失敗')
}
export async function deleteKeepsakePhoto(photo:KeepsakePhoto):Promise<void>{
 const result=await db().storage.from(bucket).remove([photo.storage_path])
 err(result.error,'刪除照片失敗')
 const deleted=await db().from('keepsake_photos').delete().eq('id',photo.id)
 err(deleted.error,'刪除檔案紀錄失敗')
}
export async function adminPreviewUrl(path:string):Promise<string>{
 const {data,error}=await db().storage.from(bucket).createSignedUrl(path,120)
 err(error,'預覽照片失敗')
 return data!.signedUrl
}
export async function lookupKeepsake(code:string):Promise<Pickup>{
 if(!configured)throw new Error('照片領取服務尚未連線')
 const response=await fetch(supabaseUrl+'/functions/v1/guest-keepsakes',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'lookup',token:code}),cache:'no-store'
 })
 const data=await response.json() as Pickup&{error?:string}
 if(!response.ok)throw new Error(data.error||'暫時無法領取照片')
 return data
}
export function keepsakeShareLink(code:string):string{
 const base=import.meta.env.BASE_URL
 return window.location.origin+base+'memories#code='+encodeURIComponent(code)
}
export async function fetchPublicFeedback():Promise<Feedback[]>{
 if(!configured)return []
 const {data,error}=await db().from('guest_feedback')
  .select('id,guest_name,is_anonymous,message,reply,status,created_at')
  .eq('status','published').order('created_at',{ascending:false}).limit(80)
 err(error,'旅人迴音載入失敗')
 return (data||[]) as Feedback[]
}
export async function submitFeedback(name:string,anonymous:boolean,message:string):Promise<void>{
 const text=message.trim()
 if(text.length<2||text.length>1000)throw new Error('請輸入 2～1000 字的留言')
 if(!anonymous&&(name.trim().length<1||name.trim().length>70))throw new Error('請填寫稱呼，或選擇匿名')
 const {error}=await db().rpc('submit_guest_feedback',{
  p_name:anonymous?'':name.trim(),p_anonymous:anonymous,p_message:text
 })
 err(error,'送出留言失敗')
}
export async function fetchAdminFeedback():Promise<Feedback[]>{
 const {data,error}=await db().from('guest_feedback')
  .select('id,guest_name,is_anonymous,message,reply,status,created_at')
  .order('created_at',{ascending:false}).limit(300)
 err(error,'留言管理讀取失敗')
 return (data||[]) as Feedback[]
}
export async function moderateFeedback(id:string,status:Feedback['status'],reply:string):Promise<void>{
 if(reply.length>1000)throw new Error('館方回覆不得超過 1000 字')
 const {error}=await db().from('guest_feedback').update({status,reply:reply.trim(),updated_at:new Date().toISOString()}).eq('id',id)
 err(error,'儲存留言設定失敗')
}
export async function deleteFeedback(id:string):Promise<void>{
 const {error}=await db().from('guest_feedback').delete().eq('id',id)
 err(error,'刪除留言失敗')
}
