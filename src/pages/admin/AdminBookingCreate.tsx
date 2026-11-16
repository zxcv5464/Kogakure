import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { getStaff } from '../../lib/staff'
import ScrollCue from '../../components/ScrollCue'
import { createAdminBooking, describeBookingError,staffAcceptsPlan,staffCanJoinBooking,quotaAvailable,loadBookingQuotaUsage } from '../../lib/bookings'
import type { BookingPlan, BookingQuotaUsage } from '../../lib/bookings'
import type { Staff } from '../../types'

type Props={plans:BookingPlan[];quotaUsage:BookingQuotaUsage;close:()=>void;onCreated:(id:string)=>Promise<void>}
export default function AdminBookingCreate({plans,quotaUsage,close,onCreated}:Props){
 const [people,setPeople]=useState<Staff[]>([])
 const [loading,setLoading]=useState(true)
 const [name,setName]=useState('')
 const [world,setWorld]=useState('')
 const [planId,setPlanId]=useState(plans.find(p=>p.active)?.id||plans[0]?.id||'')
 const [staffIds,setStaffIds]=useState<string[]>([])
 const selectedPlan=plans.find(p=>p.id===planId)
 const [note,setNote]=useState('')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const dialog=useRef<HTMLDivElement>(null)
 const closeRef=useRef(close)
 closeRef.current=close

 useEffect(()=>{
  let alive=true
  getStaff(true).then(staff=>{if(alive)setPeople(staff.filter(p=>p.published&&p.bookingVisible))})
   .catch(e=>{if(alive)setError(describeBookingError(e))})
   .finally(()=>{if(alive)setLoading(false)})
  return()=>{alive=false}
 },[])
 useEffect(()=>{
  const previous=document.body.style.overflow
  document.body.style.overflow='hidden'
  dialog.current?.focus()
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busy){event.preventDefault();closeRef.current()}
   if(event.key==='Tab'&&dialog.current){
    const controls=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'))
    if(!controls.length)return
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus()}
    if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus()}
   }
  }
  document.addEventListener('keydown',onKey)
  return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',onKey)}
 },[busy])

 async function submit(event:FormEvent){
  event.preventDefault()
  if(busy)return
  if(name.trim().length<2||world.trim().length<2||!planId||!staffIds.length){setError('請填寫角色姓名、伺服器、方案並選擇至少一位館員');return}
  if(staffIds.length>2){setError('每筆預約最多指名 2 位館員（主要指名及追加指名各 1 位）');return}
  if(staffIds.length>1&&!selectedPlan?.allowJoint){
   setError('此方案僅開放單人指名，請取消第二位館員');return
  }
  const picked=staffIds.map(id=>people.find(p=>p.id===id))
  if(selectedPlan&&picked.some(person=>!person||!quotaAvailable(selectedPlan,person,quotaUsage))){
   setError('此方案或狐姬已達接取次數上限');return
  }
  if(picked.some(person=>!person||!staffAcceptsPlan(person,planId))||
    (picked.length===2&&(!picked[0]||!picked[1]||!staffCanJoinBooking(picked[0],picked[1],planId)))){
   setError('指名人員未開放此方案或不接受同時指名，請重新選擇');return
  }
  setBusy(true);setError('')
  try{
   const recent=await loadBookingQuotaUsage()
   if(!selectedPlan||picked.some(person=>!person||!quotaAvailable(selectedPlan,person,recent)))
    throw new Error('此方案或狐姬的接取次數已滿，請重新選擇')
   const id=await createAdminBooking({name,world,planId,staffIds,note})
   await onCreated(id)
  }catch(e){setError(describeBookingError(e))}
  finally{setBusy(false)}
 }
 return <div className="booking-admin-detail-backdrop" onMouseDown={event=>{if(event.currentTarget===event.target&&!busy)close()}}>
  <div className="booking-admin-detail booking-admin-create" ref={dialog} tabIndex={-1}
   role="dialog" aria-modal="true" aria-labelledby="booking-admin-create-title">
   <button type="button" className="booking-admin-close" aria-label="關閉新增申請" disabled={busy} onClick={close}><X size={20}/></button>
   <p className="eyebrow">KOGAKURE · MANUAL RESERVATION</p>
   <h2 id="booking-admin-create-title">新增指名申請</h2>
   <p className="booking-admin-create-intro">供館方記錄現場或私訊預約；新增後先列為待審核，點擊接取才會開始計時並更新狐姬狀態。</p>
   <form onSubmit={e=>void submit(e)}>
    <label>預約者遊戲角色姓名 <input autoFocus required minLength={2} maxLength={48} value={name} onChange={e=>setName(e.target.value)} placeholder="FFXIV 角色姓名"/></label>
    <label>伺服器 <input required minLength={2} maxLength={48} value={world} onChange={e=>setWorld(e.target.value)} placeholder="例如：Leviathan"/></label>
    <label>指名方案 <select value={planId} required onChange={e=>{setPlanId(e.target.value);setStaffIds([])}}>
     <option value="">請選擇指名方案</option>
     {plans.map(p=><option key={p.id} value={p.id}>{p.name} · {p.durationMinutes} 分鐘{p.active?'':'（未公開，僅後台可用）'}</option>)}
    </select></label>
    <fieldset><legend>選擇可指名館員（最多 2 位：主要指名＋追加 1 位）</legend>
     <p>{selectedPlan?.allowJoint
      ?'僅可選擇接受此方案的狐姬；同時指名須方案與兩位狐姬均允許。'
      :'此指名方案僅開放單人預約；無法追加第二位狐姬。'}</p>
     {loading?<p role="status">正在取得狐姬名單…</p>:!people.length?<p>目前沒有開放預約展示的館員。</p>:people.map(p=>{
      const compatible=staffAcceptsPlan(p,planId)&&(!selectedPlan||quotaAvailable(selectedPlan,p,quotaUsage))
      const selectedPartner=people.find(q=>q.id===staffIds[0])
      const jointOK=!selectedPartner||staffCanJoinBooking(selectedPartner,p,planId,selectedPlan?.allowJoint)
      const disabled=busy||!compatible||!staffIds.includes(p.id)&&
       (staffIds.length>=2||!jointOK)
      return <label className="booking-admin-create-staff" key={p.id}>
       <input type="checkbox" checked={staffIds.includes(p.id)} disabled={disabled}
        onChange={e=>setStaffIds(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>
       <span>{p.name}</span><small>{!compatible?'方案不適用或次數已滿':!jointOK?'未開放同時指名':p.role}</small>
      </label>
     })}
    </fieldset>
    <label>備註（選填） <textarea rows={3} maxLength={240} value={note} onChange={e=>setNote(e.target.value)} placeholder="給館方的安排紀錄；請勿填寫真實個人資訊"/></label>
    {error&&<p className="booking-admin-error" role="alert">{error}</p>}
    <div className="booking-admin-create-actions">
     <button type="button" disabled={busy} onClick={close}>取消</button>
     <button type="submit" className="primary" disabled={busy||loading||!plans.length||!people.length}><Plus size={16}/>{busy?'新增中…':'新增待審核申請'}</button>
    </div>
   </form>
   <ScrollCue/>
  </div>
 </div>
}
