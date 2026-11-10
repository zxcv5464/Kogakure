import type { Staff, StaffRow } from '../types'
import { supabase } from './supabase'
import type { StaffOrderChange } from './staff-order'
export function rowToStaff(s: StaffRow): Staff {
 return {id:s.id,name:s.display_name,role:s.role,tagline:s.tagline,bio:s.bio,
 imageUrl:s.image_url || '',thumbnailUrl:s.thumbnail_url || s.image_url || '',
 themeColor:s.theme_color,effect:s.effect,
 socials:Array.isArray(s.socials) ? s.socials : [],
 services:Array.isArray(s.services) ? s.services : [],published:s.is_published,sortOrder:s.sort_order}
}
export function staffToRow(s: Staff): StaffRow {
 return {id:s.id,display_name:s.name,role:s.role,tagline:s.tagline,bio:s.bio,
 image_url:s.imageUrl || null,thumbnail_url:s.thumbnailUrl || null,
 theme_color:s.themeColor,effect:s.effect,socials:s.socials,services:s.services,
 is_published:s.published,sort_order:s.sortOrder}
}
export async function getStaff(includeUnpublished=false):Promise<Staff[]> {
 if (!supabase) throw new Error('尚未設定 Supabase')
 let query=supabase.from('staff').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:true})
 if (!includeUnpublished) query=query.eq('is_published',true)
 const {data,error}=await query
 if(error) throw error
 return (data as StaffRow[]).map(rowToStaff)
}
export async function saveStaff(staff: Staff, creating: boolean):Promise<void> {
 if(!supabase) throw new Error('尚未設定 Supabase')
 const row=staffToRow(staff)
 // An update must never silently recreate a profile that another admin deleted.
 const query = creating
  ? supabase.from('staff').insert(row).select('id')
  : supabase.from('staff').update(row).eq('id',row.id).select('id')
 const {data,error}=await query
 if(error) throw error
 if(!data || data.length!==1) throw new Error('沒有成功寫入任何名帖，資料可能已遭其他管理員刪除，或權限不足。請更新清單。')
}
// Usually only one row is updated. If legacy order values leave no space,
// re-spacing requires several narrow writes. Best-effort rollback and a caller
// refresh prevent the UI from claiming a partial sequence was saved.
export async function saveStaffSortChanges(changes: StaffOrderChange[]): Promise<void> {
 if (!supabase) throw new Error('尚未設定 Supabase')
 const completed: StaffOrderChange[] = []
 try {
  for (const change of changes) {
   const {data,error} = await supabase.from('staff')
    .update({sort_order:change.after}).eq('id',change.id).select('id')
   if (error) throw error
   if (data?.length !== 1) throw new Error('無法儲存排序：名帖可能已被其他管理員刪除，請更新清單')
   completed.push(change)
  }
 } catch (error) {
  for (const change of completed.reverse()) {
   try {
    const {error: rollbackError} = await supabase.from('staff')
     .update({sort_order:change.before}).eq('id',change.id)
    if (rollbackError) console.warn('排序還原失敗：',rollbackError)
   } catch (rollbackError) {
    console.warn('排序還原失敗：',rollbackError)
   }
  }
  throw error
 }
}

export async function deleteStaff(id:string):Promise<void> {
 if(!supabase) throw new Error('尚未設定 Supabase')
 const {data,error}=await supabase.from('staff').delete().eq('id',id).select('id')
 if(error) throw error
 if(!data || data.length!==1) throw new Error('沒有刪除任何名帖，資料可能已遭移除或權限不足')
}
