import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {CalendarDays,CheckCircle2,ChevronLeft,ChevronRight,RefreshCw,RotateCcw,Trash2,UsersRound,Wallet} from 'lucide-react'
import {
 calculateEqualPayroll,confirmPeriodPayrollPaid,createPeriodPayroll,fetchPeriodPayrollReport,
 payrollPeriodWindow,recalculatePeriodPayroll,resetPeriodPayroll,fetchPaidPayrollAudit,
} from '../../lib/daily-payroll'
import type {PayrollAllocation,PayrollPeriodMode,PeriodPayrollReport,PaidPayrollAudit} from '../../lib/daily-payroll'
import PaidPayrollRecordEditor from './PaidPayrollRecordEditor'
import {shiftVenueDate,validVenueDate,validVenueMonth,venueDate} from '../../lib/taipei-date'
import './daily-payroll.css'

const money=(v:number)=>v.toLocaleString('en-US')+' Gil'
const modeName:Record<PayrollPeriodMode,string>={day:'當日',week:'當週',month:'當月'}
const label=(mode:PayrollPeriodMode,start:string,end:string)=>
 mode==='day'?start:mode==='month'?start.slice(0,7)+' 月':
 start+' ～ '+shiftVenueDate(end,-1)

/** An immutable period payroll. Preview is live; creating fixes a snapshot.
 * Confirming a payment records actual Gil given in-game, never sends Gil. */
