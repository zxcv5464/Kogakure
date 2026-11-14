import {supabase} from './supabase'
export type ShiftOpenDay={date:string;open:boolean;hours:string;note:string}
export type ShiftAttendance={date:string;employeeId:string;name:string}
export type ShiftCalendarData={days:ShiftOpenDay[];attendance:ShiftAttendance[]}
export type ShiftEmployee={id:string;name:string}

function client(){if(!supabase)throw new Error('排班資料庫尚未連線');return supabase}
function ensureChanged(rows:{shift_date:string}[]|null,action:string){
 if(!rows||rows.length!==1)throw new Error(action+'沒有成功，請重新載入後重試。')
}
export async function fetchShifts(start:string,end:string):Promise<ShiftCalendarData>{
 const db=client()
 const [a,b]=await Promise.all([
  db.from('shift_open_days').select('shift_date,is_open,hours_label,note').gte('shift_date',start).lte('shift_date',end).order('shift_date'),
  db.from('shift_attendance').select('shift_date,employee_id,employee_name').gte('shift_date',start).lte('shift_date',end).order('employee_name'),
 ])
 if(a.error)throw new Error('讀取營業日期失敗：'+a.error.message)
 if(b.error)throw new Error('讀取出勤資料失敗：'+b.error.message)
 return {
  days:(a.data||[]).map(r=>({date:r.shift_date,open:r.is_open,hours:r.hours_label||'',note:r.note||''})),
  attendance:(b.data||[]).map(r=>({date:r.shift_date,employeeId:r.employee_id,name:r.employee_name})),
 }
}
export async function setShiftOpening(date:string,kind:'open'|'closed'|'unannounced',hours:string,note:string):Promise<void>{
 const db=client()
 if(kind==='unannounced'){
  const {error}=await db.from('shift_open_days').delete().eq('shift_date',date)
  if(error)throw new Error(error.message)
  return
 }
 if(hours.length>80||note.length>240)throw new Error('營業時間或備註過長')
 const {data,error}=await db.from('shift_open_days').upsert({
  shift_date:date,is_open:kind==='open',hours_label:kind==='open'?hours.trim():'',
  note:note.trim(),
 },{onConflict:'shift_date'}).select('shift_date')
 if(error)throw new Error(error.message)
 ensureChanged(data,'營業日設定')
}
export async function markShiftAttendance(date:string,employee:ShiftEmployee):Promise<void>{
 const {data,error}=await client().from('shift_attendance').insert({
  shift_date:date,employee_id:employee.id,employee_name:employee.name,
 }).select('shift_date')
 if(error){
  if(error.code==='23505')throw new Error('這位館員已登記當日出勤，請更新清單')
  throw new Error(error.message)
 }
 ensureChanged(data,'出勤登記')
}
export async function unmarkShiftAttendance(date:string,employeeId:string):Promise<void>{
 const {data,error}=await client().from('shift_attendance').delete()
  .eq('shift_date',date).eq('employee_id',employeeId).select('shift_date')
 if(error)throw new Error(error.message)
 ensureChanged(data,'取消出勤')
}
export async function listActiveShiftEmployees():Promise<ShiftEmployee[]>{
 const {data,error}=await client().from('employee_accounts').select('user_id,display_name')
  .eq('active',true).order('display_name')
 if(error)throw new Error(error.message)
 return (data||[]).map(r=>({id:r.user_id,name:r.display_name}))
}
