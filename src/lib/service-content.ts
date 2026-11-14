import {configured} from './config'
import {supabase} from './supabase'

export type ServiceEntry={
 id:string;slug:string;category:string;english:string;title:string;quote:string
 paragraphs:string[];details:string[];photoLabel:string;imageUrl:string|null
 sortOrder:number;published:boolean;updatedAt:string
}
type ServiceRow={
 id:string;slug:string;category:string;english_label:string;title:string;quote:string
 paragraphs:string[];details:string[];photo_label:string;image_url:string|null
 sort_order:number;is_published:boolean;updated_at:string
}
// Read-only offline showcase. The online public page loads published entries
// from Supabase; editing and adding entries does not require a code deployment.
export const previewServices:ServiceEntry[]=[
 {id:'10000000-0000-4000-8000-000000000101',slug:'bath',category:'湯浴之儀',english:'THE BATHING RITUAL',
  title:'一湯入夢，洗去塵囂',quote:'「暖湯氤氳，願旅途的疲憊就此消散。」',
  paragraphs:['循著山林深處的狐火，走進隱於夜色中的湯宿。讓輕柔燈影與氤氳水氣，陪你暫時放下旅途的紛擾。','無論想獨自沉澱，或與同行旅人靜靜相聚，都願這段湯浴時光，成為今夜值得收藏的片刻。'],
  details:['湯泉休憩','靜謐相聚','隱世湯宿'],photoLabel:'湯浴形象照片',imageUrl:null,sortOrder:10,published:true,updatedAt:''},
 {id:'10000000-0000-4000-8000-000000000102',slug:'divination',category:'占卜之儀',english:'THE DIVINATION RITUAL',
  title:'循狐火，探尋心中之願',quote:'「命運藏於夜色，答案或許就在心念之間。」',
  paragraphs:['於幽燈與狐影交織之處，讓館內的占卜者陪你走進一場帶著神祕色彩的對話，傾聽未說出口的心事。','無須急著尋找唯一的答案。願這一場隱世之儀，能為你的故事添上一點光亮與想像。'],
  details:['神祕對談','心願指引','角色扮演體驗'],photoLabel:'占卜形象照片',imageUrl:null,sortOrder:20,published:true,updatedAt:''},
 {id:'10000000-0000-4000-8000-000000000103',slug:'polaroid',category:'留影之儀',english:'THE FOXFIRE KEEPSAKE',
  title:'一瞬狐影，留住今宵',quote:'「若此夜終將散去，便讓一紙留影，替我們記得相逢。」',
  paragraphs:['當狐火映過衣袖，邀請同行旅人與館中狐姬並肩入鏡。於館內喜愛的角落，留下一張屬於今夜的拍立得合照。','以 FFXIV 遊戲內合照化作拍立得風格的紀念留影，將微笑、月色與相逢收藏在小小畫框裡。實際拍攝及交付方式，依館內接待安排為準。'],
  details:['狐姬合影','拍立得風格','旅途紀念'],photoLabel:'拍立得合照展示照片',imageUrl:null,sortOrder:30,published:true,updatedAt:''},
]
export const orderServices=(entries:ServiceEntry[])=>[...entries].sort((a,b)=>a.sortOrder-b.sortOrder||a.title.localeCompare(b.title,'zh-TW'))
function toEntry(row:ServiceRow):ServiceEntry{
 return {id:row.id,slug:row.slug,category:row.category,english:row.english_label,
  title:row.title,quote:row.quote,paragraphs:row.paragraphs||[],details:row.details||[],
  photoLabel:row.photo_label,imageUrl:row.image_url,sortOrder:row.sort_order,
  published:row.is_published,updatedAt:row.updated_at}
}
function client(){if(!configured||!supabase)throw new Error('服務內容資料庫尚未連線');return supabase}
export async function fetchServiceContents(includeDrafts=false):Promise<ServiceEntry[]>{
 let q=client().from('service_contents').select('*').order('sort_order',{ascending:true})
 if(!includeDrafts)q=q.eq('is_published',true)
 const {data,error}=await q
 if(error)throw new Error(error.message||'無法讀取服務內容')
 return orderServices((data as ServiceRow[]).map(toEntry))
}
function assertWritten(rows:{id:string}[]|null,operation:string){
 if(!rows||rows.length!==1)throw new Error(operation+'未成功；資料可能已被其他管理者更新，請重新整理')
}
export async function saveServiceContent(service:ServiceEntry,creating:boolean):Promise<void>{
 const row={
  id:service.id,slug:service.slug,category:service.category.trim(),english_label:service.english.trim(),
  title:service.title.trim(),quote:service.quote.trim(),paragraphs:service.paragraphs,
  details:service.details,photo_label:service.photoLabel.trim(),image_url:service.imageUrl||null,
  sort_order:service.sortOrder,is_published:service.published,
 }
 const db=client()
 if(creating){
  const {data,error}=await db.from('service_contents').insert(row).select('id')
  if(error)throw new Error(error.message)
  assertWritten(data,'新增服務')
 }else{
  const {data,error}=await db.from('service_contents').update(row).eq('id',service.id)
   .eq('updated_at',service.updatedAt).select('id')
  if(error)throw new Error(error.message)
  assertWritten(data,'儲存服務')
 }
}
export async function deleteServiceContent(service:ServiceEntry):Promise<void>{
 const {data,error}=await client().from('service_contents').delete()
  .eq('id',service.id).eq('updated_at',service.updatedAt).select('id')
 if(error)throw new Error(error.message)
 assertWritten(data,'刪除服務')
}
export function validateServicePhoto(file:File):string|null{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))return '僅支援 JPG、PNG 或 WebP 照片'
 if(file.size>6*1024*1024)return '照片請勿超過 6 MB'
 if(!file.size)return '圖片檔案是空的'
 return null
}
export async function uploadServicePhoto(file:File,serviceId:string):Promise<{url:string;path:string}>{
 const problem=validateServicePhoto(file)
 if(problem)throw new Error(problem)
 const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
 const path='services/'+serviceId+'/'+crypto.randomUUID()+'.'+extension
 const db=client()
 const {error}=await db.storage.from('service-media').upload(path,file,{
  contentType:file.type,cacheControl:'3600',upsert:false
 })
 if(error)throw new Error('照片上傳失敗：'+error.message)
 const {data}=db.storage.from('service-media').getPublicUrl(path)
 if(!data.publicUrl)throw new Error('無法取得照片公開網址')
 return {url:data.publicUrl,path}
}
export async function removeUnusedServicePhoto(path:string):Promise<void>{
 if(!/^services\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(path))return
 const {error}=await client().storage.from('service-media').remove([path])
 if(error)throw new Error(error.message)
}
