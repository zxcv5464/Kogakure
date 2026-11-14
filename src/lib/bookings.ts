import { configured } from './config'
import { supabase } from './supabase'

export type BookingPlan = {
 id:string; name:string; description:string; durationMinutes:number;
 priceGil:number|null; sortOrder:number; active:boolean; updatedAt:string
}
export type BookingStatus = 'pending'|'accepted'|'rejected'|'completed'
export type BookingRequest = {
 id:string; guestName:string; guestWorld:string; note:string;
 planId:string; planName:string; durationMinutes:number; priceGil:number|null;
 status:BookingStatus; createdAt:string; acceptedAt:string|null;
 endsAt:string|null; completedAt:string|null;
 staff:{id:string;name:string}[]
}
export type StaffPresence = {staffId:string;busyUntil:string|null}
type PlanRow={id:string;name:string;description:string;duration_minutes:number;price_gil:number|null;sort_order:number;is_active:boolean;updated_at:string}
type BookingRow={id:string;guest_name:string;guest_world:string;note:string;plan_id:string;plan_name:string;duration_minutes:number;price_gil:number|null;status:BookingStatus;created_at:string;accepted_at:string|null;ends_at:string|null;completed_at:string|null}
type BookingLinkRow={booking_id:string;staff_id:string;staff_name:string}
type PresenceRow={staff_id:string;busy_until:string|null}
const client=()=>{
 if(!configured||!supabase)throw new Error('目前無法連接狐隱預約資料庫')
 return supabase
}
export function describeBookingError(error:unknown):string{
 if(error instanceof Error)return error.message
 if(typeof error==='string')return error
 if(error&&typeof error==='object'){
  const e=error as {message?:string;code?:string;hint?:string}
  return [e.code&&'['+e.code+']',e.message,e.hint].filter(Boolean).join('：')||'未知錯誤'
 }
 return '未知錯誤'
}
const planFromRow=(p:PlanRow):BookingPlan=>({
 id:p.id,name:p.name,description:p.description,durationMinutes:p.duration_minutes,
 priceGil:p.price_gil,sortOrder:p.sort_order,active:p.is_active,updatedAt:p.updated_at,
})
export async function loadBookingPlans(includeInactive=false):Promise<BookingPlan[]> {
 let query=client().from('booking_plans').select('*').order('sort_order',{ascending:true})
 if(!includeInactive)query=query.eq('is_active',true)
 const {data,error}=await query
 if(error)throw error
 return (data as PlanRow[]).map(planFromRow)
}
export async function loadStaffPresence():Promise<StaffPresence[]>{
 const {data,error}=await client().from('staff_booking_presence').select('staff_id,busy_until')
 if(error)throw error
 return (data as PresenceRow[]).map(p=>({staffId:p.staff_id,busyUntil:p.busy_until}))
}
export function isStaffBusy(until:string|null|undefined,nowMs=Date.now()):boolean{
 return Boolean(until&&new Date(until).getTime()>nowMs)
}
export function countdown(endsAt:string|null,nowMs=Date.now()):string{
 if(!endsAt)return '尚未開始'
 const seconds=Math.max(0,Math.ceil((new Date(endsAt).getTime()-nowMs)/1000))
 const m=Math.floor(seconds/60),s=seconds%60
 return m+':'+String(s).padStart(2,'0')
}
export async function submitNomination(input:{
 name:string;world:string;planId:string;staffIds:string[];note:string
}):Promise<string>{
 const {data,error}=await client().rpc('submit_booking_request',{
  p_guest_name:input.name.trim(),
  p_guest_world:input.world.trim(),
  p_plan_id:input.planId,
  p_staff_ids:input.staffIds,
  p_note:input.note.trim(),
 })
 if(error)throw error
 if(typeof data!=='string')throw new Error('預約未回傳確認編號，請洽館方確認')
 return data
}
export async function loadAdminBookings():Promise<BookingRequest[]>{
 const db=client()
 const {data,error}=await db.from('booking_requests').select('*').order('created_at',{ascending:false}).limit(160)
 if(error)throw error
 const bookings=data as BookingRow[]
 if(!bookings.length)return []
 const {data:links,error:linkError}=await db.from('booking_request_staff')
  .select('booking_id,staff_id,staff_name').in('booking_id',bookings.map(b=>b.id))
 if(linkError)throw linkError
 const mapping=new Map<string,{id:string;name:string}[]>()
 for(const l of links as BookingLinkRow[]){
  const people=mapping.get(l.booking_id)||[]
  people.push({id:l.staff_id,name:l.staff_name})
  mapping.set(l.booking_id,people)
 }
 return bookings.map(b=>({
  id:b.id,guestName:b.guest_name,guestWorld:b.guest_world,note:b.note,
  planId:b.plan_id,planName:b.plan_name,durationMinutes:b.duration_minutes,priceGil:b.price_gil,
  status:b.status,createdAt:b.created_at,acceptedAt:b.accepted_at,endsAt:b.ends_at,
  completedAt:b.completed_at,staff:mapping.get(b.id)||[],
 }))
}
export async function decideBooking(id:string,action:'accept'|'reject'|'complete'):Promise<void>{
 const {error}=await client().rpc('decide_booking_request',{p_booking_id:id,p_action:action})
 if(error)throw error
}
export async function saveBookingPlan(plan:BookingPlan,newPlan:boolean):Promise<void>{
 const db=client()
 const row={id:plan.id,name:plan.name.trim(),description:plan.description.trim(),
  duration_minutes:plan.durationMinutes,price_gil:plan.priceGil,sort_order:plan.sortOrder,is_active:plan.active}
 const request=newPlan
  ? db.from('booking_plans').insert(row).select('id')
  : db.from('booking_plans').update(row).eq('id',plan.id).eq('updated_at',plan.updatedAt).select('id')
 const {data,error}=await request
 if(error)throw error
 if(data?.length!==1)throw new Error('方案已被其他管理員修改，請重新整理後再試')
}
export async function removeBookingPlan(plan:BookingPlan):Promise<void>{
 const {data,error}=await client().from('booking_plans').delete().eq('id',plan.id)
  .eq('updated_at',plan.updatedAt).select('id')
 if(error)throw error
 if(data?.length!==1)throw new Error('此方案已被修改或有預約正在使用，請重新整理')
}
// Realtime events are hints. Always refetch the authoritative database rows;
// polling covers disconnected and suspended browsers.
export function watchBookingChanges(onChange:()=>void,admin=false):()=>void{
 if(!configured||!supabase)return ()=>{}
 const db=supabase
 const channel=db.channel('kogakure-bookings-'+(admin?'admin':'public')+'-'+Math.random().toString(36).slice(2))
 channel.on('postgres_changes',{event:'*',schema:'public',table:'staff_booking_presence'},onChange)
 if(admin)channel.on('postgres_changes',{event:'*',schema:'public',table:'booking_requests'},onChange)
 channel.subscribe()
 return ()=>{void db.removeChannel(channel)}
}
