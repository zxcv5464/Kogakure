import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { watchBookingChanges } from '../../lib/bookings'
import { useAdminEditGuard } from './AdminEditGuard'
import './booking-notification.css'

type PendingInfo={id:string;guest_name:string;guest_world:string;plan_name:string}
export default function BookingNotification(){
 const [pending,setPending]=useState<PendingInfo[]>([])
 const [unread,setUnread]=useState<PendingInfo|null>(null)
 const ids=useRef(new Set<string>())
 const initialized=useRef(false)
 const {confirmNavigation}=useAdminEditGuard()
 useEffect(()=>{
  if(!supabase)return
  let live=true
  const client=supabase
  async function refresh(){
   const {data,error}=await client.from('booking_requests')
    .select('id,guest_name,guest_world,plan_name').eq('status','pending')
    .order('created_at',{ascending:false}).limit(20)
   if(error||!live)return
   const rows=data as PendingInfo[]
   if(initialized.current){
    const fresh=rows.find(row=>!ids.current.has(row.id))
    if(fresh)setUnread(fresh)
   }else initialized.current=true
   ids.current=new Set(rows.map(row=>row.id))
   setPending(rows)
  }
  void refresh()
  const unwatch=watchBookingChanges(()=>{void refresh()},true)
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh()},9000)
  return()=>{live=false;unwatch();window.clearInterval(timer)}
 },[])
 if(!pending.length&&!unread)return null
 return <div className="admin-booking-notify" role={unread?'alert':'status'}>
  <Bell size={18}/><span>
   <strong>{unread?'新指名申請 · '+unread.guest_name+'（'+unread.guest_world+'）':'目前有 '+pending.length+' 筆待處理預約'}</strong>
   <small>{unread?unread.plan_name+'，請查看完整指名資訊並決定是否接取':'管理員接取後，狐姬狀態與方案倒數即刻同步'}</small>
  </span>
  <Link to="/admin/booking" onClick={()=>{setUnread(null);confirmNavigation()}}>前往預約管理</Link>
  {unread&&<button type="button" aria-label="關閉新預約提示" onClick={()=>setUnread(null)}>×</button>}
 </div>
}
