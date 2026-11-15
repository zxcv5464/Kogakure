import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, CheckCircle2, Clock3, ExternalLink, Plus, RefreshCw, Save, Trash2, X, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
 countdown, decideBooking, deleteAdminBooking, describeBookingError, loadAdminBookings,
 loadBookingPlans, removeBookingPlan, saveBookingPlan, setBookingNomineeVisibility, setStaffBookingRules, watchBookingChanges,
} from '../../lib/bookings'
import type { BookingPlan, BookingRequest, BookingStatus } from '../../lib/bookings'
import type { Staff } from '../../types'
import { getStaff } from '../../lib/staff'
import { invalidatePublicStaffCache } from '../../lib/public-staff'
import { useAdminEditGuard } from './AdminEditGuard'
import AdminBookingCreate from './AdminBookingCreate'
import ScrollCue from '../../components/ScrollCue'
import './booking-management.css'

const statusNames:Record<BookingStatus,string>={
 pending:'待審核',accepted:'指名中',rejected:'已婉拒',completed:'已完成',
}
const fmt=(date:string|null)=>date ? new Date(date).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—'
const gil=(n:number|null)=>n===null?'未設定費用':n.toLocaleString('en-US')+' Gil'
const initialPlan=():BookingPlan=>({id:crypto.randomUUID(),name:'',description:'',durationMinutes:30,priceGil:null,sortOrder:100,active:false,allowJoint:true,updatedAt:''})
type SelectedPlan={value:BookingPlan;original:BookingPlan;creating:boolean}
type NomineeRules={allowedPlanIds:string[]|null;allowJoint:boolean}
const currentRules=(person:Staff):NomineeRules=>({allowedPlanIds:person.bookingAllowedPlanIds,allowJoint:person.bookingAllowJoint})
const rulesEqual=(a:NomineeRules,b:NomineeRules)=>a.allowJoint===b.allowJoint&&
 (a.allowedPlanIds===null&&b.allowedPlanIds===null||
  a.allowedPlanIds!==null&&b.allowedPlanIds!==null&&
  a.allowedPlanIds.length===b.allowedPlanIds.length&&a.allowedPlanIds.every(id=>b.allowedPlanIds?.includes(id)))
