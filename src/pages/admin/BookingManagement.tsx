import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, CheckCircle2, Clock3, ExternalLink, Plus, RefreshCw, Save, Trash2, X, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
 countdown, decideBooking, deleteAdminBooking, describeBookingError, loadAdminBookings,
 loadBookingPlans, removeBookingPlan, saveBookingPlan, watchBookingChanges,
} from '../../lib/bookings'
import type { BookingPlan, BookingRequest, BookingStatus } from '../../lib/bookings'
import { useAdminEditGuard } from './AdminEditGuard'
import AdminBookingCreate from './AdminBookingCreate'
import './booking-management.css'

const statusNames:Record<BookingStatus,string>={
 pending:'待審核',accepted:'指名中',rejected:'已婉拒',completed:'已完成',
}
const fmt=(date:string|null)=>date ? new Date(date).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—'
const gil=(n:number|null)=>n===null?'未設定費用':n.toLocaleString('en-US')+' Gil'
const initialPlan=():BookingPlan=>({id:crypto.randomUUID(),name:'',description:'',durationMinutes:30,priceGil:null,sortOrder:100,active:false,updatedAt:''})
type SelectedPlan={value:BookingPlan;original:BookingPlan;creating:boolean}
export default function BookingManagement(){
 const [bookings,setBookings]=useState<BookingRequest[]>([])
 const [plans,setPlans]=useState<BookingPlan[]>([])
 const [tab,setTab]=useState<'requests'|'plans'>('requests')
 const [filter,setFilter]=useState<'all'|BookingStatus>('pending')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 const busyRef=useRef(false)
 const [focused,setFocused]=useState<string|null>(null)
 const [planDraft,setPlanDraft]=useState<SelectedPlan|null>(null)
 const [now,setNow]=useState(Date.now())
 const lastSeen=useRef(new Set<string>())
 const didLoad=useRef(false)
 const [incoming,setIncoming]=useState<BookingRequest|null>(null)
 const [creatingBooking,setCreatingBooking]=useState(false)
 const {setEditing}=useAdminEditGuard()
 const dirty=Boolean(planDraft&&(planDraft.creating||JSON.stringify(planDraft.value)!==JSON.stringify(planDraft.original)))
 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 const refresh=useCallback(async()=>{
  const [requests,updatedPlans]=await Promise.all([loadAdminBookings(),loadBookingPlans(true)])
  if(didLoad.current){
   const newcomers=requests.filter(r=>r.status==='pending'&&!lastSeen.current.has(r.id))
   if(newcomers.length)setIncoming(newcomers[0])
  } else didLoad.current=true
  lastSeen.current=new Set(requests.map(r=>r.id))
  setBookings(requests);setPlans(updatedPlans);setError('')
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

 async function act(booking:BookingRequest,action:'accept'|'reject'|'complete'){
  if(busyRef.current)return
  const label=action==='accept'?'接取':action==='reject'?'婉拒':'結束'
  if(!window.confirm('確定'+label+'「'+booking.guestName+'」的指名？'+(action==='accept'?'接取後所有指定狐姬即刻顯示指名中並開始計時。':'')))return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{
   await decideBooking(booking.id,action)
   await refresh()
   setIncoming(null)
   setNotice('已'+label+'申請，狐姬狀態與計時已同步更新。')
  }catch(e){setError(describeBookingError(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function onManualCreated(id:string){
  await refresh()
  setCreatingBooking(false)
  setIncoming(null)
  setTab('requests')
  setFilter('all')
  setFocused(id)
  setNotice('已新增待審核指名申請；請確認後按「接取」才開始計時。')
 }
 async function removeBooking(record:BookingRequest){
  if(busyRef.current)return
  const phrase=window.prompt(
   '即將永久刪除「'+record.guestName+'」的預約資料。\n'+
   (record.status==='accepted'?'此筆正在指名中，刪除時會同步釋放狐姬的占用狀態。\n':'')+
   '刪除後無法復原。請輸入「刪除」確認：'
  )
  if(phrase!=='刪除')return
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
   <div><p className="eyebrow">KOGAKURE · RESERVATION DESK</p><h1>狐姬預約管理</h1><p>申請審核、指名狀態、同步計時及指名方案設定</p></div>
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
   <Bell size={20}/><div><strong>收到新的指名申請</strong><p>{incoming.guestName} · {incoming.guestWorld} · {incoming.planName} · {incoming.staff.map(s=>s.name).join('、')}</p></div>
   <button type="button" onClick={()=>{setTab('requests');setFilter('all');setFocused(incoming.id);setIncoming(null)}}>查看內容</button>
   <button type="button" aria-label="關閉通知" onClick={()=>setIncoming(null)}><X size={17}/></button>
  </div>}
  {error&&<p className="booking-admin-error" role="alert">{error}</p>}
  {notice&&<p className="booking-admin-success" role="status"><CheckCircle2 size={17}/>{notice}</p>}
  <div className="booking-admin-tabs">
   <button className={tab==='requests'?'active':''} type="button" onClick={()=>{if(!dirty||window.confirm('放棄未儲存的方案修改？')){setTab('requests');setPlanDraft(null)}}}>預約申請</button>
   <button className={tab==='plans'?'active':''} type="button" onClick={()=>setTab('plans')}>指名方案管理</button>
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
     <p><strong>指名狐姬：</strong>{r.staff.map(s=>s.name).join('、')||'無'}</p>
     <p><strong>方案：</strong>{r.planName} · {r.durationMinutes} 分鐘 · {gil(r.priceGil)}</p>
     {r.status==='accepted'&&<p className="booking-admin-timer"><Clock3 size={16}/>{r.endsAt&&new Date(r.endsAt).getTime()<=now?'已達預定時間，請確認結束': '剩餘 '+countdown(r.endsAt,now)}（開始：{fmt(r.acceptedAt)}）</p>}
     <div className="booking-admin-request-actions">
      <button type="button" onClick={()=>setFocused(r.id)}>查看詳細</button>
      <button type="button" className="danger" disabled={busy} onClick={()=>void removeBooking(r)}><Trash2 size={16}/>刪除</button>
      {r.status==='pending'&&<><button type="button" className="primary" disabled={busy} onClick={()=>void act(r,'accept')}><Check size={16}/>接取</button><button type="button" className="danger" disabled={busy} onClick={()=>void act(r,'reject')}><XCircle size={16}/>婉拒</button></>}
      {r.status==='accepted'&&<button type="button" className="primary" disabled={busy} onClick={()=>void act(r,'complete')}><CheckCircle2 size={16}/>結束服務</button>}
     </div>
    </article>)}
   </div>}
  </div>}
  {!loading&&tab==='plans'&&<div className="booking-admin-plans">
   <div className="booking-admin-plan-head"><p>新開放的方案才會顯示在前台。範例方案預設未開放，請確認內容與費用後再啟用。</p><button type="button" onClick={()=>choosePlan(initialPlan(),true)}><Plus size={16}/>新增方案</button></div>
   <div className="booking-admin-plan-layout">
    <div className="booking-admin-plan-list">{plans.map(p=><button key={p.id} type="button" className={planDraft?.value.id===p.id?'active':''} onClick={()=>choosePlan(p)}><strong>{p.name}</strong><small>{p.durationMinutes} 分鐘 · {gil(p.priceGil)}</small><em>{p.active?'已開放':'草稿'}</em></button>)}</div>
    <div className="booking-admin-plan-editor">
     {!planDraft?<p>請選擇方案或新增方案，編輯後儲存即可同步前台。</p>:<form onSubmit={e=>{e.preventDefault();void savePlan()}}>
      <h2>{planDraft.creating?'新增指名方案':'編輯指名方案'}</h2>
      <label>方案名稱 <input required minLength={2} maxLength={70} value={planDraft.value.name} onChange={e=>patchPlan('name',e.target.value)}/></label>
      <label>介紹 <textarea rows={3} value={planDraft.value.description} onChange={e=>patchPlan('description',e.target.value)}/></label>
      <div className="booking-admin-plan-row"><label>時長（分鐘） <input type="number" min={5} max={240} required value={planDraft.value.durationMinutes} onChange={e=>patchPlan('durationMinutes',Number(e.target.value))}/></label>
       <label>費用（Gil；可留空） <input type="number" min={0} max={999999999} step={1} value={planDraft.value.priceGil??''} onChange={e=>patchPlan('priceGil',e.target.value===''?null:Number(e.target.value))}/></label></div>
      <label>排序 <input type="number" min={0} step={1} value={planDraft.value.sortOrder} onChange={e=>patchPlan('sortOrder',Number(e.target.value))}/></label>
      <label className="booking-admin-plan-toggle"><input type="checkbox" checked={planDraft.value.active} onChange={e=>patchPlan('active',e.target.checked)}/>對旅人開放此方案</label>
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
     <div><dt>指名狐姬</dt><dd>{selectedBooking.staff.map(s=>s.name).join('、')}</dd></div>
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
   </div>
  </div>}
 </section>
}
