import {supabase} from './supabase'
export type ShiftOpenDay={date:string;open:boolean;hours:string;note:string;eventTitle:string}
export type ShiftAttendance={date:string;employeeId:string;name:string;source:'employee'|'owner'}
export type ShiftCalendarData={days:ShiftOpenDay[];attendance:ShiftAttendance[]}
export type ShiftEmployee={id:string;name:string;accountName?:string}

function client(){if(!supabase)throw new Error('排班資料庫尚未連線');return supabase}
function ensureChanged(rows:{shift_date:string}[]|null,action:string){
 if(!rows||rows.length!==1)throw new Error(action+'沒有成功，請重新載入後重試。')
}
export async function fetchShifts(start:string,end:string):Promise<ShiftCalendarData>{
 const db=client()
 const [a,b,c]=await Promise.all([
  db.from('shift_open_days').select('shift_date,is_open,hours_label,note,event_title').gte('shift_date',start).lte('shift_date',end).order('shift_date'),
  db.from('shift_attendance').select('shift_date,employee_id,employee_name').gte('shift_date',start).lte('shift_date',end).order('employee_name'),
  db.from('shift_owner_attendance').select('shift_date,owner_id,display_name').gte('shift_date',start).lte('shift_date',end).order('display_name'),
 ])
 if(a.error)throw new Error('讀取營業日期失敗：'+a.error.message)
 if(b.error)throw new Error('讀取員工出勤失敗：'+b.error.message)
 if(c.error)throw new Error('讀取管理員出勤失敗：'+c.error.message)
 return {
  days:(a.data||[]).map(r=>({date:r.shift_date,open:r.is_open,hours:r.hours_label||'',note:r.note||'',eventTitle:r.event_title||''})),
  attendance:[
   ...(b.data||[]).map(r=>({date:r.shift_date,employeeId:r.employee_id,name:r.employee_name,source:'employee' as const})),
   ...(c.data||[]).map(r=>({date:r.shift_date,employeeId:r.owner_id,name:r.display_name,source:'owner' as const})),
  ].sort((first,second)=>first.date.localeCompare(second.date)||first.name.localeCompare(second.name,'zh-TW')),
 }
}
export async function setShiftOpening(date:string,kind:'open'|'closed'|'unannounced',hours:string,note:string,eventTitle:string):Promise<void>{
 const db=client()
 if(kind==='unannounced'){
  const {error}=await db.from('shift_open_days').delete().eq('shift_date',date)
  if(error)throw new Error(error.message)
  return
 }
 if(hours.length>80||note.length>240||eventTitle.trim().length>120)throw new Error('營業時間、活動名稱或備註過長')
 const {data,error}=await db.from('shift_open_days').upsert({
  shift_date:date,is_open:kind==='open',hours_label:kind==='open'?hours.trim():'',
  note:note.trim(),event_title:kind==='open'?eventTitle.trim():'',
 },{onConflict:'shift_date'}).select('shift_date')
 if(error)throw new Error(error.message)
 ensureChanged(data,'營業日設定')
}
/** Display name is public RP data, never an authorization claim. */
export function validateShiftName(value:string):string{
 const trimmed=value.trim()
 if(!trimmed||trimmed.length>100)throw new Error('出勤顯示名稱請填寫 1～100 字')
 return trimmed
}
/** Only the authenticated user's own shift row can be renamed.
 * PostgreSQL column GRANT prevents modifying shift_date or identity. */
export async function renameOwnShiftAttendance(
 date:string,source:'employee'|'owner',name:string
):Promise<void>{
 const displayName=validateShiftName(name)
 const db=client()
 const {data:{user},error:userError}=await db.auth.getUser()
 if(userError||!user)throw new Error('登入狀態已過期，請重新登入')
 const table=source==='owner'?'shift_owner_attendance':'shift_attendance'
 const key=source==='owner'?'owner_id':'employee_id'
 const column=source==='owner'?'display_name':'employee_name'
 const {data,error}=await db.from(table).update({[column]:displayName})
  .eq('shift_date',date).eq(key,user.id).select('shift_date')
 if(error)throw new Error('更新出勤名稱失敗：'+error.message)
 ensureChanged(data,'更新我的出勤名稱')
}
export async function markShiftAttendance(date:string,employee:ShiftEmployee):Promise<void>{
 const displayName=validateShiftName(employee.name)
 const {data,error}=await client().from('shift_attendance').insert({
  shift_date:date,employee_id:employee.id,employee_name:displayName,
 }).select('shift_date')
 if(error){
  if(error.code==='23505')throw new Error('這位館員已登記當日出勤，請更新清單')
  throw new Error(error.message)
 }
 ensureChanged(data,'出勤登記')
}
export async function markOwnerShiftAttendance(date:string,name:string):Promise<void>{
 const displayName=validateShiftName(name)
 const db=client()
 const {data:{user},error:userError}=await db.auth.getUser()
 if(userError||!user)throw new Error('管理員登入已過期，請重新登入')
 const {data,error}=await db.from('shift_owner_attendance').insert({
  shift_date:date,owner_id:user.id,display_name:displayName,
 }).select('shift_date')
 if(error){
  if(error.code==='23505')throw new Error('您已登記這一天的出勤，請更新清單')
  throw new Error(error.message)
 }
 ensureChanged(data,'管理員自行登記出勤')
}
export async function unmarkShiftAttendance(date:string,employeeId:string,source:'employee'|'owner'='employee'):Promise<void>{
 const db=client()
 const table=source==='owner'?'shift_owner_attendance':'shift_attendance'
 const identity=source==='owner'?'owner_id':'employee_id'
 const {data,error}=await db.from(table).delete()
  .eq('shift_date',date).eq(identity,employeeId).select('shift_date')
 if(error)throw new Error(error.message)
 ensureChanged(data,'取消出勤')
}
/** A manager reads this preference, while an employee can update only their
 * own shift_display_name via a column-scoped RLS UPDATE policy. */
export async function fetchOwnPreferredShiftName(employeeId:string):Promise<string|null>{
 if(!employeeId)return null
 const {data,error}=await client().from('employee_accounts')
  .select('shift_display_name').eq('user_id',employeeId).eq('active',true).maybeSingle()
 if(error)throw new Error('讀取常用出勤名稱失敗：'+error.message)
 return data?.shift_display_name||null
}
export async function saveOwnPreferredShiftName(name:string):Promise<void>{
 const displayName=validateShiftName(name)
 const db=client()
 const {data:{user},error:identityError}=await db.auth.getUser()
 if(identityError||!user)throw new Error('登入狀態已過期，請重新登入')
 const {data,error}=await db.from('employee_accounts')
  .update({shift_display_name:displayName})
  .eq('user_id',user.id).eq('active',true).select('user_id')
 if(error)throw new Error('儲存常用出勤名稱失敗：'+error.message)
 if(!data||data.length!==1)throw new Error('只能修改自己已啟用的員工帳號出勤名稱')
}
export async function listActiveShiftEmployees():Promise<ShiftEmployee[]>{
 const {data,error}=await client().from('employee_accounts').select('user_id,display_name,shift_display_name')
  .eq('active',true).order('display_name')
 if(error)throw new Error(error.message)
 return (data||[]).map(r=>({id:r.user_id,name:r.shift_display_name||r.display_name,accountName:r.display_name}))
}
