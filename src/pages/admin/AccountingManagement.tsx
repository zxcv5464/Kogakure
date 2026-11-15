import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {ArrowDownLeft,ArrowUpRight,CalendarDays,CheckCircle2,FilePenLine,Plus,RefreshCw,Save,Trash2,TriangleAlert,Wallet,X} from 'lucide-react'
import {
 accountingSummary,deleteAccountingEntry,fetchAccountingEntries,
 fetchAccountingPeriodSales,fetchAccountingPayees,mergedAccountingSummary,saveAccountingEntry,validateAccountingInput,
} from '../../lib/accounting'
import type {AccountingEntry,AccountingInput,AccountingKind,AccountingPeriod,AccountingSalesSummary,AccountingPayee,PayrollDistribution} from '../../lib/accounting'
import {validVenueDate,validVenueMonth,venueDate,venueWeekRange,shiftVenueDate} from '../../lib/taipei-date'
import {useAdminEditGuard} from './AdminEditGuard'
import DailyPayrollSection from './DailyPayrollSection'
import PaidPayrollRecordEditor from './PaidPayrollRecordEditor'
import {parsePayrollReference} from '../../lib/daily-payroll'
import './accounting-management.css'

const categories:Record<AccountingKind,string[]>={
 income:['額外收入','茶宴收入','湯浴收入','占卜收入','指名服務','共同小費','其他收入'],
 expense:['餐點材料','館內用品','員工薪酬','活動支出','場地費用','其他支出'],
}
const fresh=():AccountingInput=>({
 date:venueDate(),kind:'income',category:'額外收入',amountGil:0,
 description:'',reference:'',isAdditionalRevenue:true,
 payrollDistribution:'shared',payrollRecipientId:null,
})
const money=(value:number)=>value.toLocaleString('en-US')+' Gil'
const timestamp=(value:string)=>new Intl.DateTimeFormat('zh-TW',{
 timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
 hour12:false,
}).format(new Date(value))