export default function DailyPayrollSection({
 selectedDate,refreshToken,onLedgerChanged,
}:{selectedDate:string;refreshToken:number;onLedgerChanged:()=>void}){
 const [mode,setMode]=useState<PayrollPeriodMode>('day')
 const [date,setDate]=useState(selectedDate)
 const [data,setData]=useState<PeriodPayrollReport|null>(null)
 const [audit,setAudit]=useState<PaidPayrollAudit[]>([])
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const requestRef=useRef(0)
 useEffect(()=>{if(selectedDate)setDate(selectedDate)},[selectedDate])
 const range=useMemo(()=>payrollPeriodWindow(mode,date),[mode,date])
 const currentLabel=label(mode,range.start,range.end)
 const load=useCallback(async()=>{
  const request=++requestRef.current
  try{
   const [next,history]=await Promise.all([fetchPeriodPayrollReport(mode,date),fetchPaidPayrollAudit(mode,date)])
   if(request===requestRef.current){setData(next);setAudit(history);setError('')}
  }catch(e){
   if(request===requestRef.current){
    setData(null);setAudit([]);setError(e instanceof Error?e.message:'此期間營業額暫時無法讀取')
   }
  }finally{if(request===requestRef.current)setLoading(false)}
 },[mode,date])
 useEffect(()=>{
  setLoading(true);setData(null);setAudit([]);setError('');setNotice('')
  void load()
  return()=>{requestRef.current++}
 },[load,refreshToken])
 useEffect(()=>{
  const update=()=>{if(document.visibilityState==='visible'&&!working)void load()}
  const timer=window.setInterval(update,30000)
  window.addEventListener('focus',update)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',update)}
 },[load,working])
 const preview=useMemo(()=>data?calculateEqualPayroll(data.revenueGil,data.roster):[],[data])
 const frozen=(data?.allocations.length??0)>0
 const blocked=!frozen&&(data?.overlaps.length??0)>0
 const paidCount=data?.allocations.filter(x=>x.paidAt!==null).length??0
 const paidTotal=data?.allocations.filter(x=>x.paidAt!==null).reduce((sum,x)=>sum+x.amountGil,0)??0
 const freezeTotal=data?.allocations[0]?.revenueGil??0
 const frozenMembers=data?.allocations[0]?.employeeCount??0
 const frozenMismatch=frozen&&data!==null&&(freezeTotal!==data.revenueGil||frozenMembers!==data.roster.length)
 const resettable=frozen&&data!==null&&data.allocations.every(person=>
  person.paidAt===null&&person.accountingEntryId===null)
 function movePeriod(direction:number){
  if(mode==='month'){
   const [year,month]=date.slice(0,7).split('-').map(Number)
   const value=new Date(Date.UTC(year,month-1+direction,15)).toISOString().slice(0,7)
   setDate(value+'-01')
  }else setDate(x=>shiftVenueDate(x,direction*(mode==='week'?7:1)))
 }
 async function create(){
  if(working||!data||frozen||blocked||!data.roster.length||data.revenueGil<=0)return
  if(!window.confirm(
   '確定依 '+currentLabel+' 已完成的茶宴訂單＋其他收入，共 '+money(data.revenueGil)+
   '，平均分配給 '+data.roster.length+' 位出勤人員？\n'+
   '建立後會固定該期間的分薪，與其他已分薪日期重疊時不能再分薪。'
  ))return
  setWorking(true);setError('');setNotice('')
  try{
   await createPeriodPayroll(mode,date)
   await load()
   setNotice('已建立'+modeName[mode]+'分薪清單，請於遊戲內實際交付 Gil 後逐筆確認發薪。')
  }catch(e){setError(e instanceof Error?e.message:'無法建立分薪清單')}
  finally{setWorking(false)}
 }
 async function changeSnapshot(action:'reset'|'recalculate'){
  if(working||!resettable||!data)return
  const question=action==='reset'
   ?'確定重置 '+currentLabel+' 的未發薪清單？\\n這會移除該期間已建立的分配名單，但不會刪除茶宴訂單或一般帳務。重置後可重新建立。'
   :'確定重新計算 '+currentLabel+' 的薪資？\\n系統會依最新已完成訂單、其他收入及出勤人員，重新分配全部尚未發放的薪水。若重算失敗，原清單會保留。'
  if(!window.confirm(question))return
  setWorking(true);setError('');setNotice('')
  try{
   if(action==='reset')await resetPeriodPayroll(mode,date)
   else await recalculatePeriodPayroll(mode,date)
   await load()
   setNotice(action==='reset'
    ?'已重置此期間尚未發薪的清單，可重新建立分薪。'
    :'已依最新收入與出勤名單重新計算薪資，金額已更新。')
  }catch(e){setError(e instanceof Error?e.message:'分薪清單更新失敗')}
  finally{setWorking(false)}
 }
 async function pay(member:PayrollAllocation){
  if(working||member.paidAt)return
  if(!window.confirm(
   '請確認已在 FFXIV 遊戲內實際交付 '+member.name+'：'+money(member.amountGil)+'。\n'+
   '確認後會以實際發薪日期產生「員工薪酬」支出紀錄，無法重複登錄。'
  ))return
  setWorking(true);setError('');setNotice('')
  try{
   await confirmPeriodPayrollPaid(mode,date,member.id)
   await load()
   onLedgerChanged()
   setNotice('已記錄 '+member.name+' 的薪水發放，對應金額已同步列入帳務支出。')
  }catch(e){setError(e instanceof Error?e.message:'發薪紀錄未更新')}
  finally{setWorking(false)}
 }
 return <section className="daily-payroll" aria-label="員工分薪">
  <header className="daily-payroll-header">
   <div><p>KOGAKURE · STAFF PAYROLL</p><h2>員工分薪</h2>
    <small>可選當日、當週或當月分薪；依出勤人員（含婆婆／管理員出勤）平均分配 Gil。</small></div>
  </header>
  <div className="daily-payroll-period-toolbar">
   <div className="daily-payroll-period-modes" role="group" aria-label="選擇分薪週期">
    {(['day','week','month'] as const).map(value=><button key={value} type="button"
     aria-pressed={mode===value} className={mode===value?'is-active':''}
     disabled={working} onClick={()=>setMode(value)}>{modeName[value]}分薪</button>)}
   </div>
   <div className="daily-payroll-date">
    <button type="button" aria-label="上一個分薪期間" disabled={working} onClick={()=>movePeriod(-1)}><ChevronLeft size={18}/></button>
    <label><CalendarDays size={17}/>
     {mode==='month'?<input type="month" aria-label="選擇分薪月份"
       value={date.slice(0,7)} disabled={working}
       onChange={e=>{if(validVenueMonth(e.target.value))setDate(e.target.value+'-01')}}/>:
      <input type="date" aria-label={mode==='week'?'選擇當週分薪日期':'選擇當日營業額與分薪日期'}
       value={date} disabled={working} min="2020-01-01" max="2100-12-31"
       onChange={e=>{if(validVenueDate(e.target.value))setDate(e.target.value)}}/>}
    </label>
    <button type="button" aria-label="下一個分薪期間" disabled={working} onClick={()=>movePeriod(1)}><ChevronRight size={18}/></button>
    <button type="button" disabled={working} onClick={()=>setDate(venueDate())}>今日</button>
    <button type="button" disabled={loading||working} aria-label="重新整理營收分薪"
     onClick={()=>{setLoading(true);void load()}}><RefreshCw size={16}/></button>
   </div>
  </div>
  <p className="daily-payroll-period-caption">目前查看：<strong>{modeName[mode]} · {currentLabel}</strong>。當週為週一至週日；期間內每個出勤帳號只計算一次。</p>
  <p className="daily-payroll-explain">分薪依所選期間已完成茶宴訂單與其他已登錄收入計算；<strong>訂單完成不代表已實際收款</strong>，請核對後建立清單。</p>
  {error&&<p role="alert" className="daily-payroll-message is-error">{error}</p>}
  {notice&&<p role="status" className="daily-payroll-message is-success"><CheckCircle2 size={16}/>{notice}</p>}
  {loading&&!data?<p className="daily-payroll-loading" role="status">正在核對所選期間訂單、帳務與員工排班…</p>:
   data&&<>
    <p className="daily-payroll-salary-basis">本期分薪基準 <strong>{money(data.revenueGil)}</strong> · {data.sales.completedCount} 筆已完成茶宴 · {data.roster.length} 位出勤人員（試算）</p>
    <div className="daily-payroll-roster-heading">
     <div><h3><UsersRound size={18}/>出勤人員薪資分配</h3>
      <p>{frozen?'該期間分薪清單已建立，金額為建立當時的固定快照。':'依所選期間的「值班排班」登記員工與婆婆／管理員出勤平均分配，同一帳號只計算一次。'}</p>
     </div>
     {!frozen&&<button type="button" className="is-create"
      disabled={working||loading||blocked||!preview.length||!data.revenueGil}
      onClick={()=>void create()}><Wallet size={16}/>建立{modeName[mode]}分薪清單</button>}
     {frozen&&<div className="daily-payroll-reset-actions">
      <button type="button" className="is-recalculate" disabled={working||loading||!resettable}
       onClick={()=>void changeSnapshot('recalculate')}><RotateCcw size={16}/>重新計算薪資</button>
      <button type="button" className="is-reset" disabled={working||loading||!resettable}
       onClick={()=>void changeSnapshot('reset')}><Trash2 size={16}/>重置分薪清單</button>
     </div>}
    </div>
    {frozen&&!resettable&&<p className="daily-payroll-message is-warning">此分薪清單已有薪水確認發放，不能重置或重算，以避免修改已交付的 Gil 與帳務支出。</p>}
    {blocked&&<p className="daily-payroll-message is-warning" role="alert">
     此期間與已建立的分薪紀錄重疊（{data.overlaps.map(item=>label(item.mode,item.start,item.end)+' '+modeName[item.mode]).join('、')}）。
     為避免重複發薪，不能再次建立涵蓋相同日期的薪資清單。可查看既有分薪期間。
    </p>}
    {frozen&&<div className="daily-payroll-snapshot" role="status">
     <span>固定分薪基數：{money(freezeTotal)} · {frozenMembers} 位出勤人員</span>
     <span>已發薪：{paidCount}/{data.allocations.length} 人 · {money(paidTotal)}</span>
    </div>}
    {frozenMismatch&&<p className="daily-payroll-message is-warning">當前營業額或出勤人數與建立清單時不同。已建立的薪資不會自動重算，以免已領薪金額改變。</p>}
    {!data.roster.length&&!frozen?<p className="daily-payroll-no-staff">此期間尚無員工或管理員出勤紀錄，請先登記值班排班。</p>:
     <div className="daily-payroll-members">
      {(frozen?data.allocations:preview).map((person,index)=>{
       const paid=frozen&&(person as PayrollAllocation).paidAt!==null
       return <div className="daily-payroll-member" key={person.id}>
        <div><span className="daily-payroll-member-number">{String(index+1).padStart(2,'0')}</span>
         <strong>{person.name}{person.source==='owner'&&<small>（婆婆／管理員）</small>}</strong></div>
        <strong className="daily-payroll-amount">{money(person.amountGil)}</strong>
        {frozen?<button type="button" className={paid?'is-paid':'is-pay'}
          disabled={working||paid} onClick={()=>void pay(person as PayrollAllocation)}>
          {paid?<><CheckCircle2 size={15}/>已發薪</>:<><Wallet size={15}/>確認已發薪</>}
         </button>:<span className="daily-payroll-pending">試算額</span>}
        {frozen&&paid&&<PaidPayrollRecordEditor
         mode={mode} date={date} employeeId={person.id} employeeName={person.name}
         amountGil={person.amountGil} disabled={working||loading}
         onChanged={()=>{void load();onLedgerChanged()}}/>}
       </div>
      })}
     </div>}
    {!frozen&&preview.length>0&&<p className="daily-payroll-footnote">分配總額 {money(preview.reduce((sum,x)=>sum+x.amountGil,0))}，平均分給 {preview.length} 位出勤人員；尾數依名單順序補 1 Gil。</p>}
    <p className="daily-payroll-footnote">「建立清單」不會發送遊戲貨幣。只有在 FFXIV 實際交付 Gil，並按下「確認已發薪」後，才會記入實際發薪日的帳務支出。已建立期間不可與其他分薪期間重疊。修改或刪除已發薪資料時，請核對實際支付情形並填寫原因。</p>
    {audit.length>0&&<section className="paid-payroll-history" aria-label="已發薪調整歷史">
     <h4>已發薪調整歷史 · {audit.length} 筆</h4>
     {audit.map(entry=><article key={entry.id} className="paid-payroll-history-row">
      <strong>{entry.action==='delete'?'刪除':'修改'} · {entry.employeeName} · {new Date(entry.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</strong>
      <span>{money(entry.previousGil)} {entry.action==='delete'?'→ 已刪除':('→ '+money(entry.updatedGil??0))}</span>
      <span>原因：{entry.reason}</span>
     </article>)}
    </section>}
   </>}
 </section>
}