export default function BookingManagement(){
 const [bookings,setBookings]=useState<BookingRequest[]>([])
 const [plans,setPlans]=useState<BookingPlan[]>([])
 const [nominees,setNominees]=useState<Staff[]>([])
 const [tab,setTab]=useState<'requests'|'plans'|'nominees'>('requests')
 const [filter,setFilter]=useState<'all'|BookingStatus>('pending')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 const busyRef=useRef(false)
 const [focused,setFocused]=useState<string|null>(null)
 const [planDraft,setPlanDraft]=useState<SelectedPlan|null>(null)
 const [ruleDrafts,setRuleDrafts]=useState<Record<string,NomineeRules>>({})
 const [now,setNow]=useState(Date.now())
 const lastSeen=useRef(new Set<string>())
 const didLoad=useRef(false)
 const [incoming,setIncoming]=useState<BookingRequest|null>(null)
 const [creatingBooking,setCreatingBooking]=useState(false)
 const {setEditing}=useAdminEditGuard()
 const dirty=Boolean(planDraft&&(planDraft.creating||JSON.stringify(planDraft.value)!==JSON.stringify(planDraft.original)))||
  nominees.some(person=>ruleDrafts[person.id]&&!rulesEqual(ruleDrafts[person.id],currentRules(person)))
 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 const refresh=useCallback(async()=>{
  const [requests,updatedPlans,updatedNominees]=await Promise.all([loadAdminBookings(),loadBookingPlans(true),getStaff(true)])
  if(didLoad.current){
   const newcomers=requests.filter(r=>r.status==='pending'&&!lastSeen.current.has(r.id))
   if(newcomers.length)setIncoming(newcomers[0])
  } else didLoad.current=true
  lastSeen.current=new Set(requests.map(r=>r.id))
  setBookings(requests);setPlans(updatedPlans);setNominees(updatedNominees);setError('')
 },[])
 useEffect(()=>{
  let alive=true
  refresh().catch(e=>{if(alive)setError(describeBookingError(e))})
   .finally(()=>{if(alive)setLoading(false)})
  const poll=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{})},7000)
  const clock=window.setInterval(()=>setNow(Date.now()),1000)
  const unwatch=watchBookingChanges(()=>{void refresh().catch(()=>{})},true)
  const visible=()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{})}
  document.addEventListener('visibilitychange',visible)
  return()=>{alive=false;unwatch();window.clearInterval(poll);window.clearInterval(clock);document.removeEventListener('visibilitychange',visible)}
 },[refresh])
 const counts=useMemo(()=>({
  pending:bookings.filter(b=>b.status==='pending').length,
  accepted:bookings.filter(b=>b.status==='accepted').length,
  completed:bookings.filter(b=>b.status==='completed').length,
  rejected:bookings.filter(b=>b.status==='rejected').length,
 }),[bookings])
 const shown=useMemo(()=>bookings.filter(b=>filter==='all'||b.status===filter),[bookings,filter])
 const selectedBooking=bookings.find(b=>b.id===focused)

 async function changeNominationAvailability(person:Staff,visible:boolean){
  if(busyRef.current||person.bookingVisible===visible)return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{
   await setBookingNomineeVisibility(person.id,visible)
   // Preserve a successful write even if a subsequent refresh fails.
   setNominees(current=>current.map(p=>p.id===person.id?{...p,bookingVisible:visible}:p))
   invalidatePublicStaffCache()
   const message=person.name+(visible?' 已開放預約指名。':' 已關閉新的預約指名。')
   try{
    await refresh()
    setNotice(message+(person.published?' 前台預約頁重新開啟後會顯示最新狀態。':' 名帖尚未公開，前台仍不會顯示。'))
   }catch{
    setNotice(message+' 已成功儲存，但重新載入清單失敗，請稍後按「更新」。')
   }
  }catch(e){setError(describeBookingError(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 function editNomineeRules(person:Staff,edit:(current:NomineeRules)=>NomineeRules){
  setRuleDrafts(old=>({...old,[person.id]:edit(old[person.id]||currentRules(person))}))
 }
 async function saveNomineeRules(person:Staff){
  if(busyRef.current)return
  const setting=ruleDrafts[person.id]
  if(!setting||rulesEqual(setting,currentRules(person)))return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{
   await setStaffBookingRules(person.id,setting.allowedPlanIds,setting.allowJoint)
   setNominees(old=>old.map(p=>p.id===person.id
    ?{...p,bookingAllowedPlanIds:setting.allowedPlanIds,bookingAllowJoint:setting.allowJoint}:p))
   setRuleDrafts(old=>{const next={...old};delete next[person.id];return next})
   invalidatePublicStaffCache()
   try{await refresh()}catch{/* Persisted; visible local state remains authoritative until next refresh. */}
   setNotice(person.name+' 的接受方案與同時指名設定已儲存，新的預約會套用最新規則。')
  }catch(e){setError(describeBookingError(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 function changeTab(next:'requests'|'plans'|'nominees'){
  if(dirty&&!window.confirm('尚有未儲存的預約設定。確定放棄修改？'))return
  setTab(next);setPlanDraft(null);setRuleDrafts({})
 }
 async function act(booking:BookingRequest,action:'accept'|'reject'|'complete'){
  if(busyRef.current)return
  const label=action==='accept'?'接取':action==='reject'?'婉拒':'結束'
  if(!window.confirm('確定'+label+'「'+booking.guestName+'」的指名？'+(action==='accept'?'接取後所有指定館員即刻顯示指名中並開始計時。':'')))return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{
   await decideBooking(booking.id,action)
   await refresh()
   setIncoming(null)
   setNotice('已'+label+'申請，館員狀態與計時已同步更新。')
  }catch(e){setError(describeBookingError(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function onManualCreated(id:string){
  setCreatingBooking(false)
  await refresh()
  setIncoming(null)
  setTab('requests')
  setFilter('all')
  setFocused(id)
  setNotice('已新增待審核指名申請；請確認後按「接取」才開始計時。')
 }
 async function removeBooking(record:BookingRequest){
  if(busyRef.current)return
  const shortId=record.id.slice(0,8)
  if(!window.confirm(
   '確定要刪除「'+record.guestName+'」的這筆預約嗎？\n'+
   '預約編號：'+shortId+'\n'+
   (record.status==='accepted'?'這筆預約正在指名中，刪除後將釋放相關館員的占用狀態。\n':'')+
   '預約及指名紀錄將永久刪除，無法復原。'
  ))return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{
   await deleteAdminBooking(record.id)
   await refresh()
   setFocused(null)
   setIncoming(null)
   setNotice('預約紀錄已永久刪除'+(record.status==='accepted'?'，對應狐姬狀態已更新。':'。'))
  }catch(e){setError(describeBookingError(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 function choosePlan(plan:BookingPlan,creating=false){
  if(dirty&&!window.confirm('尚有未儲存的方案修改，確定放棄？'))return
  setPlanDraft({value:{...plan},original:{...plan},creating})
  setError('');setNotice('')
 }
 function patchPlan<K extends keyof BookingPlan>(field:K,value:BookingPlan[K]){
  setPlanDraft(prev=>prev?{...prev,value:{...prev.value,[field]:value}}:prev)
 }
 async function savePlan(){
  if(!planDraft||busyRef.current)return
  const p=planDraft.value
  if(p.name.trim().length<2||p.name.trim().length>70||!Number.isInteger(p.durationMinutes)||p.durationMinutes<5||p.durationMinutes>240||
   (p.priceGil!==null&&(!Number.isSafeInteger(p.priceGil)||p.priceGil<0||p.priceGil>999999999))){
   setError('請確認方案名稱、時長（5～240 分鐘）及 Gil 金額');return
  }
  busyRef.current=true;setBusy(true);setError('')
  try{await saveBookingPlan(p,planDraft.creating);await refresh();setPlanDraft(null);setNotice('方案已儲存；新申請會使用更新後的方案，既有訂單保留當時的時間及金額。')}
  catch(e){setError(describeBookingError(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function deletePlan(){
  if(!planDraft||planDraft.creating||busyRef.current)return
  if(!window.confirm('確定刪除方案「'+planDraft.value.name+'」？若已有申請使用此方案，資料庫將拒絕刪除。'))return
  busyRef.current=true;setBusy(true);setError('')
  try{await removeBookingPlan(planDraft.value);await refresh();setPlanDraft(null);setNotice('已刪除方案')}
  catch(e){setError(describeBookingError(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 return <section className="booking-admin admin-page">
  <header className="booking-admin-header">
   <div><p className="eyebrow">KOGAKURE · RESERVATION DESK</p><h1>狐姬預約管理</h1><p>申請審核、指名狀態、可指名人員與指名方案設定</p></div>
   <div className="booking-admin-top-actions">
    <button type="button" className="booking-admin-new-button" disabled={busy||loading} onClick={()=>{setTab('requests');setCreatingBooking(true)}}><Plus size={16}/>新增預約</button>
    <button type="button" disabled={busy} onClick={()=>void refresh().catch(e=>setError(describeBookingError(e)))}><RefreshCw size={16}/>更新</button>
    <Link to="/booking" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>查看前台</Link>
   </div>
  </header>
  <div className="booking-admin-stats">
   <div><strong>{counts.pending}</strong><span>待審核</span></div>
   <div><strong>{counts.accepted}</strong><span>指名中／待結案</span></div>
   <div><strong>{counts.completed}</strong><span>已完成</span></div>
   <div><strong>{counts.rejected}</strong><span>已婉拒</span></div>
  </div>
  {incoming&&<div className="booking-admin-alert" role="alert">
   <Bell size={20}/><div><strong>收到新的指名申請</strong><p>{incoming.guestName} · {incoming.guestWorld} · {incoming.planName} · 指名 {incoming.staff.length} 位 · {incoming.staff.map(s=>s.name).join('、')}</p></div>
   <button type="button" onClick={()=>{setTab('requests');setFilter('all');setFocused(incoming.id);setIncoming(null)}}>查看內容</button>
   <button type="button" aria-label="關閉通知" onClick={()=>setIncoming(null)}><X size={17}/></button>
  </div>}
  {error&&<p className="booking-admin-error" role="alert">{error}</p>}
  {notice&&<p className="booking-admin-success" role="status"><CheckCircle2 size={17}/>{notice}</p>}
  <div className="booking-admin-tabs">
   <button className={tab==='requests'?'active':''} type="button" onClick={()=>changeTab('requests')}>預約申請</button>
   <button className={tab==='plans'?'active':''} type="button" onClick={()=>changeTab('plans')}>指名方案管理</button>
   <button className={tab==='nominees'?'active':''} type="button" onClick={()=>changeTab('nominees')}>可指名人員設定</button>
  </div>
  {loading&&<p className="booking-admin-loading" role="status">正在讀取預約清單…</p>}
  {!loading&&tab==='requests'&&<div className="booking-admin-requests">
   <div className="booking-admin-filters">
    {(['pending','accepted','completed','rejected','all'] as const).map(status=><button key={status} type="button" className={filter===status?'active':''} onClick={()=>setFilter(status)}>
     {status==='all'?'全部':statusNames[status]}{status!=='all'?' · '+counts[status]:''}</button>)}
   </div>
   {!shown.length?<p className="booking-admin-empty">目前沒有符合條件的指名申請。</p>:<div className="booking-admin-list">
    {shown.map(r=><article key={r.id} className="booking-admin-request">
     <div className="booking-admin-request-top"><span className={'booking-admin-status is-'+r.status}>{statusNames[r.status]}</span><time>{fmt(r.createdAt)}</time></div>
     <h2>{r.guestName} <small>／ {r.guestWorld}</small></h2>
     <p className="booking-admin-nominees"><strong>指名人員（{r.staff.length} 位）：</strong>
      <span className="booking-admin-nominee-list">{r.staff.length?r.staff.map(person=><span key={person.id}>{person.name}</span>):'無'}</span>
     </p>
     <p><strong>方案：</strong>{r.planName} · {r.durationMinutes} 分鐘 · {gil(r.priceGil)}</p>
     {r.status==='accepted'&&<p className="booking-admin-timer"><Clock3 size={16}/>{r.endsAt&&new Date(r.endsAt).getTime()<=now?'已達預定時間，請確認結束': '剩餘 '+countdown(r.endsAt,now)}（開始：{fmt(r.acceptedAt)}）</p>}
     <div className="booking-admin-request-actions">
      <button type="button" onClick={()=>setFocused(r.id)}>查看詳細</button>
      <button type="button" className="danger" disabled={busy} aria-label={'永久刪除 '+r.guestName+' 的預約 '+r.id.slice(0,8)} onClick={()=>void removeBooking(r)}><Trash2 size={16}/>刪除預約</button>
      {r.status==='pending'&&<><button type="button" className="primary" disabled={busy} onClick={()=>void act(r,'accept')}><Check size={16}/>接取</button><button type="button" className="danger" disabled={busy} onClick={()=>void act(r,'reject')}><XCircle size={16}/>婉拒</button></>}
      {r.status==='accepted'&&<button type="button" className="primary" disabled={busy} onClick={()=>void act(r,'complete')}><CheckCircle2 size={16}/>結束服務</button>}
     </div>
    </article>)}
   </div>}
  </div>}
  {!loading&&tab==='nominees'&&<section className="booking-admin-nominee-settings">
   <div className="booking-admin-nominee-settings-head">
    <div><h2>可指名人員設定</h2>
     <p>在這裡設定各位狐姬是否開放指名、可接受的預約方案及是否允許與其他狐姬同時指名。顯示開關立即儲存，個人預約規則請按下「儲存此狐姬設定」。</p>
    </div>
    <div className="booking-admin-nominee-summary"><strong>{nominees.filter(p=>p.published&&p.bookingVisible).length}</strong><span>位目前公開接受指名</span></div>
   </div>
   {!nominees.length?<p className="booking-admin-empty">目前尚無員工名帖。請先到「員工名帖」建立人員資料。</p>:
    <div className="booking-admin-nominee-grid">
     {nominees.map(person=>{
      const rules=ruleDrafts[person.id]||currentRules(person)
      const rulesDirty=!rulesEqual(rules,currentRules(person))
      return <article className="booking-admin-nominee-card" key={person.id}>
      <div className="booking-admin-nominee-identity">
       <span className="booking-admin-nominee-avatar">
        {(person.thumbnailUrl||person.imageUrl)?<img src={person.thumbnailUrl||person.imageUrl} alt="" loading="lazy"/>:person.name.slice(0,1)}
       </span>
       <div><h3>{person.name}</h3><p>{person.role||'館員'}</p>
        <span className={'booking-admin-nominee-publish'+(person.published?' is-published':'')}>{person.published?'名帖已公開':'名帖未公開'}</span>
       </div>
      </div>
      <label className="booking-admin-visibility-switch">
       <input type="checkbox" checked={person.bookingVisible} disabled={busy}
        aria-label={person.name+'：在預約頁面顯示並接受指名'}
        onChange={event=>void changeNominationAvailability(person,event.target.checked)}/>
       <span><strong>在預約頁面顯示並接受指名</strong>
        <small>{person.bookingVisible?
         person.published?'目前開放指名，旅人可在預約頁選擇這位館員。':'已允許指名，但需要先在「員工名帖」公開名帖，旅人才看得到。'
         :'已關閉新指名；原有名帖和既有預約紀錄不受影響。'}</small>
       </span>
      </label>
      <div className="booking-admin-person-rules">
       <div className="booking-admin-person-rules-heading">
        <strong>可接受指名方案</strong><small>設定只影響新的預約及尚未接取的申請</small>
       </div>
       <label className="booking-admin-rules-choice"><input type="radio" name={'booking-plan-mode-'+person.id}
        checked={rules.allowedPlanIds===null} disabled={busy}
        onChange={()=>editNomineeRules(person,r=>({...r,allowedPlanIds:null}))}/>
        <span>接受所有方案（包含日後新增的方案）</span></label>
       <label className="booking-admin-rules-choice"><input type="radio" name={'booking-plan-mode-'+person.id}
        checked={rules.allowedPlanIds!==null} disabled={busy}
        onChange={()=>editNomineeRules(person,r=>({...r,allowedPlanIds:r.allowedPlanIds||[]}))}/>
        <span>僅接受指定方案</span></label>
       {rules.allowedPlanIds!==null&&<div className="booking-admin-plan-options" role="group" aria-label={person.name+' 可接受的方案'}>
        {!plans.length?<p>尚無方案，請先至「指名方案管理」建立方案。</p>:
         plans.map(plan=><label key={plan.id}><input type="checkbox" disabled={busy}
          checked={rules.allowedPlanIds?.includes(plan.id)||false}
          onChange={e=>editNomineeRules(person,r=>({
           ...r,allowedPlanIds:e.target.checked?[...new Set([...(r.allowedPlanIds||[]),plan.id])]:
            (r.allowedPlanIds||[]).filter(id=>id!==plan.id),
          }))}/>
          <span>{plan.name}{!plan.active&&<small>（尚未對外開放）</small>}</span>
         </label>)}
        {!rules.allowedPlanIds.length&&<p>未選擇方案：這位狐姬暫不接受任何新方案。</p>}
       </div>}
       <label className="booking-admin-rules-choice">
        <input type="checkbox" checked={rules.allowJoint} disabled={busy}
         onChange={e=>editNomineeRules(person,r=>({...r,allowJoint:e.target.checked}))}/>
        <span>開放與其他狐姬同時指名<small>關閉後，只能單獨指名這位狐姬。</small></span>
       </label>
       <button type="button" className="booking-admin-rules-save" disabled={busy||!rulesDirty}
        onClick={()=>void saveNomineeRules(person)}><Save size={15}/>儲存此狐姬設定</button>
      </div>
     </article>})}
    </div>}
   <p className="booking-admin-nominee-footnote">只有名帖已公開、接受指名已開啟且擁有可預約方案的館員才能接受新指名。雙人指名必須兩位狐姬都同意、且接受相同方案。不限職稱。既有預約不會刪除；尚未接取的預約會於接單時驗證最新設定。</p>
  </section>}
  {!loading&&tab==='plans'&&<div className="booking-admin-plans">
   <div className="booking-admin-plan-head"><p>新開放的方案才會顯示在前台。範例方案預設未開放，請確認內容與費用後再啟用。</p><button type="button" onClick={()=>choosePlan(initialPlan(),true)}><Plus size={16}/>新增方案</button></div>
   <div className="booking-admin-plan-layout">
    <div className="booking-admin-plan-list">{plans.map(p=><button key={p.id} type="button" className={planDraft?.value.id===p.id?'active':''} onClick={()=>choosePlan(p)}><strong>{p.name}</strong><small>{p.durationMinutes} 分鐘 · {gil(p.priceGil)} · {p.allowJoint?'可同時指名':'僅限單人'}</small><em>{p.active?'已開放':'草稿'}</em></button>)}</div>
    <div className="booking-admin-plan-editor">
     {!planDraft?<p>請選擇方案或新增方案，編輯後儲存即可同步前台。</p>:<form onSubmit={e=>{e.preventDefault();void savePlan()}}>
      <h2>{planDraft.creating?'新增指名方案':'編輯指名方案'}</h2>
      <label>方案名稱 <input required minLength={2} maxLength={70} value={planDraft.value.name} onChange={e=>patchPlan('name',e.target.value)}/></label>
      <label>介紹 <textarea rows={3} value={planDraft.value.description} onChange={e=>patchPlan('description',e.target.value)}/></label>
      <div className="booking-admin-plan-row"><label>時長（分鐘） <input type="number" min={5} max={240} required value={planDraft.value.durationMinutes} onChange={e=>patchPlan('durationMinutes',Number(e.target.value))}/></label>
       <label>費用（Gil；可留空） <input type="number" min={0} max={999999999} step={1} value={planDraft.value.priceGil??''} onChange={e=>patchPlan('priceGil',e.target.value===''?null:Number(e.target.value))}/></label></div>
      <label>排序 <input type="number" min={0} step={1} value={planDraft.value.sortOrder} onChange={e=>patchPlan('sortOrder',Number(e.target.value))}/></label>
      <label className="booking-admin-plan-toggle"><input type="checkbox" checked={planDraft.value.active} onChange={e=>patchPlan('active',e.target.checked)}/>對旅人開放此方案</label>
      <label className="booking-admin-plan-toggle"><input type="checkbox" checked={planDraft.value.allowJoint}
       onChange={e=>patchPlan('allowJoint',e.target.checked)}/>開放同時指名（最多兩位狐姬）</label>
      <p className="booking-admin-plan-hint">關閉後，此方案僅接受單人指名。即使方案開放，兩位狐姬也都必須同意同時指名。</p>
      <div className="booking-admin-plan-actions">
       {!planDraft.creating&&<button type="button" className="danger" disabled={busy} onClick={()=>void deletePlan()}><Trash2 size={16}/>刪除</button>}
       <button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('放棄修改？'))setPlanDraft(null)}}>取消</button>
       <button className="primary" type="submit" disabled={busy||!dirty}><Save size={16}/>{busy?'儲存中…':'儲存方案'}</button>
      </div>
     </form>}
    </div>
   </div>
  </div>}
  {creatingBooking&&<AdminBookingCreate plans={plans} close={()=>setCreatingBooking(false)} onCreated={onManualCreated}/>}
  {selectedBooking&&<div className="booking-admin-detail-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setFocused(null)}}>
   <div className="booking-admin-detail" role="dialog" aria-modal="true" aria-labelledby="booking-admin-detail-title">
    <button type="button" className="booking-admin-close" aria-label="關閉詳細資料" onClick={()=>setFocused(null)}><X size={20}/></button>
    <p className="eyebrow">KOGAKURE · BOOKING RECORD</p><h2 id="booking-admin-detail-title">指名申請詳細資料</h2>
    <dl>
     <div><dt>申請編號</dt><dd>{selectedBooking.id}</dd></div>
     <div><dt>預約者姓名</dt><dd>{selectedBooking.guestName}</dd></div>
     <div><dt>伺服器</dt><dd>{selectedBooking.guestWorld}</dd></div>
     <div><dt>指名人員（{selectedBooking.staff.length} 位）</dt><dd className="booking-admin-nominee-list">
      {selectedBooking.staff.length?selectedBooking.staff.map(person=><span key={person.id}>{person.name}</span>):'無'}
     </dd></div>
     <div><dt>指名方案</dt><dd>{selectedBooking.planName}</dd></div>
     <div><dt>時長與金額</dt><dd>{selectedBooking.durationMinutes} 分鐘 · {gil(selectedBooking.priceGil)}</dd></div>
     <div><dt>申請時間（台灣）</dt><dd>{fmt(selectedBooking.createdAt)}</dd></div>
     <div><dt>審核狀態</dt><dd>{statusNames[selectedBooking.status]}</dd></div>
     <div><dt>備註</dt><dd>{selectedBooking.note||'無'}</dd></div>
     {selectedBooking.acceptedAt&&<div><dt>接取時間（台灣）</dt><dd>{fmt(selectedBooking.acceptedAt)}</dd></div>}
     {selectedBooking.endsAt&&<div><dt>預定結束（台灣）</dt><dd>{fmt(selectedBooking.endsAt)}</dd></div>}
     {selectedBooking.status==='accepted'&&<div><dt>同步倒數</dt><dd>{countdown(selectedBooking.endsAt,now)}（依伺服器接取時間起算）</dd></div>}
     {selectedBooking.completedAt&&<div><dt>實際結束（台灣）</dt><dd>{fmt(selectedBooking.completedAt)}</dd></div>}
    </dl>
    <div className="booking-admin-detail-actions">
     <button type="button" className="danger" disabled={busy} onClick={()=>void removeBooking(selectedBooking)}><Trash2 size={16}/>永久刪除此筆</button>
     {selectedBooking.status==='pending'&&<><button type="button" className="primary" disabled={busy} onClick={()=>void act(selectedBooking,'accept')}>接取並開始計時</button><button type="button" className="danger" disabled={busy} onClick={()=>void act(selectedBooking,'reject')}>婉拒</button></>}
     {selectedBooking.status==='accepted'&&<button type="button" className="primary" disabled={busy} onClick={()=>void act(selectedBooking,'complete')}>結束服務並釋放狐姬</button>}
    </div>
    <ScrollCue/>
   </div>
  </div>}
 </section>
}