export default function AccountingManagement(){
 const [mode,setMode]=useState<AccountingPeriod['mode']>('month')
 const [date,setDate]=useState(()=>venueDate())
 const [month,setMonth]=useState(()=>venueDate().slice(0,7))
 const [entries,setEntries]=useState<AccountingEntry[]>([])
 const [sales,setSales]=useState<AccountingSalesSummary|null>(null)
 const [payees,setPayees]=useState<AccountingPayee[]>([])
 const [payeeError,setPayeeError]=useState('')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 const [payrollRefreshKey,setPayrollRefreshKey]=useState(0)
 const [kindFilter,setKindFilter]=useState<'all'|AccountingKind>('all')
 const [draft,setDraft]=useState<AccountingInput>(fresh)
 const [editingId,setEditingId]=useState<string|null>(null)
 const [original,setOriginal]=useState<AccountingInput|null>(null)
 const serial=useRef(0)
 const editor=useRef<HTMLFormElement>(null)
 const {setEditing}=useAdminEditGuard()
 const dirty=editingId!==null
  ? JSON.stringify(draft)!==JSON.stringify(original)
  : JSON.stringify(draft)!==JSON.stringify(fresh())

 useEffect(()=>{
  let alive=true
  void fetchAccountingPayees().then(list=>{if(alive){setPayees(list);setPayeeError('')}})
   .catch(e=>{if(alive)setPayeeError(e instanceof Error?e.message:'無法讀取員工名單')})
  return()=>{alive=false}
 },[])
 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 const period=useMemo<AccountingPeriod>(()=>({
  mode,value:mode==='day'||mode==='week'?date:mode==='month'?month:'',
 }),[date,month,mode])
 const refresh=useCallback(async()=>{
  const request=++serial.current
  try{
   const [data,completed]=await Promise.all([fetchAccountingEntries(period),fetchAccountingPeriodSales(period)])
   if(request===serial.current){setEntries(data);setSales(completed);setError('')}
  }catch(e){
   if(request===serial.current){setSales(null);setError(e instanceof Error?e.message:'帳務與訂單統計暫時無法讀取')}
  }finally{if(request===serial.current)setLoading(false)}
 },[period])
 useEffect(()=>{
  setLoading(true);setError('');setEntries([]);setSales(null)
  void refresh()
  return()=>{serial.current++}
 },[refresh])
 const journalSummary=useMemo(()=>accountingSummary(entries),[entries])
 const summary=useMemo(()=>sales===null?null:mergedAccountingSummary(entries,sales),[entries,sales])
 const visible=useMemo(()=>entries.filter(row=>kindFilter==='all'||row.kind===kindFilter),[entries,kindFilter])
 // Poll aggregate results; staff may complete an order in another session.
 useEffect(()=>{
  const update=()=>{if(document.visibilityState==='visible'&&!busy)void refresh()}
  const timer=window.setInterval(update,30000)
  window.addEventListener('focus',update)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',update)}
 },[refresh,busy])

 function discardChanges():boolean{
  if(busy)return false
  return !dirty||window.confirm('目前的帳務內容尚未儲存，確定放棄變更？')
 }
 function resetForm(){
  setEditingId(null);setOriginal(null);setDraft(fresh())
 }
 function edit(entry:AccountingEntry){
  if(!discardChanges())return
  const record:AccountingInput={
   date:entry.date,kind:entry.kind,category:entry.category,
   amountGil:entry.amountGil,description:entry.description,reference:entry.reference,
   isAdditionalRevenue:entry.isAdditionalRevenue,payrollDistribution:entry.payrollDistribution,
   payrollRecipientId:entry.payrollRecipientId,
  }
  setEditingId(entry.id);setDraft(record);setOriginal({...record});setNotice('')
  if(window.matchMedia('(max-width:950px)').matches)
   requestAnimationFrame(()=>editor.current?.scrollIntoView({behavior:'smooth',block:'start'}))
 }
 function setField<K extends keyof AccountingInput>(key:K,value:AccountingInput[K]){
  setDraft(prev=>({...prev,[key]:value}))
 }
 function changeKind(value:AccountingKind){
  setDraft(prev=>({...prev,kind:value,category:categories[value][0],
   isAdditionalRevenue:value==='income',
   payrollDistribution:value==='income'?'shared':'none',payrollRecipientId:null}))
 }
 function changePayDistribution(option:PayrollDistribution|'order_receipt'){
  setDraft(prev=>({
   ...prev,
   isAdditionalRevenue:option!=='order_receipt',
   payrollDistribution:option==='order_receipt'?'none':option,
   payrollRecipientId:option==='individual'?prev.payrollRecipientId:null,
  }))
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(busy)return
  const problem=validateAccountingInput(draft)
  if(problem){setError(problem);return}
  setBusy(true);setError('');setNotice('')
  try{
   await saveAccountingEntry(draft,editingId??undefined)
   await refresh()
   setPayrollRefreshKey(value=>value+1)
   resetForm()
   setNotice(draft.kind==='income'
    ?(draft.isAdditionalRevenue?
      (draft.payrollDistribution==='individual'?'額外營業額已保存，並納入指定員工的分薪。':
       draft.payrollDistribution==='shared'?'額外營業額已保存，並納入本期平均分薪。':
       '額外營業額已保存，這筆收入不列入員工分薪。'):
      '收款已紀錄，但屬於已計入的茶宴訂單，不再重複計入營業額與分薪。')
    :'支出已保存並更新帳務統計。')
  }catch(e){setError(e instanceof Error?e.message:'帳務儲存失敗')}
  finally{setBusy(false)}
 }
 async function remove(entry:AccountingEntry){
  if(busy||entry.reference.startsWith('PAYROLL:'))return
  if(!window.confirm('確定永久刪除 '+entry.date+' 的「'+entry.category+'」'+money(entry.amountGil)+'？\\n此操作無法復原，且會更新當週與當月統計。'))return
  setBusy(true);setError('');setNotice('')
  try{
   await deleteAccountingEntry(entry.id)
   await refresh()
   setPayrollRefreshKey(value=>value+1)
   if(editingId===entry.id)resetForm()
   setNotice('帳務紀錄已刪除。')
  }catch(e){setError(e instanceof Error?e.message:'刪除未成功')}
  finally{setBusy(false)}
 }
 return <section className="accounting-admin admin-page">
  <header className="accounting-admin-header">
   <div><p className="eyebrow">KOGAKURE · LEDGER</p><h1>帳務管理</h1>
    <p>以 Gil 記錄館內實際收付，並連動已完成茶宴訂單試算每日營業額及員工平均分薪。</p></div>
   <div className="accounting-header-actions">
    <button type="button" disabled={busy||loading} onClick={()=>{setLoading(true);void refresh();setPayrollRefreshKey(x=>x+1)}}><RefreshCw size={16}/>重新整理</button>
   </div>
  </header>
  <p className="accounting-admin-tip"><Wallet size={18}/>僅正式管理員及獲授「帳務管理」權限的館員可存取帳務。茶宴「已完成」不代表已收款；請於實際收到 Gil 後登錄收入，支出也請逐筆記錄。</p>
  <div className="accounting-period" aria-label="帳務日期範圍">
   <div className="accounting-period-modes">
    <button type="button" aria-pressed={mode==='day'} className={mode==='day'?'is-active':''} onClick={()=>setMode('day')}>單日</button>
    <button type="button" aria-pressed={mode==='week'} className={mode==='week'?'is-active':''} onClick={()=>setMode('week')}>當週</button>
    <button type="button" aria-pressed={mode==='month'} className={mode==='month'?'is-active':''} onClick={()=>setMode('month')}>月份</button>
    <button type="button" aria-pressed={mode==='all'} className={mode==='all'?'is-active':''} onClick={()=>setMode('all')}>全部紀錄</button>
   </div>
   <label><CalendarDays size={17}/>
    {(mode==='day'||mode==='week')?<input type="date" aria-label={mode==='week'?'選擇帳務週別':'選擇帳務日期'} value={date} onChange={e=>{if(validVenueDate(e.target.value))setDate(e.target.value)}}/>:
     mode==='month'?<input type="month" aria-label="選擇帳務月份" value={month} onChange={e=>{if(validVenueMonth(e.target.value))setMonth(e.target.value)}}/>:
     <span>所有登錄日期</span>}
   </label>
   {mode==='week'&&<small className="accounting-period-week-label">當週：{venueWeekRange(date).start} 至 {shiftVenueDate(venueWeekRange(date).end,-1)}（週一至週日）</small>}
   <button type="button" onClick={()=>{const today=venueDate();setDate(today);setMonth(today.slice(0,7));setMode('day')}}>查看今日</button>
  </div>
  <div className="accounting-summary" aria-label="帳務收支與已完成茶宴統計" aria-busy={loading}>
   <div><span><ArrowDownLeft size={17}/>營業收入（試算）</span><strong>{summary?money(summary.income):loading?'讀取中…':'—'}</strong>
    <small>已完成茶宴 {summary?money(summary.completedGil):'—'}＋其他收入 {summary?money(summary.otherIncome):'—'}</small></div>
   <div><span><ArrowUpRight size={17}/>支出（已登錄）</span><strong>{summary?money(summary.expense):loading?'讀取中…':'—'}</strong>
    <small>包含已確認發放的員工薪資</small></div>
   <div className={summary&&summary.balance<0?'is-negative':''}><span><Wallet size={17}/>營業結餘（試算）</span>
    <strong>{summary?(summary.balance<0?'-':'')+money(Math.abs(summary.balance)):loading?'讀取中…':'—'}</strong>
    <small>營業收入減已登錄支出，非實際現金餘額</small></div>
   <div><span>統計筆數</span><strong>{summary?summary.count+' 筆':loading?'讀取中…':'—'}</strong>
    <small>已完成茶宴 {summary?.completedCount??'—'} 筆＋帳務 {summary?.ledgerCount??'—'} 筆</small></div>
  </div>
  <p className="accounting-summary-footnote">依選定期間的訂單建立日期（台灣時間）統計「已完成」茶宴；待處理與已取消訂單不計入。<strong>完成訂單不代表已收款。</strong>已登錄實收 {money(journalSummary.income)}，只有標記為「訂單收款」的手動收入不重複加進營業額。</p>
  {error&&<p role="alert" className="accounting-notice is-error"><TriangleAlert size={17}/>{error}</p>}
  {notice&&<p role="status" className="accounting-notice is-success"><CheckCircle2 size={17}/>{notice}</p>}
  <DailyPayrollSection selectedDate={mode==='day'||mode==='week'?date:venueDate()} refreshToken={payrollRefreshKey} onLedgerChanged={()=>{void refresh()}}/>
  <div className="accounting-workspace">
   <div className="accounting-list-panel">
    <div className="accounting-list-heading"><div><h2>收支紀錄</h2><small>手動收支 {visible.length} 筆{sales&&kindFilter!=='expense'?' · 已完成茶宴 '+sales.completedCount+' 筆':''}</small></div>
     <div className="accounting-kind-filter">
      <button type="button" className={kindFilter==='all'?'is-active':''} onClick={()=>setKindFilter('all')}>全部</button>
      <button type="button" className={kindFilter==='income'?'is-active':''} onClick={()=>setKindFilter('income')}>收入</button>
      <button type="button" className={kindFilter==='expense'?'is-active':''} onClick={()=>setKindFilter('expense')}>支出</button>
     </div>
    </div>
    {loading?<p className="accounting-empty" role="status">正在整理帳務資料…</p>:
     error&&!entries.length?<p className="accounting-empty">帳務資料未能載入，請重新整理。</p>:
     !visible.length&&(!sales?.completedCount||kindFilter==='expense')?<p className="accounting-empty">這個日期範圍目前沒有符合條件的收支紀錄。</p>:
     <div className="accounting-entry-list">
      {sales&&sales.completedCount>0&&kindFilter!=='expense'&&
       <article className="accounting-entry is-order-summary">
        <div className="accounting-entry-top"><div><span className="accounting-entry-kind">已完成茶宴 · 自動同步</span></div>
         <strong>＋{money(sales.completedGil)}</strong></div>
        <h3>已完成茶宴訂單彙總</h3>
        <p>所選日期範圍內共 {sales.completedCount} 筆已完成訂單，按訂單建立日期統計。此為營業額，並非實際收款紀錄。</p>
        <footer><small>訂單金額與狀態由茶宴訂單管理同步，無需重複登錄「茶宴收入」。</small></footer>
       </article>}
      {visible.map(entry=><article className="accounting-entry" key={entry.id}>
       <div className="accounting-entry-top"><div><span className={'accounting-entry-kind is-'+entry.kind}>{entry.kind==='income'?'收入':'支出'}</span><span className="accounting-entry-date">{entry.date}</span></div>
        <strong className={entry.kind==='expense'?'is-expense':''}>{entry.kind==='income'?'+':'−'}{money(entry.amountGil)}</strong>
       </div>
       <h3>{entry.category}</h3>
       {entry.description&&<p>{entry.description}</p>}
       {entry.reference&&<small>參考單號：{entry.reference}</small>}
       {entry.kind==='income'&&<small className="accounting-income-assignment">
        {entry.isAdditionalRevenue?'額外營業額 · ':'訂單收款（不重複計入營業額） · '}
        {entry.payrollDistribution==='shared'?'平均分薪':entry.payrollDistribution==='individual'
          ?'指定員工分薪：'+(payees.find(x=>x.id===entry.payrollRecipientId)?.name||'已指定員工')
          :'不納入分薪'}
       </small>}
       <footer><small>登錄時間 {timestamp(entry.createdAt)}</small>
        {entry.reference.startsWith('PAYROLL:')?
        <div className="accounting-paid-actions">
         <span className="accounting-payroll-locked"><CheckCircle2 size={15}/>已發薪 · 可修正與刪除</span>
         {parsePayrollReference(entry.reference)?(()=>{
          const ref=parsePayrollReference(entry.reference)!
          return <PaidPayrollRecordEditor key={entry.id}
           mode={ref.mode} date={ref.date} employeeId={ref.employeeId}
           employeeName={entry.description.replace(/^分薪紀錄(?:（.*?）)?：/u,'')||entry.category}
           amountGil={entry.amountGil} disabled={busy||loading}
           onChanged={()=>{void refresh();setPayrollRefreshKey(x=>x+1)}}/>
         })():<small>無法解析舊薪資參考編號，請至員工分薪管理處理。</small>}
        </div>:
        <div>
         <button type="button" disabled={busy} onClick={()=>edit(entry)}><FilePenLine size={15}/>編輯</button>
         <button type="button" disabled={busy} className="is-danger" aria-label={'刪除收支紀錄：'+entry.category+' '+entry.date} onClick={()=>void remove(entry)}><Trash2 size={15}/>刪除紀錄</button>
        </div>}
       </footer>
      </article>)}
     </div>}
   </div>
   <form className="accounting-editor" ref={editor} onSubmit={e=>void save(e)}>
    <div className="accounting-editor-heading"><div><p>KOGAKURE · JOURNAL</p><h2>{editingId?'修改收支紀錄':'新增收支紀錄'}</h2></div>
     {editingId&&<button type="button" onClick={()=>{if(discardChanges())resetForm()}} aria-label="取消修改"><X size={19}/></button>}
    </div>
    <fieldset disabled={busy} className="accounting-fields">
     <label>收支類型 <select value={draft.kind} onChange={e=>changeKind(e.target.value as AccountingKind)}>
      <option value="income">收入（實際收到 Gil）</option><option value="expense">支出（實際付出 Gil）</option>
     </select></label>
     <label>帳務日期 <input type="date" required value={draft.date} onChange={e=>setField('date',e.target.value)}/></label>
     <label>項目分類 <select value={categories[draft.kind].includes(draft.category)?draft.category:'__custom'} onChange={e=>{if(e.target.value!=='__custom')setField('category',e.target.value)}}>
      {categories[draft.kind].map(cat=><option key={cat} value={cat}>{cat}</option>)}
      {!categories[draft.kind].includes(draft.category)&&<option value="__custom">自訂分類</option>}
     </select></label>
     <label>分類名稱 <input required maxLength={48} value={draft.category} onChange={e=>setField('category',e.target.value)} placeholder="可自行輸入其他分類"/></label>
     <label>金額（Gil） <input type="number" required min={1} max={1000000000} step={1}
      value={draft.amountGil||''} onChange={e=>setField('amountGil',Number(e.target.value))}
      placeholder="輸入實際收付金額"/></label>
     {draft.kind==='income'&&<div className="accounting-payroll-setting">
      <label>這筆收入如何分薪？
       <select value={draft.isAdditionalRevenue?draft.payrollDistribution:'order_receipt'}
        onChange={e=>changePayDistribution(e.target.value as PayrollDistribution|'order_receipt')}>
        <option value="shared">平均分配給出勤員工（包含管理員）</option>
        <option value="individual">全額納入指定員工薪水</option>
        <option value="none">不納入員工分薪（仍計入營業額）</option>
        <option value="order_receipt">已完成茶宴的收款（不重複計入營業額）</option>
       </select>
      </label>
      {draft.isAdditionalRevenue&&draft.payrollDistribution==='individual'&&
       <label>指定員工／管理員
        <select value={draft.payrollRecipientId||''}
         onChange={e=>setField('payrollRecipientId',e.target.value||null)} required>
         <option value="">請選擇員工</option>
         {payees.map(person=><option key={person.id} value={person.id}>
          {person.name}{person.source==='owner'?'（婆婆／管理員）':''}
         </option>)}
        </select>
       </label>}
      {draft.isAdditionalRevenue&&draft.payrollDistribution==='individual'&&payeeError&&
       <small className="accounting-error" role="alert">{payeeError}</small>}
      {draft.isAdditionalRevenue&&draft.payrollDistribution==='individual'&&!payees.length&&!payeeError&&
       <small>目前沒有可指派的員工，請先建立員工帳號或登記管理員出勤。</small>}
     </div>}
     <label>備註 <textarea rows={3} maxLength={240} value={draft.description}
      onChange={e=>setField('description',e.target.value)} placeholder="例如：旅人餐費、員工薪酬、採買材料…"/></label>
     <label>參考單號（選填） <input maxLength={100} value={draft.reference}
      onChange={e=>setField('reference',e.target.value)} placeholder="可填茶宴訂單編號，便於對帳"/></label>
    </fieldset>
    <div className="accounting-editor-actions">
     <button type="button" disabled={busy} className="is-reset" onClick={()=>{if(discardChanges())resetForm()}}><Plus size={16}/>新紀錄</button>
     <button type="submit" disabled={busy||!!validateAccountingInput(draft)||!!error&&loading||editingId!==null&&!dirty}>
      <Save size={16}/>{busy?'儲存中…':editingId?'儲存修改':'新增收支'}
     </button>
    </div>
    <p className="accounting-editor-hint">手動收入預設計入營業額，可選平均分薪、指定員工或不分薪；已完成訂單的收款可在同一選單中標記以避免重複計算。未建立的分薪會重新試算，已發薪清單不自動變動。</p>
   </form>
  </div>
 </section>
}
