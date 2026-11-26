import type { Staff, StaffRow } from '../types'
import { supabase } from './supabase'
import { normalizeStaffCrop } from './staff-crop'
import type { StaffOrderChange } from './staff-order'
function normalizePhotos(value:unknown,staffId:string,imageUrl:string,thumbnailUrl:string){
 const raw=Array.isArray(value)?value:[]
 const photos=raw.flatMap((item,index)=>{
  if(!item||typeof item!=='object')return []
  const photo=item as Record<string,unknown>
  const full=typeof photo.image_url==='string'?photo.image_url:''
  const thumb=typeof photo.thumbnail_url==='string'?photo.thumbnail_url:full
  if(!full&&!thumb)return []
  return [{id:typeof photo.id==='string'?photo.id:'legacy-'+staffId+'-'+index,
   imageUrl:full||thumb,thumbnailUrl:thumb||full,
   imagePath:typeof photo.image_path==='string'?photo.image_path:null,
   thumbnailPath:typeof photo.thumbnail_path==='string'?photo.thumbnail_path:null,
   mobileCrop:normalizeStaffCrop(photo.mobile_crop)}]
 })
 if(photos.length)return photos
 if(imageUrl||thumbnailUrl)return [{id:'legacy-'+staffId,imageUrl:imageUrl||thumbnailUrl,
  thumbnailUrl:thumbnailUrl||imageUrl,imagePath:null,thumbnailPath:null}]
 return []
}
export function rowToStaff(s: StaffRow): Staff {
 const imageUrl=s.image_url||'',thumbnailUrl=s.thumbnail_url||s.image_url||''
 return {id:s.id,name:s.display_name,role:s.role,tagline:s.tagline,bio:s.bio,
 imageUrl,thumbnailUrl,photos:normalizePhotos(s.photo_gallery,s.id,imageUrl,thumbnailUrl),
 photoDisplayMode:s.photo_display_mode==='gallery'?'gallery':'single',
 themeColor:s.theme_color,effect:s.effect,
 socials:Array.isArray(s.socials) ? s.socials : [],
 services:Array.isArray(s.services) ? s.services : [],published:s.is_published,bookingVisible:s.is_booking_visible!==false,
 bookingAllowedPlanIds:Array.isArray(s.booking_allowed_plan_ids)?s.booking_allowed_plan_ids:null,
 bookingAllowJoint:s.booking_allow_joint!==false,
 bookingPlanCaps:s.booking_plan_caps&&typeof s.booking_plan_caps==='object'?s.booking_plan_caps:{},sortOrder:s.sort_order}
}
export function staffToRow(s: Staff): StaffRow {
 return {id:s.id,display_name:s.name,role:s.role,tagline:s.tagline,bio:s.bio,
 image_url:s.photos?.[0]?.imageUrl||s.imageUrl||null,
 thumbnail_url:s.photos?.[0]?.thumbnailUrl||s.thumbnailUrl||null,
 photo_gallery:(s.photos||[]).map(photo=>({id:photo.id,image_url:photo.imageUrl,
  thumbnail_url:photo.thumbnailUrl,image_path:photo.imagePath,thumbnail_path:photo.thumbnailPath,mobile_crop:photo.mobileCrop||null})),
 photo_display_mode:s.photoDisplayMode==='gallery'?'gallery':'single',
 theme_color:s.themeColor,effect:s.effect,socials:s.socials,services:s.services,
 is_published:s.published,is_booking_visible:s.bookingVisible,
 booking_allowed_plan_ids:s.bookingAllowedPlanIds,booking_allow_joint:s.bookingAllowJoint,
 booking_plan_caps:s.bookingPlanCaps,sort_order:s.sortOrder}
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
 // Nomination availability is owned by BookingManagement. A stale staff
 // editor must never overwrite a recently changed booking setting.
 const {is_booking_visible:_bookingVisible,booking_allowed_plan_ids:_allowedPlans,
  booking_allow_joint:_allowJoint,booking_plan_caps:_planCaps,...profileRow}=row
 void _bookingVisible;void _allowedPlans;void _allowJoint;void _planCaps
 // An update must never silently recreate a profile that another admin deleted.
 const query = creating
  ? supabase.from('staff').insert(row).select('id')
  : supabase.from('staff').update(profileRow).eq('id',row.id).select('id')
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
