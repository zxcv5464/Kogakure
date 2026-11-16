import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Check, Clock3, Send, Sparkles, X } from 'lucide-react'
import { configured } from '../lib/config'
import { resolveBookingNominees } from '../lib/booking-selection'
import type { BookingNominee } from '../lib/booking-selection'
import { BOOKING_PAGE_READY_EVENT } from '../lib/route-events'
import BookingLoading from '../components/BookingLoading'
import ScrollCue from '../components/ScrollCue'
import { getCachedPublicStaff,loadPublicStaff } from '../lib/public-staff'
import {loadPublicBookingPlans,loadPublicStaffPresence,peekPublicBookingPlans,peekPublicStaffPresence} from '../lib/public-booking-data'
import { getStaff } from '../lib/staff'
import {
 describeBookingError, isStaffBusy,staffAcceptsPlan,staffCanJoinBooking,quotaAvailable,loadBookingQuotaUsage,
 submitNomination, watchBookingChanges,
} from '../lib/bookings'
import type { BookingPlan, StaffPresence,BookingQuotaUsage } from '../lib/bookings'
import type { Staff } from '../types'
import './booking-page.css'

const maximumStaff = 2

function NomineeSummary({nominees}: {nominees: BookingNominee[]}) {
 return <div className="booking-nominee-summary" aria-label="完整指名名單">
  <strong>本次指名人員 · {nominees.length} 位</strong>
  <ul>{nominees.map(person=><li key={person.id}>
   <span className="booking-nominee-kind">{person.primary?'主要指名':'追加指名'}</span>
   <span className="booking-nominee-name">{person.name}</span>
  </li>)}</ul>
 </div>
}

