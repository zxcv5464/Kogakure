import {configured} from './config'
import {supabase} from './supabase'

export type BgmSource='default'|'upload'|'direct'|'youtube'
export type BgmSettings={
 enabled:boolean;source:BgmSource;url:string;title:string;volume:number;loop:boolean;updatedAt:string
}
export type UploadedBgm={path:string;name:string;url:string;size:number;updatedAt:string}
export const DEFAULT_BGM_URL='https://bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'
export const DEFAULT_BGM:BgmSettings={
 enabled:true,source:'default',url:'',title:'みやびごころ',volume:0.24,loop:true,updatedAt:'',
}
export const BGM_BUCKET='bgm-media'
export const BGM_MAX_BYTES=20*1024*1024
const MIME_TYPES=new Set([
 'audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav',
 'audio/mp4','audio/x-m4a','audio/aac','audio/x-aac','audio/webm','audio/flac','audio/x-flac','audio/wave',
])
const FILE_EXT=/\.(?:mp3|ogg|wav|m4a|aac|webm|flac)$/i
const fields='enabled,source_kind,source_url,track_title,volume,repeat_track,updated_at'
type BgmRow={
 enabled:boolean;source_kind:BgmSource;source_url:string;track_title:string;
 volume:number;repeat_track:boolean;updated_at:string
}
function db(){if(!supabase||!configured)throw new Error('音樂管理資料庫尚未連線');return supabase}
function map(row:BgmRow):BgmSettings{return {
 enabled:row.enabled,source:row.source_kind,url:row.source_url,
 title:row.track_title,volume:row.volume,loop:row.repeat_track,updatedAt:row.updated_at,
}}
export function youtubeVideoId(input:string):string|null{
 try{
  const u=new URL(input)
  if(u.protocol!=='https:'||u.username||u.password)return null
  let id=''
  const host=u.hostname.toLowerCase()
  if(host==='youtu.be')id=u.pathname.split('/')[1]||''
  else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com',
   'www.youtube-nocookie.com','youtube-nocookie.com'].includes(host)){
   if(u.pathname==='/watch')id=u.searchParams.get('v')||''
   else if(/^\/(shorts|embed|live)\//.test(u.pathname))id=u.pathname.split('/')[2]||''
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id)?id:null
 }catch{return null}
}
export function checkBgm(input:BgmSettings):string|null{
 if(!['default','upload','direct','youtube'].includes(input.source))return '請選擇音樂來源'
 if(!input.title.trim()||input.title.trim().length>120)return '音樂名稱需為 1～120 字'
 if(!Number.isFinite(input.volume)||input.volume<0||input.volume>1)return '音量設定超出範圍'
 if(input.source==='default')return null
 if(input.url.length>2048)return '音樂網址過長'
 if(input.source==='youtube')return youtubeVideoId(input.url)?null:'請貼上有效的 YouTube 影片網址'
 let url:URL
 try{url=new URL(input.url)}catch{return '請輸入有效的 HTTPS 音訊檔網址'}
 if(url.protocol!=='https:'||url.username||url.password)return '音樂檔請使用 HTTPS 網址'
 if(input.source==='upload'){
  const publicPath='/storage/v1/object/public/'+BGM_BUCKET+'/tracks/'
  const expected=new URL(db().storage.from(BGM_BUCKET).getPublicUrl('tracks/preview.mp3').data.publicUrl)
  if(url.origin!==expected.origin||!url.pathname.startsWith(publicPath)||!FILE_EXT.test(url.pathname))
   return '請從已上傳的音樂清單選擇檔案'
 }else if(!FILE_EXT.test(url.pathname)){
  return '音樂網址必須直接指向 MP3、OGG、WAV、M4A、AAC、WebM 或 FLAC 檔案'
 }
 return null
}
export function currentAudioUrl(settings:BgmSettings):string{
 return settings.source==='default'?DEFAULT_BGM_URL:
  settings.source==='youtube'?'':settings.url
}
export async function readPublicBgm():Promise<BgmSettings>{
 if(!configured||!supabase)return {...DEFAULT_BGM}
 const {data,error}=await db().from('site_bgm_settings').select(fields).eq('id',1).maybeSingle()
 if(error||!data)return {...DEFAULT_BGM}
 return map(data as BgmRow)
}
export async function readAdminBgm():Promise<BgmSettings>{
 const {data,error}=await db().from('site_bgm_settings').select(fields).eq('id',1).single()
 if(error||!data)throw new Error('無法讀取館內背景音樂：'+(error?.message||'設定不存在'))
 return map(data as BgmRow)
}
export async function saveBgm(input:BgmSettings):Promise<BgmSettings>{
 const problem=checkBgm(input)
 if(problem)throw new Error(problem)
 const {data,error}=await db().from('site_bgm_settings').update({
  enabled:input.enabled,source_kind:input.source,source_url:input.source==='default'?'':input.url.trim(),
  track_title:input.title.trim(),volume:DEFAULT_BGM.volume,repeat_track:input.loop,
 }).eq('id',1).select(fields).single()
 if(error||!data)throw new Error('背景音樂設定無法儲存：'+(error?.message||'無權修改'))
 return map(data as BgmRow)
}
export async function listUploadedBgm():Promise<UploadedBgm[]>{
 const {data,error}=await db().storage.from(BGM_BUCKET).list('tracks',{limit:100,sortBy:{column:'created_at',order:'desc'}})
 if(error)throw new Error('音樂檔案列表讀取失敗：'+error.message)
 return (data||[]).filter(item=>item.name&&FILE_EXT.test(item.name)).map(item=>{
  const path='tracks/'+item.name
  return {path,name:item.name.replace(/^[a-f0-9-]{36}-/i,''),size:item.metadata?.size||0,
   updatedAt:item.updated_at||item.created_at||'',url:db().storage.from(BGM_BUCKET).getPublicUrl(path).data.publicUrl}
 })
}
export async function uploadBgm(file:File):Promise<UploadedBgm>{
 if(file.size<1||file.size>BGM_MAX_BYTES)throw new Error('音樂檔案需小於 20 MB')
 if(!FILE_EXT.test(file.name)||!MIME_TYPES.has(file.type))throw new Error('只接受 MP3、OGG、WAV、M4A、AAC、WebM 或 FLAC 音樂檔')
 const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-95)
 const path='tracks/'+crypto.randomUUID()+'-'+safeName
 const {error}=await db().storage.from(BGM_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type})
 if(error)throw new Error('音樂上傳失敗：'+error.message)
 return {path,name:file.name,size:file.size,updatedAt:new Date().toISOString(),
  url:db().storage.from(BGM_BUCKET).getPublicUrl(path).data.publicUrl}
}
export async function deleteUploadedBgm(path:string):Promise<void>{
 if(!/^tracks\/[a-f0-9-]{36}-[A-Za-z0-9._-]+\.(mp3|ogg|wav|m4a|aac|webm|flac)$/i.test(path))
  throw new Error('檔案路徑不正確')
 const {error}=await db().storage.from(BGM_BUCKET).remove([path])
 if(error)throw new Error('無法刪除音樂檔案：'+error.message)
}
