import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Check, Clock3, Send, Sparkles, X } from 'lucide-react'
import { configured } from '../lib/config'
import { BOOKING_PAGE_READY_EVENT } from '../lib/route-events'
import BookingLoading from '../components/BookingLoading'
import { loadPublicStaff } from '../lib/public-staff'
import { getStaff } from '../lib/staff'
import {
 describeBookingError, isStaffBusy, loadBookingPlans, loadStaffPresence,
 submitNomination, watchBookingChanges,
} from '../lib/bookings'
import type { BookingPlan, StaffPresence } from '../lib/bookings'
import type { Staff } from '../types'
import './booking-page.css'

const maximumStaff = 4

export default function BookingPage(){
 const [people,setPeople]=useState<Staff[]>([])
 const [plans,setPlans]=useState<BookingPlan[]>([])
 const [presence,setPresence]=useState<StaffPresence[]>([])
 const [loading,setLoading]=useState(true)
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
 const [formError,setFormError]=useState('')
 const dialog=useRef<HTMLDivElement>(null)
 const returnFocus=useRef<HTMLElement|null>(null)

 useEffect(()=>{
  if(!configured){setLoading(false);setError('預約系統尚未連線，請洽館方。');return}
  let live=true
  Promise.all([loadPublicStaff(),loadBookingPlans(),loadStaffPresence()])
   .then(([staff,loadedPlans,status])=>{
    if(!live)return
    setPeople(staff.filter(p=>p.published&&p.bookingVisible))
    setPlans(loadedPlans);setPlanId(loadedPlans[0]?.id||'');setPresence(status)
   }).catch(e=>{if(live)setError(describeBookingError(e))})
   .finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[])
 // Notify the shared route transition only after data or an error is ready.
 useEffect(()=>{if(!loading)window.dispatchEvent(new Event(BOOKING_PAGE_READY_EVENT))},[loading])

 useEffect(()=>{
  if(loading||!configured)return
  let live=true
  const refresh=()=>{
   void loadStaffPresence().then(p=>{if(live)setPresence(p)}).catch(()=>{})
   // Plans are editable in the admin console; refresh while this page is open.
   void getStaff().then(rows=>{if(live)setPeople(rows.filter(p=>p.published&&p.bookingVisible))}).catch(()=>{})
   void loadBookingPlans().then(updated=>{
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
 const activePlan=plans.find(p=>p.id===planId)

 function openBooking(person:Staff){
  if(isStaffBusy(statusByStaff.get(person.id),Date.now()))return
  returnFocus.current=document.activeElement as HTMLElement
  setSelected(person);setOthers([]);setWithOthers(false);setResult('');setFormError('')
 }
 function close(){
  if(sending)return
  setSelected(null);setResult('');setFormError('')
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
  const ids=[selected.id,...(withOthers?others:[])]
  if(ids.length>maximumStaff){setFormError('一次最多指名四位館員');return}
  if(ids.some(id=>isStaffBusy(statusByStaff.get(id),Date.now()))){setFormError('有受指名人員已進入指名中，請重新選擇');return}
  if(name.trim().length<2||world.trim().length<2||!planId){setFormError('請填寫遊戲角色姓名、伺服器並選擇方案');return}
  setSending(true);setFormError('')
  try{
   const bookingId=await submitNomination({name,world,planId,staffIds:ids,note})
   setResult(bookingId)
   setOthers([]);setWithOthers(false)
  }catch(e){setFormError(describeBookingError(e))}
  finally{setSending(false)}
 }

 if(loading)return <BookingLoading />
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
   {loading&&<div className="booking-notice" role="status">正在尋訪館中的狐姬…</div>}
   {error&&<div className="booking-notice is-error" role="alert">無法取得預約資訊：{error}</div>}
   {!loading&&!error&&!plans.length&&<div className="booking-notice">館方尚未啟用指名方案，角色名帖可先行欣賞；請待館方開放預約。</div>}
   {!loading&&!error&&!people.length&&<div className="booking-notice">目前沒有開放指名的館員，敬請期待。</div>}
   {!loading&&!error&&<div className="booking-grid">
    {people.map((person,index)=>{
     const busyUntil=statusByStaff.get(person.id)
     const busy=isStaffBusy(busyUntil,now)
     return <article className={'booking-profile effect-'+person.effect+(person.thumbnailUrl.includes('-crop.webp')?' has-manual-crop':'')} key={person.id}
      style={{'--accent':person.themeColor||'#c4ac83','--booking-delay':Math.min(index,8)*80+'ms'} as CSSProperties}>
      <button className="booking-profile-action" type="button"
       onClick={()=>openBooking(person)} disabled={busy}
       aria-label={person.name+(busy?'指名中，暫不開放預約':plans.length?'空閒中，點選預約':'空閒中，方案籌備中，點選查看預約資訊')}>
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
        <span className="booking-card-cta">{busy?'此刻正在接待，暫不開放指名':plans.length?'點選名片 · 提出指名申請':'點選名片 · 方案籌備中'} <Sparkles size={15}/></span>
       </span>
      </button>
     </article>
    })}
   </div>}
   {!loading&&!error&&<p className="booking-footnote">當館方接取申請後，相關館員將同步顯示為「指名中」。倒數結束後狀態會恢復空閒；館方亦可提前結束服務。</p>}
  </div>
  {selected&&<div className="booking-modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
   <div className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-form-title" tabIndex={-1} ref={dialog}>
    <div className="booking-modal-header">
     <div><p className="booking-eyebrow">KOGAKURE · NOMINATION</p><h2 id="booking-form-title">指名預約 · {selected.name}</h2></div>
     <button type="button" className="booking-modal-close" disabled={sending} onClick={close} aria-label="關閉預約視窗"><X size={21}/></button>
    </div>
    {result ? <div className="booking-success" role="status">
     <Check size={35}/><h3>預約申請已送出</h3>
     <p>館方將於後台審核，尚未代表預約成功，也不會立即占用館員。請依館方接待安排為準。</p>
     <p className="booking-number">申請編號：{result.slice(0,8).toUpperCase()}</p>
     <button className="booking-primary" type="button" onClick={close}>返回狐隱</button>
    </div> : <form onSubmit={e=>void submit(e)} className="booking-form">
     <div className="booking-selected-person"><img src={selected.thumbnailUrl||selected.imageUrl} alt=""/><span><small>本次指名</small><strong>{selected.name}</strong></span></div>
     {!plans.length&&<p role="status" className="booking-plan-unavailable">目前尚未開放可提交的指名方案。您可先查看指名資訊，待館方設定方案後再送出申請。</p>}
     <label>預約者遊戲角色姓名 <input required minLength={2} maxLength={48} value={name} onChange={e=>setName(e.target.value)} placeholder="請輸入遊戲中的角色姓名" autoComplete="off"/></label>
     <label>所在伺服器 <input required minLength={2} maxLength={48} value={world} onChange={e=>setWorld(e.target.value)} placeholder="例如：利維坦 / Leviathan" autoComplete="off"/></label>
     <label>指名方案 <select required value={planId} onChange={e=>setPlanId(e.target.value)}>
      <option value="">請選擇方案</option>
      {plans.map(p=><option value={p.id} key={p.id}>{p.name} · {p.durationMinutes} 分鐘{p.priceGil===null?'': ' · '+p.priceGil.toLocaleString('en-US')+' Gil'}</option>)}
     </select></label>
     {activePlan&&<p className="booking-plan-note"><Clock3 size={16}/>{activePlan.description||'體驗內容以館方確認為準'} · {activePlan.priceGil===null?'費用請洽館方':'費用 '+activePlan.priceGil.toLocaleString('en-US')+' Gil'}</p>}
     <label className="booking-choice"><input type="checkbox" checked={withOthers} onChange={e=>{setWithOthers(e.target.checked);setOthers([])}}/>是否同時指名其他館員？</label>
     {withOthers&&<fieldset className="booking-additional">
      <legend>加選館員（含原指名最多 {maximumStaff} 位）</legend>
      {people.filter(p=>p.id!==selected.id).map(person=>{
       const busy=isStaffBusy(statusByStaff.get(person.id),now)
       return <label key={person.id}><input type="checkbox" checked={others.includes(person.id)} disabled={busy||(!others.includes(person.id)&&others.length>=maximumStaff-1)}
        onChange={e=>setOthers(prev=>e.target.checked?[...prev,person.id]:prev.filter(id=>id!==person.id))}/>
        <span>{person.name}</span><small>{busy?'指名中':'空閒中'}</small></label>
      })}
      <p>所有選取館員會隨同一預約方案開始計時，實際接取以館方確認為準。</p>
     </fieldset>}
     <label>補充說明（選填） <textarea rows={3} maxLength={240} value={note} onChange={e=>setNote(e.target.value)} placeholder="給館方的簡短備註，請勿填寫現實個人資料"/></label>
     {formError&&<p className="booking-form-error" role="alert">{formError}</p>}
     <button className="booking-primary" type="submit" disabled={sending||!plans.length}>
      <Send size={17}/>{sending?'正在提交…':'送出預約申請'}
     </button>
     <p className="booking-disclaimer">本表單僅供 FFXIV RP 預約，非真實商業交易。送出後須待館方接取，並非自動確認。</p>
    </form>}
   </div>
  </div>}
 </section>
}