export default function BookingPage(){
 const [people,setPeople]=useState<Staff[]>(()=>getCachedPublicStaff()?.filter(p=>p.published&&p.bookingVisible)??[])
 const [plans,setPlans]=useState<BookingPlan[]>(()=>peekPublicBookingPlans()??[])
 const [presence,setPresence]=useState<StaffPresence[]>(()=>peekPublicStaffPresence()??[])
 const [quotaUsage,setQuotaUsage]=useState<BookingQuotaUsage>({plans:{},staff:{}})
 const [loading,setLoading]=useState(()=>!(configured&&getCachedPublicStaff()&&peekPublicBookingPlans()&&peekPublicStaffPresence()))
 const [error,setError]=useState('')
 const [now,setNow]=useState(Date.now())
 const [selected,setSelected]=useState<Staff|null>(null)
 const [others,setOthers]=useState<string[]>([])
 const [withOthers,setWithOthers]=useState(false)
 const [name,setName]=useState('')
 const [world,setWorld]=useState('')
 const [planId,setPlanId]=useState('')
 const [note,setNote]=useState('')
 const [sending,setSending]=useState(false)
 const [result,setResult]=useState('')
 const [submittedNominees,setSubmittedNominees]=useState<BookingNominee[]>([])
 const [formError,setFormError]=useState('')
 const dialog=useRef<HTMLDivElement>(null)
 const returnFocus=useRef<HTMLElement|null>(null)

 useEffect(()=>{
  if(!configured){setLoading(false);setError('預約系統尚未連線，請洽館方。');return}
  let live=true
  void loadBookingQuotaUsage().then(q=>{if(live)setQuotaUsage(q)}).catch(()=>{})
  Promise.all([loadPublicStaff(),loadPublicBookingPlans(),loadPublicStaffPresence()])
   .then(([staff,loadedPlans,status])=>{
    if(!live)return
    setPeople(staff.filter(p=>p.published&&p.bookingVisible))
    setPlans(loadedPlans);setPlanId(loadedPlans[0]?.id||'');setPresence(status)
   }).catch(e=>{if(live)setError(describeBookingError(e))})
   .finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[])
 // Release the route curtain after the branded booking shell first paints,
 // not after three unrelated network reads. Booking cards remain blocked
 // until staff, plans and presence are all available.
 useEffect(()=>{
  let one=0,two=0
  one=window.requestAnimationFrame(()=>{
   two=window.requestAnimationFrame(()=>window.dispatchEvent(new Event(BOOKING_PAGE_READY_EVENT)))
  })
  return()=>{window.cancelAnimationFrame(one);window.cancelAnimationFrame(two)}
 },[])

 useEffect(()=>{
  if(loading||!configured)return
  let live=true
  const refresh=()=>{
   void loadPublicStaffPresence({force:true}).then(p=>{if(live)setPresence(p)}).catch(()=>{})
   void loadBookingQuotaUsage().then(q=>{if(live)setQuotaUsage(q)}).catch(()=>{})
   // Plans are editable in the admin console; refresh while this page is open.
   void getStaff().then(rows=>{if(live)setPeople(rows.filter(p=>p.published&&p.bookingVisible))}).catch(()=>{})
   void loadPublicBookingPlans({force:true}).then(updated=>{
    if(!live)return
    setPlans(updated)
    setPlanId(previous=>updated.some(p=>p.id===previous)?previous:(updated[0]?.id||''))
   }).catch(()=>{})
  }
  const unwatch=watchBookingChanges(refresh)
  const poll=window.setInterval(()=>{if(document.visibilityState==='visible')refresh()},15000)
  const clock=window.setInterval(()=>setNow(Date.now()),1000)
  const onVisible=()=>{if(document.visibilityState==='visible')refresh()}
  document.addEventListener('visibilitychange',onVisible)
  return()=>{live=false;unwatch();window.clearInterval(poll);window.clearInterval(clock);document.removeEventListener('visibilitychange',onVisible)}
 },[loading])

 const statusByStaff=useMemo(()=>new Map(presence.map(p=>[p.staffId,p.busyUntil])),[presence])
 const extraPerson=withOthers?people.find(p=>p.id===others[0]):null
 const applicablePlans=plans.filter(p=>selected&&staffAcceptsPlan(selected,p.id)&&
  quotaAvailable(p,selected,quotaUsage)&&
  (!extraPerson||(staffCanJoinBooking(selected,extraPerson,p.id,p.allowJoint)&&
   quotaAvailable(p,extraPerson,quotaUsage))))
 const chosenPlanId=applicablePlans.some(p=>p.id===planId)?planId:applicablePlans[0]?.id||''
 const activePlan=applicablePlans.find(p=>p.id===chosenPlanId)
 const nominees=resolveBookingNominees(selected,people,others,withOthers)
 const canAddOthers=Boolean(activePlan?.allowJoint&&selected?.bookingAllowJoint&&chosenPlanId&&
  people.some(p=>p.id!==selected?.id&&staffCanJoinBooking(selected!,p,chosenPlanId,activePlan.allowJoint)&&quotaAvailable(activePlan,p,quotaUsage)))

 function openBooking(person:Staff){
  if(isStaffBusy(statusByStaff.get(person.id),Date.now()))return
  returnFocus.current=document.activeElement as HTMLElement
  setSelected(person);setPlanId(plans.find(p=>staffAcceptsPlan(person,p.id)&&quotaAvailable(p,person,quotaUsage))?.id||'')
  setOthers([]);setWithOthers(false);setResult('');setFormError('');setSubmittedNominees([])
 }
 function close(){
  if(sending)return
  setSelected(null);setResult('');setFormError('');setSubmittedNominees([])
  window.requestAnimationFrame(()=>returnFocus.current?.focus())
 }
 useEffect(()=>{
  if(!selected)return
  const prev=document.body.style.overflow
  document.body.style.overflow='hidden'
  dialog.current?.focus()
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();if(!sending)close()}
   if(event.key==='Tab'&&dialog.current){
    const controls=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'))
    if(!controls.length)return
    const first=controls[0],last=controls[controls.length-1]
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
   }
  }
  document.addEventListener('keydown',onKey)
  return()=>{document.body.style.overflow=prev;document.removeEventListener('keydown',onKey)}
 },[selected,sending])

 async function submit(event:FormEvent){
  event.preventDefault()
  if(!selected||sending)return
  const chosen=resolveBookingNominees(selected,people,others,withOthers)
  const ids=chosen.map(person=>person.id)
  if(ids.length!==1+(withOthers?others.length:0)){
   setFormError('部分追加指名的人員已更新，請重新確認指名名單');return
  }
  if(ids.length>maximumStaff){setFormError('每筆預約最多主要指名 1 位及追加指名 1 位');return}
  if(!chosenPlanId||chosen.some(person=>{
   const staff=people.find(p=>p.id===person.id)
   return !staff||!staffAcceptsPlan(staff,chosenPlanId)
  })){setFormError('所選狐姬無法接受這個預約方案，請重新選擇');return}
  if(ids.length>1&&(!activePlan?.allowJoint||!selected.bookingAllowJoint||
   !chosen.every(person=>people.find(p=>p.id===person.id)?.bookingAllowJoint))){
   setFormError('所選方案或狐姬未開放同時指名，請改為單人預約');return
  }
  if(ids.some(id=>isStaffBusy(statusByStaff.get(id),Date.now()))){setFormError('有受指名人員已進入指名中，請重新選擇');return}
  try{
   const fresh=await loadBookingQuotaUsage()
   setQuotaUsage(fresh)
   if(!activePlan||chosen.some(person=>{
    const staff=people.find(p=>p.id===person.id)
    return !staff||!quotaAvailable(activePlan,staff,fresh)
   })){setFormError('此方案或狐姬的接受次數已達上限，請選擇其他方案');return}
  }catch{/* Server still validates quotas atomically when the operator accepts. */}
  if(name.trim().length<2||world.trim().length<2||!chosenPlanId){setFormError('請填寫遊戲角色姓名、伺服器並選擇方案');return}
  setSending(true);setFormError('')
  try{
   const bookingId=await submitNomination({name,world,planId:chosenPlanId,staffIds:ids,note})
   setSubmittedNominees(chosen)
   setResult(bookingId)
  }catch(e){setFormError(describeBookingError(e))}
  finally{setSending(false)}
 }

 return <section className="booking-page" aria-label="狐隱館員指名預約">
  <header className="booking-hero">
   <p className="booking-eyebrow">狐隱 · KOGAKURE</p>
   <span className="booking-emblem" aria-hidden="true">◇</span>
   <h1>狐隱指名</h1>
   <p className="booking-hero-label">RESERVATIONS · 旅人預約帖</p>
   <p className="booking-hero-verse">一盞狐火，靜候相逢。請選擇想與之締結緣分的館中之人。</p>
  </header>
  <div className="booking-content">
   <div className="booking-legend"><span><i className="booking-dot is-free"/>空閒中</span><span><i className="booking-dot is-busy"/>指名中</span><small>即時指名申請 · 以館方接取為準</small></div>
   {loading&&<div className="booking-loading-stage" aria-busy="true"><BookingLoading /></div>}
   {error&&<div className="booking-notice is-error" role="alert">無法取得預約資訊：{error}</div>}
   {!loading&&!error&&!plans.length&&<div className="booking-notice">館方尚未啟用指名方案，角色名帖可先行欣賞；請待館方開放預約。</div>}
   {!loading&&!error&&!people.length&&<div className="booking-notice">目前沒有開放指名的館員，敬請期待。</div>}
   {!loading&&!error&&people.length>0&&<div className="booking-grid">
    {people.map((person,index)=>{
     const busyUntil=statusByStaff.get(person.id)
     const busy=isStaffBusy(busyUntil,now)
     const acceptsAnyPlan=plans.some(plan=>staffAcceptsPlan(person,plan.id)&&quotaAvailable(plan,person,quotaUsage))
     return <article className={'booking-profile effect-'+person.effect+(person.thumbnailUrl.includes('-crop.webp')?' has-manual-crop':'')} key={person.id}
      style={{'--accent':person.themeColor||'#c4ac83','--booking-delay':Math.min(index,8)*80+'ms'} as CSSProperties}>
      <button className="booking-profile-action" type="button"
       onClick={()=>openBooking(person)} disabled={busy||(plans.length>0&&!acceptsAnyPlan)}
       aria-label={person.name+(busy?'指名中，暫不開放預約':acceptsAnyPlan?'空閒中，點選預約':'目前沒有可接受的指名方案')}>
       <span className="booking-portrait">
        {person.thumbnailUrl||person.imageUrl
         ? <img src={person.thumbnailUrl||person.imageUrl} alt={person.name+'的角色照片'} loading={index>2?'lazy':'eager'} decoding="async"/>
         : <span className="booking-photo-placeholder"><Sparkles size={32}/></span>}
       </span>
       <span className="booking-card-details">
        <span className="booking-card-topline">
         <span className={'booking-card-status '+(busy?'is-booked':'is-available')}><i/>{busy?'指名中':'空閒中'}</span>
        </span>
        <span className="booking-card-role">{person.role||'館員'}</span>
        <span className="booking-card-name">{person.name}</span>
        <span className="booking-card-ornament" aria-hidden="true"/>
        <span className="booking-card-description">{person.tagline||'山間狐火，靜候有緣旅人。'}</span>
        {person.services.length>0&&<span className="booking-card-services">{person.services.slice(0,2).map(service=><span key={service}>{service}</span>)}</span>}
        <span className="booking-card-cta">{busy?'此刻正在接待，暫不開放指名':acceptsAnyPlan?'點選名片 · 提出指名申請':'目前沒有可接受的指名方案'} <Sparkles size={15}/></span>
       </span>
      </button>
     </article>
    })}
   </div>}
   {!loading&&!error&&<p className="booking-footnote">
    <span>當館方接取申請後，相關館員將同步顯示為「指名中」。</span>
    <span>倒數結束後狀態會恢復空閒；館方亦可提前結束服務。</span>
   </p>}
  </div>
  {selected&&<div className="booking-modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
   <div className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-form-title" tabIndex={-1} ref={dialog}>
    <div className="booking-modal-header">
     <div><p className="booking-eyebrow">KOGAKURE · NOMINATION</p><h2 id="booking-form-title">指名預約</h2></div>
     <button type="button" className="booking-modal-close" disabled={sending} onClick={close} aria-label="關閉預約視窗"><X size={21}/></button>
    </div>
    {result ? <div className="booking-success" role="status">
     <Check size={35}/><h3>預約申請已送出</h3>
     <p>館方將於後台審核，尚未代表預約成功，也不會立即占用館員。請依館方接待安排為準。</p>
     <NomineeSummary nominees={submittedNominees}/>
     <p className="booking-number">申請編號：{result.slice(0,8).toUpperCase()}</p>
     <button className="booking-primary" type="button" onClick={close}>返回狐隱</button>
    </div> : <form onSubmit={e=>void submit(e)} className="booking-form">
     <div className="booking-selected-person"><img src={selected.thumbnailUrl||selected.imageUrl} alt=""/><span><small>本次指名</small><strong>{selected.name}</strong></span></div>
     {!applicablePlans.length&&<p role="status" className="booking-plan-unavailable">這位狐姬目前沒有可接受的方案，或方案／個人接取次數已滿；請重新選擇。</p>}
     <label>預約者遊戲角色姓名 <input required minLength={2} maxLength={48} value={name} onChange={e=>setName(e.target.value)} placeholder="請輸入遊戲中的角色姓名" autoComplete="off"/></label>
     <label>所在伺服器 <input required minLength={2} maxLength={48} value={world} onChange={e=>setWorld(e.target.value)} placeholder="例如：利維坦 / Leviathan" autoComplete="off"/></label>
     <label>指名方案 <select required value={chosenPlanId} onChange={e=>{setPlanId(e.target.value);setOthers([]);setWithOthers(false)}}>
      <option value="">請選擇方案</option>
      {applicablePlans.map(p=><option value={p.id} key={p.id}>{p.name} · {p.durationMinutes} 分鐘{p.priceGil===null?'': ' · '+p.priceGil.toLocaleString('en-US')+' Gil'}{p.maxUses!==null?' · 餘額 '+Math.max(0,p.maxUses-(quotaUsage.plans[p.id]||0)):''}</option>)}
     </select></label>
     {activePlan&&<p className="booking-plan-note"><Clock3 size={16}/>{activePlan.description||'體驗內容以館方確認為準'} · {activePlan.priceGil===null?'費用請洽館方':'費用 '+activePlan.priceGil.toLocaleString('en-US')+' Gil'}</p>}
     {selected.bookingAllowJoint&&activePlan?.allowJoint?<label className="booking-choice"><input type="checkbox"
      checked={withOthers} disabled={!canAddOthers&&!withOthers}
      onChange={e=>{setWithOthers(e.target.checked);setOthers([])}}/>是否同時指名其他館員？</label>:
      <p className="booking-plan-note">{activePlan&&!activePlan.allowJoint?'此指名方案僅接受單人預約。':'這位狐姬僅接受單獨指名。'}</p>}
     {selected.bookingAllowJoint&&activePlan?.allowJoint&&withOthers&&<fieldset className="booking-additional">
      <legend>追加指名（最多再選 1 位館員）</legend>
      {people.filter(p=>p.id!==selected.id&&chosenPlanId&&staffCanJoinBooking(selected,p,chosenPlanId,activePlan?.allowJoint)&&activePlan&&quotaAvailable(activePlan,p,quotaUsage)).map(person=>{
       const busy=isStaffBusy(statusByStaff.get(person.id),now)
       return <label key={person.id}><input type="checkbox" checked={others.includes(person.id)} disabled={busy}
        onChange={e=>setOthers(e.target.checked?[person.id]:[])}/>
        <span>{person.name}</span><small>{busy?'指名中':'空閒中'}</small></label>
      })}
      <p>僅可追加 1 位館員；改選另一人時會自動替換。兩位館員共用同一預約方案與計時。</p>
     </fieldset>}
     <NomineeSummary nominees={nominees}/>
     <label>補充說明（選填） <textarea rows={3} maxLength={240} value={note} onChange={e=>setNote(e.target.value)} placeholder="給館方的簡短備註，請勿填寫現實個人資料"/></label>
     {formError&&<p className="booking-form-error" role="alert">{formError}</p>}
     <button className="booking-primary" type="submit" disabled={sending||!applicablePlans.length}>
      <Send size={17}/>{sending?'正在提交…':'送出預約申請'}
     </button>
     <p className="booking-disclaimer">本表單僅供 FFXIV RP 預約，非真實商業交易。送出後須待館方接取，並非自動確認。</p>
    </form>}
    <ScrollCue/>
   </div>
  </div>}
 </section>
}
