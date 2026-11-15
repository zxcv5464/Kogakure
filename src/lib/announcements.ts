import {configured} from './config'
import {supabase} from './supabase'

export type AnnouncementCategory='notice'|'news'
export type Announcement={
 id:string;category:AnnouncementCategory;title:string;content:string
 pinned:boolean;published:boolean;publishedAt:string|null
 createdAt:string;updatedAt:string
}
export type AnnouncementInput=Pick<Announcement,'category'|'title'|'content'|'pinned'|'published'>
type AnnouncementRow={
 id:string;category:AnnouncementCategory;title:string;content:string
 is_pinned:boolean;is_published:boolean;published_at:string|null
 created_at:string;updated_at:string
}
const fields='id,category,title,content,is_pinned,is_published,published_at,created_at,updated_at'
const map=(x:AnnouncementRow):Announcement=>({
 id:x.id,category:x.category,title:x.title,content:x.content,
 pinned:x.is_pinned,published:x.is_published,publishedAt:x.published_at,
 createdAt:x.created_at,updatedAt:x.updated_at,
})
function db(){if(!configured||!supabase)throw new Error('公告資料庫尚未連線');return supabase}

export function validateAnnouncement(input:AnnouncementInput):string|null{
 if(input.category!=='notice'&&input.category!=='news')return '請選擇館內公告或最新消息'
 const title=input.title.trim(),content=input.content.trim()
 if(title.length<1||title.length>100)return '公告標題需為 1～100 字'
 if(content.length>3000)return '公告內文最多 3000 字'
 if(!content)return '請填寫公告內文'
 return null
}

/** Visitor data: published rows only, returned as plain text to avoid HTML injection. */
export async function fetchPublicAnnouncements():Promise<Announcement[]>{
 if(!configured)return []
 const {data,error}=await db().from('site_announcements').select(fields)
  .eq('is_published',true)
  .order('is_pinned',{ascending:false})
  .order('published_at',{ascending:false})
  .limit(60)
 if(error)throw new Error('館內消息讀取失敗：'+error.message)
 return ((data||[]) as AnnouncementRow[]).map(map)
}

/** Admin data includes unpublished drafts; RLS limits this to the site owner. */
export async function fetchAdminAnnouncements():Promise<Announcement[]>{
 const {data,error}=await db().from('site_announcements').select(fields)
  .order('updated_at',{ascending:false}).limit(300)
 if(error)throw new Error('公告列表無法讀取：'+error.message)
 return ((data||[]) as AnnouncementRow[]).map(map)
}
export async function saveAnnouncement(input:AnnouncementInput,id?:string):Promise<Announcement>{
 const problem=validateAnnouncement(input)
 if(problem)throw new Error(problem)
 const payload={
  category:input.category,title:input.title.trim(),content:input.content.trim(),
  is_pinned:input.pinned,is_published:input.published,
 }
 const table=db().from('site_announcements')
 const request=id
  ?table.update(payload).eq('id',id)
  :table.insert(payload)
 const {data,error}=await request.select(fields).single()
 if(error)throw new Error('公告儲存失敗：'+error.message)
 return map(data as AnnouncementRow)
}
export async function deleteAnnouncement(id:string):Promise<void>{
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
  throw new Error('公告編號無效')
 const {error}=await db().from('site_announcements').delete().eq('id',id)
 if(error)throw new Error('公告刪除失敗：'+error.message)
}
