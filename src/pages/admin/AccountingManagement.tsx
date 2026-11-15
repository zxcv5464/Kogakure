import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {ArrowDownLeft,ArrowUpRight,CalendarDays,CheckCircle2,Download,FilePenLine,Plus,RefreshCw,Save,Trash2,TriangleAlert,Wallet,X} from 'lucide-react'
import {
 accountingCsv,accountingSummary,deleteAccountingEntry,fetchAccountingEntries,
 saveAccountingEntry,validateAccountingInput,
} from '../../lib/accounting'
import type {AccountingEntry,AccountingInput,AccountingKind,AccountingPeriod} from '../../lib/accounting'
import {validVenueDate,validVenueMonth,venueDate} from '../../lib/taipei-date'
import {useAdminEditGuard} from './AdminEditGuard'
import './accounting-management.css'

const categories:Record<AccountingKind,string[]>={
 income:['茶宴收入','湯浴收入','占卜收入','指名服務','共同小費','其他收入'],
 expense:['餐點材料','館內用品','員工薪酬','活動支出','場地費用','其他支出'],
}
const fresh=():AccountingInput=>({
 date:venueDate(),kind:'income',category:'茶宴收入',amountGil:0,
 description:'',reference:'',
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
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
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

 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 const period=useMemo<AccountingPeriod>(()=>({
  mode,value:mode==='day'?date:mode==='month'?month:'',
 }),[date,month,mode])
 const refresh=useCallback(async()=>{
  const request=++serial.current
  try{
   const data=await fetchAccountingEntries(period)
   if(request===serial.current){setEntries(data);setError('')}
  }catch(e){
   if(request===serial.current)setError(e instanceof Error?e.message:'帳務資料暫時無法讀取')
  }finally{if(request===serial.current)setLoading(false)}
 },[period])
 useEffect(()=>{
  setLoading(true);setError('');setEntries([])
  void refresh()
  return()=>{serial.current++}
 },[refresh])
 const summary=useMemo(()=>accountingSummary(entries),[entries])
 const visible=useMemo(()=>entries.filter(row=>kindFilter==='all'||row.kind===kindFilter),[entries,kindFilter])

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
  }
  setEditingId(entry.id);setDraft(record);setOriginal({...record});setNotice('')
  if(window.matchMedia('(max-width:950px)').matches)
   requestAnimationFrame(()=>editor.current?.scrollIntoView({behavior:'smooth',block:'start'}))
 }
 function setField<K extends keyof AccountingInput>(key:K,value:AccountingInput[K]){
  setDraft(prev=>({...prev,[key]:value}))
 }
 function changeKind(value:AccountingKind){
  setDraft(prev=>({...prev,kind:value,category:categories[value][0]}))
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
   resetForm()
   setNotice('帳務紀錄已儲存。收入與支出只根據正式登錄的 Gil 計算。')
  }catch(e){setError(e instanceof Error?e.message:'帳務儲存失敗')}
  finally{setBusy(false)}
 }
 async function remove(entry:AccountingEntry){
  if(busy||!window.confirm('確定永久刪除「'+entry.category+'」'+money(entry.amountGil)+'？此操作無法復原。'))return
  setBusy(true);setError('');setNotice('')
  try{
   await deleteAccountingEntry(entry.id)
   await refresh()
   if(editingId===entry.id)resetForm()
   setNotice('帳務紀錄已刪除。')
  }catch(e){setError(e instanceof Error?e.message:'刪除未成功')}
  finally{setBusy(false)}
 }
 function exportCsv(){
  if(!entries.length)return
  const filename='kogakure-accounting-'+(mode==='all'?'all':period.value)+'.csv'
  const url=URL.createObjectURL(new Blob([accountingCsv(entries)],{type:'text/csv;charset=utf-8'}))
  const a=document.createElement('a');a.href=url;a.download=filename
  document.body.appendChild(a);a.click();a.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),1500)
 }
 return <section className="accounting-admin admin-page">
  <header className="accounting-admin-header">
   <div><p className="eyebrow">KOGAKURE · LEDGER</p><h1>帳務管理</h1>
    <p>以 Gil 記錄館內實際收付，依月份或營業日期核對收入、支出與結餘。</p></div>
   <div className="accounting-header-actions">
    <button type="button" disabled={busy||loading} onClick={()=>{setLoading(true);void refresh()}}><RefreshCw size={16}/>重新整理</button>
    <button type="button" disabled={loading||!entries.length} onClick={exportCsv}><Download size={16}/>匯出 CSV</button>
   </div>
  </header>
  <p className="accounting-admin-tip"><Wallet size={18}/>僅正式管理員及獲授「帳務管理」權限的館員可存取帳務。茶宴「已完成」不代表已收款；請於實際收到 Gil 後登錄收入，支出也請逐筆記錄。</p>
  <div className="accounting-period" aria-label="帳務日期範圍">
   <div className="accounting-period-modes">
    <button type="button" aria-pressed={mode==='day'} className={mode==='day'?'is-active':''} onClick={()=>setMode('day')}>單日</button>
    <button type="button" aria-pressed={mode==='month'} className={mode==='month'?'is-active':''} onClick={()=>setMode('month')}>月份</button>
    <button type="button" aria-pressed={mode==='all'} className={mode==='all'?'is-active':''} onClick={()=>setMode('all')}>全部紀錄</button>
   </div>
   <label><CalendarDays size={17}/>
    {mode==='day'?<input type="date" aria-label="選擇帳務日期" value={date} onChange={e=>{if(validVenueDate(e.target.value))setDate(e.target.value)}}/>:
     mode==='month'?<input type="month" aria-label="選擇帳務月份" value={month} onChange={e=>{if(validVenueMonth(e.target.value))setMonth(e.target.value)}}/>:
     <span>所有登錄日期</span>}
   </label>
   <button type="button" onClick={()=>{const today=venueDate();setDate(today);setMonth(today.slice(0,7));setMode('day')}}>查看今日</button>
  </div>
  <div className="accounting-summary" aria-label="帳務收支統計">
   <div><span><ArrowDownLeft size={17}/>收入</span><strong>{money(summary.income)}</strong></div>
   <div><span><ArrowUpRight size={17}/>支出</span><strong>{money(summary.expense)}</strong></div>
   <div className={summary.balance<0?'is-negative':''}><span><Wallet size={17}/>結餘</span><strong>{summary.balance<0?'-':''}{money(Math.abs(summary.balance))}</strong></div>
   <div><span>明細筆數</span><strong>{summary.count} 筆</strong></div>
  </div>
  {error&&<p role="alert" className="accounting-notice is-error"><TriangleAlert size={17}/>{error}</p>}
  {notice&&<p role="status" className="accounting-notice is-success"><CheckCircle2 size={17}/>{notice}</p>}
  <div className="accounting-workspace">
   <div className="accounting-list-panel">
    <div className="accounting-list-heading"><div><h2>收支紀錄</h2><small>依日期由新至舊排列 · {visible.length} 筆</small></div>
     <div className="accounting-kind-filter">
      <button type="button" className={kindFilter==='all'?'is-active':''} onClick={()=>setKindFilter('all')}>全部</button>
      <button type="button" className={kindFilter==='income'?'is-active':''} onClick={()=>setKindFilter('income')}>收入</button>
      <button type="button" className={kindFilter==='expense'?'is-active':''} onClick={()=>setKindFilter('expense')}>支出</button>
     </div>
    </div>
    {loading?<p className="accounting-empty" role="status">正在整理帳務資料…</p>:
     error&&!entries.length?<p className="accounting-empty">帳務資料未能載入，請重新整理。</p>:
     !visible.length?<p className="accounting-empty">這個日期範圍目前沒有符合條件的收支紀錄。</p>:
     <div className="accounting-entry-list">
      {visible.map(entry=><article className="accounting-entry" key={entry.id}>
       <div className="accounting-entry-top"><div><span className={'accounting-entry-kind is-'+entry.kind}>{entry.kind==='income'?'收入':'支出'}</span><span className="accounting-entry-date">{entry.date}</span></div>
        <strong className={entry.kind==='expense'?'is-expense':''}>{entry.kind==='income'?'+':'−'}{money(entry.amountGil)}</strong>
       </div>
       <h3>{entry.category}</h3>
       {entry.description&&<p>{entry.description}</p>}
       {entry.reference&&<small>參考單號：{entry.reference}</small>}
       <footer><small>登錄時間 {timestamp(entry.createdAt)}</small>
        <div>
         <button type="button" disabled={busy} onClick={()=>edit(entry)}><FilePenLine size={15}/>編輯</button>
         <button type="button" disabled={busy} className="is-danger" onClick={()=>void remove(entry)}><Trash2 size={15}/>刪除</button>
        </div>
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
    <p className="accounting-editor-hint">金額請輸入正整數 Gil；儲存後才會計入帳務統計。新增、修改與刪除均需「帳務管理」權限。</p>
   </form>
  </div>
 </section>
}
