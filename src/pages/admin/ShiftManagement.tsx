import {useCallback,useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {CalendarDays,CheckCircle2,ExternalLink,RefreshCw,Save,UsersRound,AlertCircle,X,Clock3,ChevronRight,Sparkles} from 'lucide-react'
import {supabase} from '../../lib/supabase'
import {useRollingShiftWeeks,shiftDateLabel,SHIFT_WEEKDAYS} from '../../lib/shift-calendar'
import {fetchOwnPreferredShiftName,fetchShifts,listActiveShiftEmployees,markOwnerShiftAttendance,markShiftAttendance,renameOwnShiftAttendance,saveOwnPreferredShiftName,setShiftOpening,unmarkShiftAttendance} from '../../lib/shifts'
import type {ShiftAttendance,ShiftCalendarData,ShiftEmployee,ShiftOpenDay} from '../../lib/shifts'
import type {BackofficeAccess} from '../../lib/employee-accounts'
import './shift-management.css'
type ShiftKind='unannounced'|'open'|'closed'
type Notice={error:boolean;message:string}
const empty:ShiftCalendarData={days:[],attendance:[]}

function ShiftDayEditor({date,weekday,today,day,staff,people,access,selfId,ownerName,employeeShiftName,busy,onOpening,onMark,onMarkOwn,onRename,onRemove}:{
 date:string;weekday:string;today:string;day:ShiftOpenDay|undefined;staff:ShiftAttendance[]
 people:ShiftEmployee[];access:BackofficeAccess;selfId:string;ownerName:string;employeeShiftName:string;busy:boolean
 onOpening:(date:string,kind:ShiftKind,hours:string,note:string,eventTitle:string)=>Promise<void>
 onMark:(date:string,person:ShiftEmployee)=>Promise<void>
 onMarkOwn:(date:string,name:string)=>Promise<void>
 onRename:(date:string,person:ShiftAttendance,name:string)=>Promise<void>
 onRemove:(date:string,person:ShiftAttendance)=>Promise<void>
}){
 const owner=access.kind==='owner'
 const savedKind:ShiftKind=day?(day.open?'open':'closed'):'unannounced'
 const [kind,setKind]=useState<ShiftKind>(savedKind)
 const [hours,setHours]=useState(day?.hours||'')
 const [note,setNote]=useState(day?.note||'')
 const [eventTitle,setEventTitle]=useState(day?.eventTitle||'')
 const [member,setMember]=useState('')
 useEffect(()=>{setKind(savedKind);setHours(day?.hours||'');setNote(day?.note||'');setEventTitle(day?.eventTitle||'')},[savedKind,day?.hours,day?.note,day?.eventTitle,date])
 const hasEdits=kind!==savedKind||hours!==(day?.hours||'')||note!==(day?.note||'')||eventTitle!==(day?.eventTitle||'')
 const chosen=people.find(person=>person.id===member)
 const mine=staff.find(x=>x.employeeId===selfId&&x.source===(owner?'owner':'employee'))
 const myDisplayName=owner?ownerName:employeeShiftName
 const nameChanged=Boolean(mine&&myDisplayName.trim()!==mine.name)
 const open=day?.open===true
 const submitted=new Set(staff.map(x=>x.employeeId))
 return <article className={'shift-admin-day'+(date===today?' is-today':'')+(date<today?' is-past':'')} aria-label={date}>
  <header className="shift-admin-day-head">
   <span>週{weekday} <strong>{shiftDateLabel(date)}</strong> {date===today&&<em>今日</em>}</span>
   <span className={'shift-admin-state is-'+savedKind}>{savedKind==='open'?'營業':savedKind==='closed'?'休館':'未公告'}</span>
  </header>
  {owner?<div className="shift-admin-open-editor">
   <label>開店狀態<select value={kind} disabled={busy} onChange={e=>setKind(e.target.value as ShiftKind)}>
    <option value="unannounced">未公告</option><option value="open">營業</option><option value="closed">休館</option>
   </select></label>
   {kind==='open'&&<label>營業時段（可留空）<input value={hours} disabled={busy} maxLength={80}
    onChange={e=>setHours(e.target.value)} placeholder="例：21:00–24:00"/></label>}
   {kind==='open'&&<label>活動安排（選填）<input value={eventTitle} disabled={busy} maxLength={120}
    onChange={e=>setEventTitle(e.target.value)} placeholder="例：百鬼夜行・月下茶會"/></label>}
   {kind!=='unannounced'&&<label>日期備註（可留空）<input value={note} disabled={busy} maxLength={240}
    onChange={e=>setNote(e.target.value)} placeholder="例：今晚特別活動"/></label>}
   <button type="button" className="shift-admin-save" disabled={busy||!hasEdits}
    onClick={()=>void onOpening(date,kind,hours,note,eventTitle)}><Save size={15}/>儲存開店設定</button>
  </div>:<p className="shift-admin-day-hint">{open?day?.hours||'本日營業':savedKind==='closed'?'館方設定休館':'等待管理員公布開店日'}</p>}
  {day?.note&&<p className="shift-admin-note">{day.note}</p>}
  {!owner&&open&&day?.eventTitle&&<p className="shift-admin-event-detail"><Sparkles size={15}/>活動：{day.eventTitle}</p>}
  {open&&<div className="shift-admin-attendance">
   <h3><UsersRound size={15}/>出勤登記 · {staff.length} 位</h3>
   {staff.length?<ul>{staff.map(person=><li key={person.employeeId}>
    <span>{person.name}</span>
    {(person.source==='owner'?person.employeeId===selfId:owner||person.employeeId===selfId)&&<button type="button" disabled={busy}
     aria-label={'取消 '+person.name+' '+date+' 的出勤'} title="取消出勤"
     onClick={()=>void onRemove(date,person)}><X size={15}/></button>}
   </li>)}</ul>:<p>目前尚無館員填寫出勤。</p>}
   {date>=today&&<button type="button" className="shift-admin-self"
    disabled={busy||!selfId||(!mine&&!myDisplayName.trim())}
    onClick={()=>void (mine?onRemove(date,mine):owner?onMarkOwn(date,myDisplayName):onMark(date,{id:selfId,name:myDisplayName}))}>
    {mine?'取消我的出勤':'＋ 我會在這天出勤'}
   </button>}
   {date>=today&&mine&&nameChanged&&<button type="button" className="shift-admin-rename"
    disabled={busy||!selfId||!myDisplayName.trim()||myDisplayName.trim().length>100}
    onClick={()=>void onRename(date,mine,myDisplayName)}>
    <Save size={15}/>儲存我的出勤名稱
   </button>}
   {owner&&<div className="shift-admin-add-person">
    <select value={member} disabled={busy} aria-label={date+' 選擇出勤員工'} onChange={e=>setMember(e.target.value)}>
     <option value="">選擇館員加入出勤…</option>
     {people.filter(person=>!submitted.has(person.id)).map(person=><option value={person.id} key={person.id}>{person.name}{person.accountName&&person.accountName!==person.name?'（帳號名稱：'+person.accountName+'）':''}</option>)}
    </select>
    <button type="button" disabled={busy||!chosen} onClick={()=>{if(chosen){void onMark(date,chosen);setMember('')}}}>加入其他館員</button>
   </div>}
  </div>}
  {!open&&staff.length>0&&owner&&<p className="shift-admin-day-hint">此日另有 {staff.length} 筆已登記出勤；需改為營業才會對旅人顯示。</p>}
 </article>
}

export default function ShiftManagement({access}:{access:BackofficeAccess}){
 const {today,weeks}=useRollingShiftWeeks()
 const start=weeks[0].start,end=weeks[3].end
 const [calendar,setCalendar]=useState<ShiftCalendarData>(empty)
 const [selectedDate,setSelectedDate]=useState<string|null>(null)
 const triggerRef=useRef<HTMLButtonElement|null>(null)
 const modalRef=useRef<HTMLElement|null>(null)
 const closeRef=useRef<HTMLButtonElement|null>(null)
 const [people,setPeople]=useState<ShiftEmployee[]>([])
 const [selfId,setSelfId]=useState('')
 const [employeeShiftName,setEmployeeShiftName]=useState(()=>access.kind==='employee'?access.displayName:'')
 const [savedEmployeeShiftName,setSavedEmployeeShiftName]=useState(()=>access.kind==='employee'?access.displayName:'')
 const [ownerName,setOwnerName]=useState(()=>{
  try{return window.localStorage.getItem('kogakure-shift-owner-display-name')||'婆婆'}
  catch{return '婆婆'}
 })
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState<Notice|null>(null)
 const [busy,setBusy]=useState(false)
 const busyRef=useRef(false)
 const owner=access.kind==='owner'
 function showDay(date:string,button:HTMLButtonElement){
  triggerRef.current=button
  setSelectedDate(date)
 }
 function closeDay(){
  if(busyRef.current)return
  setSelectedDate(null)
  triggerRef.current?.focus()
 }
 useEffect(()=>{
  if(!selectedDate)return
  const oldOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  const frame=window.requestAnimationFrame(()=>closeRef.current?.focus())
  function onKey(event:KeyboardEvent){
   if(event.key==='Escape'&&!busyRef.current){event.preventDefault();closeDay()}
   if(event.key!=='Tab')return
   const controls=modalRef.current?.querySelectorAll<HTMLElement>(
    'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]'
   )
   if(!controls?.length)return
   const first=controls[0],last=controls[controls.length-1]
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  document.addEventListener('keydown',onKey)
  return()=>{
   window.cancelAnimationFrame(frame)
   document.removeEventListener('keydown',onKey)
   document.body.style.overflow=oldOverflow
  }
 },[selectedDate])
 useEffect(()=>{
  if(selectedDate&&(selectedDate<start||selectedDate>end))setSelectedDate(null)
 },[selectedDate,start,end])
 const reload=useCallback(async()=>{
  const [data,accounts]=await Promise.all([fetchShifts(start,end),owner?listActiveShiftEmployees():Promise.resolve([])])
  setCalendar(data)
  setPeople(accounts)
  setError('')
 },[start,end,owner])
 useEffect(()=>{
  let active=true
  setLoading(true)
  Promise.all([fetchShifts(start,end),owner?listActiveShiftEmployees():Promise.resolve([]),supabase?.auth.getUser()])
   .then(async ([data,employees,auth])=>{
    if(!active)return
    setCalendar(data);setPeople(employees)
    const signedInId=auth?.data.user?.id||''
    setSelfId(signedInId)
    if(access.kind==='employee'){
     // Server preference wins over the local last-used name, so another
     // device's updated setting is not overwritten on page load.
     let preferred:string|null=null
     try{preferred=await fetchOwnPreferredShiftName(signedInId)}
     catch(e){if(active)setNotice({error:true,message:e instanceof Error?e.message:'無法讀取常用出勤名稱'})}
     if(!active)return
     let localName=''
     try{localName=window.localStorage.getItem('kogakure-shift-employee-name:'+signedInId)||''}catch{/* Optional cache. */}
     setEmployeeShiftName(preferred||localName||access.displayName)
     setSavedEmployeeShiftName(preferred||access.displayName)
    }
    setError('')
   })
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'出勤資料暫時無法讀取')})
   .finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[start,end,owner])
 async function run(action:()=>Promise<void>,message:string){
  if(busyRef.current)return
  busyRef.current=true;setBusy(true);setNotice(null)
  try{
   await action()
   try{await reload();setNotice({error:false,message})}
   catch(e){setNotice({error:true,message:'操作已送出，但重新讀取清單失敗。請點「重新整理」確認結果：'+(e instanceof Error?e.message:'網路異常')})}
  }catch(e){setNotice({error:true,message:e instanceof Error?e.message:'操作失敗，請重試'})}
  finally{busyRef.current=false;setBusy(false)}
 }
 function saveOpening(date:string,kind:ShiftKind,hours:string,note:string,eventTitle:string){
  return run(()=>setShiftOpening(date,kind,hours,note,eventTitle),'已更新 '+date+' 的營業狀態與活動安排。')
 }
 function mark(date:string,person:ShiftEmployee){
  return run(async()=>{
   if(owner){
    // Re-read immediately before assignment: a staff member may have
    // changed the preferred name after the manager opened this page.
    const fresh=await listActiveShiftEmployees()
    const latest=fresh.find(entry=>entry.id===person.id)
    if(!latest)throw new Error('員工帳號已停用或不存在，請重新整理排班清單')
    await markShiftAttendance(date,latest)
    setPeople(fresh)
    return
   }
   if(person.id===selfId){
    // Keep the preference visible to the manager even if no further shifts
    // are registered. Authentication is checked inside this operation.
    await saveOwnPreferredShiftName(person.name)
    setSavedEmployeeShiftName(person.name.trim())
    try{window.localStorage.setItem('kogakure-shift-employee-name:'+selfId,person.name.trim())}catch{/* Optional cache. */}
   }
   await markShiftAttendance(date,person)
  },owner?'已安排 '+date+' 出勤，名稱以員工最新設定為準。':'已登記 '+person.name.trim()+' 在 '+date+' 出勤。')
 }
 function savePreferredName(){
  const label=employeeShiftName.trim()
  return run(async()=>{
   await saveOwnPreferredShiftName(label)
   setSavedEmployeeShiftName(label)
   try{window.localStorage.setItem('kogakure-shift-employee-name:'+selfId,label)}catch{/* Optional cache. */}
  },'已儲存常用出勤名稱「'+label+'」，管理員日後安排新班次會使用這個名稱。')
 }
 function rename(date:string,person:ShiftAttendance,name:string){
  const label=name.trim()
  if(!label||label.length>100){
   setNotice({error:true,message:'出勤顯示名稱需填寫 1～100 字'})
   return Promise.resolve()
  }
  return run(async()=>{
   if(person.source==='employee'){
    await saveOwnPreferredShiftName(label)
    setSavedEmployeeShiftName(label)
   }
   await renameOwnShiftAttendance(date,person.source,label)
   const key=person.source==='owner'?'kogakure-shift-owner-display-name':'kogakure-shift-employee-name:'+selfId
   try{window.localStorage.setItem(key,label)}catch{/* Optional cache. */}
  },'已將 '+date+' 的出勤顯示名稱更新為「'+label+'」。')
 }
 function markOwn(date:string,name:string){
  const label=name.trim()
  if(!label||label.length>100){
   setNotice({error:true,message:'請先填寫 1～100 字的管理員出勤顯示名稱'})
   return Promise.resolve()
  }
  try{window.localStorage.setItem('kogakure-shift-owner-display-name',label)}catch{/* Storage is only a nickname convenience. */}
  return run(()=>markOwnerShiftAttendance(date,label),'已登記您在 '+date+' 出勤，顯示名稱為「'+label+'」。')
 }
 function remove(date:string,person:ShiftAttendance){
  return run(()=>unmarkShiftAttendance(date,person.employeeId,person.source),'已取消 '+person.name+' 在 '+date+' 的出勤。')
 }
 const openings=new Map(calendar.days.map(x=>[x.date,x]))
 const byDate=new Map<string,ShiftAttendance[]>()
 for(const member of calendar.attendance){
  const items=byDate.get(member.date)||[]
  items.push(member);byDate.set(member.date,items)
 }
 return <section className="shift-admin admin-page">
  <header className="shift-admin-heading">
   <div><p className="eyebrow">KOGAKURE · FOUR-WEEK DUTY ROSTER</p><h1>值班排班管理</h1>
    <p>{owner?'設定館內營業日期與時段，也能替自己報班、管理其他員工出勤。':'在已公布的營業日登記自己的出勤，還可以自訂公開顯示名稱。'}</p>
   </div>
   <div className="shift-admin-tools">
    <Link to="/shifts" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>查看前台</Link>
    <button disabled={busy||loading} type="button" onClick={()=>{void reload().catch(e=>setError(e instanceof Error?e.message:'重新整理失敗'))}}><RefreshCw size={16}/>重新整理</button>
   </div>
  </header>
  <p className="shift-admin-explain"><CalendarDays size={17}/>本週與未來三週，依台灣時間每週一自動往前更新。歷史排班不會因換週而刪除。</p>
  {owner&&<div className="shift-admin-owner-identity">
   <label htmlFor="shift-owner-name">我的出勤顯示名稱</label>
   <input id="shift-owner-name" value={ownerName} maxLength={100} disabled={busy}
    onChange={e=>setOwnerName(e.target.value)} placeholder="例：婆婆"/>
   <small>用管理員帳號直接報班，不需要另建員工帳號。名稱會顯示在前台值班名單；登記時會記住此名稱。</small>
  </div>}
  {!owner&&<div className="shift-admin-owner-identity">
   <label htmlFor="shift-employee-duty-name">我的出勤顯示名稱</label>
   <input id="shift-employee-duty-name" value={employeeShiftName} maxLength={100} disabled={busy}
    onChange={e=>setEmployeeShiftName(e.target.value)} placeholder="例：狐姬・紫月"/>
   <small>管理員安排新班次會使用已儲存的常用出勤名稱（不是帳號名稱）。自助報班會同步儲存常用名稱；已存在的班次不會自動改名，請在該日期點「儲存我的出勤名稱」。</small>
   <button type="button" className="shift-admin-save-preference" disabled={busy||!employeeShiftName.trim()||employeeShiftName.trim().length>100||employeeShiftName.trim()===savedEmployeeShiftName}
    onClick={()=>void savePreferredName()}><Save size={15}/>儲存常用出勤名稱</button>
  </div>}
  {notice&&<p className={'shift-admin-message'+(notice.error?' is-error':'')} role={notice.error?'alert':'status'}>
   {notice.error?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>} {notice.message}</p>}
  {error&&<p className="shift-admin-message is-error" role="alert">{error}</p>}
  {loading&&<p className="shift-admin-message" role="status">正在載入四週出勤表…</p>}
  {!loading&&!error&&<div className="shift-calendar-container">
   <div className="shift-calendar-heading">
    <div><p>四週排班總覽</p><h2>{shiftDateLabel(start)} — {shiftDateLabel(end)}</h2></div>
    <span>選取日期以查看與修改當日安排</span>
   </div>
   <div className="shift-calendar-legend" aria-label="營業狀態說明">
    <span><i className="is-open"/>營業</span>
    <span><i className="is-closed"/>休館</span>
    <span><i className="is-unannounced"/>未公告</span>
    <span><i className="is-today"/>今日</span>
   </div>
   <p className="shift-calendar-scroll-hint">手機可左右滑動月曆查看完整星期；點選任一日期編輯</p>
   <div className="shift-calendar-scroll" role="region" aria-label="四週值班月曆" tabIndex={0}>
    <div className="shift-calendar-grid">
     {SHIFT_WEEKDAYS.map(day=><div key={day} className="shift-calendar-weekday">週{day}</div>)}
     {weeks.flatMap(week=>week.days).map((date,index)=>{
      const day=openings.get(date)
      const staff=byDate.get(date)||[]
      const state:ShiftKind=!day?'unannounced':day.open?'open':'closed'
      const visibleStaff=day?.open?staff:[]
      const month=Number(date.slice(5,7)),dayNumber=Number(date.slice(8,10))
      const isToday=date===today
      return <button type="button" key={date}
       className={'shift-calendar-cell is-'+state+(isToday?' is-today':'')+(date<today?' is-past':'')}
       aria-label={date+' 週'+SHIFT_WEEKDAYS[index%7]+'，'+(state==='open'?'營業':state==='closed'?'休館':'未公告')+
        (state==='open'?'，出勤'+visibleStaff.length+'位'+(day?.eventTitle?'，活動：'+day.eventTitle:''):'')+'，開啟當日安排'}
       aria-haspopup="dialog" aria-expanded={selectedDate===date}
       onClick={event=>showDay(date,event.currentTarget)}>
       <span className="shift-calendar-cell-top">
        <span className="shift-calendar-date"><small>{month}月</small><strong>{dayNumber}</strong></span>
        {isToday&&<span className="shift-calendar-today">今日</span>}
       </span>
       <span className={'shift-calendar-status is-'+state}>{state==='open'?'營業':state==='closed'?'休館':'未公告'}</span>
       {state==='open'?<span className="shift-calendar-summary">
        {day?.hours&&<span className="shift-calendar-time"><Clock3 size={12}/>{day.hours}</span>}
        <span className="shift-calendar-count"><UsersRound size={13}/>{visibleStaff.length} 位出勤</span>
        {day?.eventTitle&&<span className="shift-calendar-event" title={day.eventTitle}>
         <Sparkles size={13}/><span>{day.eventTitle}</span>
        </span>}
       </span>:<span className="shift-calendar-empty">{state==='closed'?'當日休館':'尚未設定開店日'}</span>}
       <span className="shift-calendar-edit"><span>查看／安排</span><ChevronRight size={14}/></span>
      </button>
     })}
    </div>
   </div>
  </div>}
  {selectedDate&&!loading&&!error&&<div className="shift-admin-modal-backdrop"
   onMouseDown={event=>{if(event.target===event.currentTarget)closeDay()}}>
   <section className="shift-admin-modal" ref={modalRef} role="dialog" aria-modal="true"
    aria-labelledby="shift-day-modal-heading">
    <div className="shift-admin-modal-heading">
     <div><p>狐隱 KOGAKURE · 值班安排</p>
      <h2 id="shift-day-modal-heading">{selectedDate.replace(/-/g,' / ')} · 週{SHIFT_WEEKDAYS[(weeks.flatMap(week=>week.days).indexOf(selectedDate))%7]}</h2>
      <span>{owner?'調整當日營業及出勤人員':'查看營業狀態並登記自己的出勤'}</span>
     </div>
     <button type="button" ref={closeRef} className="shift-admin-modal-close"
      onClick={closeDay} disabled={busy} aria-label="關閉當日值班安排"><X size={21}/></button>
    </div>
    <div className="shift-admin-modal-body">
     {notice&&<p className={'shift-admin-message'+(notice.error?' is-error':'')} role={notice.error?'alert':'status'}>
      {notice.error?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>} {notice.message}</p>}
     <ShiftDayEditor key={selectedDate} date={selectedDate}
      weekday={SHIFT_WEEKDAYS[weeks.flatMap(week=>week.days).indexOf(selectedDate)%7]}
      today={today} day={openings.get(selectedDate)} staff={byDate.get(selectedDate)||[]}
      people={people} access={access} selfId={selfId} ownerName={ownerName}
      employeeShiftName={employeeShiftName} busy={busy}
      onOpening={saveOpening} onMark={mark} onMarkOwn={markOwn}
      onRename={rename} onRemove={remove}/>
    </div>
    <div className="shift-admin-modal-footer">
     <button type="button" onClick={closeDay} disabled={busy}>完成・關閉</button>
    </div>
   </section>
  </div>}
  <p className="shift-admin-help">尚未公告的日期不代表營業；只有管理員設定「營業」的日子才可登記出勤。員工與正式管理員均可使用自訂出勤顯示名稱。名稱不影響帳號權限、登入名稱或密碼。</p>
 </section>
}
