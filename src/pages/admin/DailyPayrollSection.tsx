import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {CalendarDays,CheckCircle2,ChevronLeft,ChevronRight,Coins,RefreshCw,UsersRound,Wallet} from 'lucide-react'
import {
 calculateEqualPayroll,confirmPayrollPaid,createDailyPayroll,
 fetchDailyPayrollReport,
} from '../../lib/daily-payroll'
import type {DailyPayrollReport,PayrollAllocation} from '../../lib/daily-payroll'
import {shiftVenueDate,validVenueDate,venueDate} from '../../lib/taipei-date'
import './daily-payroll.css'

const money=(v:number)=>v.toLocaleString('en-US')+' Gil'

/** This is a *financial preview* tied to a business date. Staff wages are
 * recorded as accounting expenses only after manual Gil payment confirmation. */
export default function DailyPayrollSection({
 selectedDate,refreshToken,onLedgerChanged,
}:{selectedDate:string;refreshToken:number;onLedgerChanged:()=>void}){
 const [date,setDate]=useState(selectedDate)
 const [data,setData]=useState<DailyPayrollReport|null>(null)
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const requestRef=useRef(0)
 useEffect(()=>{if(selectedDate)setDate(selectedDate)},[selectedDate])
 const load=useCallback(async()=>{
  const request=++requestRef.current
  try{
   const result=await fetchDailyPayrollReport(date)
   if(request===requestRef.current){setData(result);setError('')}
  }catch(e){
   if(request===requestRef.current){
    setData(null);setError(e instanceof Error?e.message:'當日營業額暫時無法讀取')
   }
  }finally{if(request===requestRef.current)setLoading(false)}
 },[date])
 useEffect(()=>{
  setLoading(true);setData(null);setError('');setNotice('')
  void load()
  return()=>{requestRef.current++}
 },[load,refreshToken])
 // A completed tea order can be updated from another employee's browser.
 // Keep the report fresh without remounting salary rows or blocking editing.
 useEffect(()=>{
  const update=()=>{if(document.visibilityState==='visible'&&!working)void load()}
  const timer=window.setInterval(update,30000)
  window.addEventListener('focus',update)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',update)}
 },[load,working])
 const preview=useMemo(()=>data?calculateEqualPayroll(data.revenueGil,data.roster):[],[data])
 const frozen=(data?.allocations.length??0)>0
 const paidCount=data?.allocations.filter(x=>x.paidAt!==null).length??0
 const paidTotal=data?.allocations.filter(x=>x.paidAt!==null).reduce((sum,x)=>sum+x.amountGil,0)??0
 const freezeTotal=data?.allocations[0]?.revenueGil??0
 const frozenMembers=data?.allocations[0]?.employeeCount??0
 const frozenMismatch=frozen&&data!==null&&(freezeTotal!==data.revenueGil||frozenMembers!==data.roster.length)

 async function create(){
  if(working||!data||frozen||!data.roster.length||data.revenueGil<=0)return
  if(!window.confirm(
   '確定依 '+date+' 已完成的茶宴訂單＋其他收入，共 '+money(data.revenueGil)+
   '，平均分配給 '+data.roster.length+' 位出勤人員？\n'+
   '建立後會固定當日分薪金額，不會因日後訂單或排班異動自動更改。'
  ))return
  setWorking(true);setError('');setNotice('')
  try{
   await createDailyPayroll(date)
   await load()
   setNotice('已建立並固定當日分薪清單。請在遊戲內實際交付 Gil 後逐筆確認發薪。')
  }catch(e){setError(e instanceof Error?e.message:'無法建立分薪清單')}
  finally{setWorking(false)}
 }
 async function pay(member:PayrollAllocation){
  if(working||member.paidAt)return
  if(!window.confirm(
   '請確認已在 FFXIV 遊戲內實際交付 '+member.name+'：'+money(member.amountGil)+'。\n'+
   '確認後會產生「員工薪酬」支出紀錄，無法重複登錄。'
  ))return
  setWorking(true);setError('');setNotice('')
  try{
   await confirmPayrollPaid(date,member.id)
   await load()
   onLedgerChanged()
   setNotice('已記錄 '+member.name+' 的薪水發放，對應金額已同步列入帳務支出。')
  }catch(e){setError(e instanceof Error?e.message:'發薪紀錄未更新')}
  finally{setWorking(false)}
 }

 return <section className="daily-payroll" aria-label="當日營業額與員工分薪">
  <header className="daily-payroll-header">
   <div><p>KOGAKURE · DAY BOOK & PAYROLL</p><h2>當日營業額・員工分薪</h2>
    <small>以完成訂單統計茶宴業績，依當日員工及婆婆／管理員出勤平均分配 Gil。</small></div>
   <div className="daily-payroll-date">
    <button type="button" aria-label="分薪日期前一天" disabled={working} onClick={()=>setDate(x=>shiftVenueDate(x,-1))}><ChevronLeft size={18}/></button>
    <label><CalendarDays size={17}/><input type="date" aria-label="選擇當日營業額與分薪日期"
     value={date} disabled={working} min="2020-01-01" max="2100-12-31"
     onChange={e=>{if(validVenueDate(e.target.value))setDate(e.target.value)}}/></label>
    <button type="button" aria-label="分薪日期後一天" disabled={working} onClick={()=>setDate(x=>shiftVenueDate(x,1))}><ChevronRight size={18}/></button>
    <button type="button" disabled={working} onClick={()=>setDate(venueDate())}>今日</button>
    <button type="button" disabled={loading||working} aria-label="重新整理營收分薪" onClick={()=>{setLoading(true);void load()}}><RefreshCw size={16}/></button>
   </div>
  </header>
  <p className="daily-payroll-explain">
   營業額試算＝當日建立且「已完成」的茶宴訂單＋其他已登錄收入（不重複計入手動登錄的「茶宴收入」）。<strong>完成訂單不代表已實收 Gil</strong>，實收仍以帳務明細為準。
  </p>
  {error&&<p role="alert" className="daily-payroll-message is-error">{error}</p>}
  {notice&&<p role="status" className="daily-payroll-message is-success"><CheckCircle2 size={16}/>{notice}</p>}
  {loading&&!data?<p className="daily-payroll-loading" role="status">正在核對當日訂單、帳務與員工排班…</p>:
   data&&<>
    <div className="daily-payroll-metrics">
     <div><small>已完成茶宴 · {data.sales.completedCount} 筆</small><strong>{money(data.sales.completedGil)}</strong></div>
     <div><small>其他已登錄收入</small><strong>{money(data.manualOtherIncomeGil)}</strong></div>
     <div className="is-total"><small><Coins size={17}/>當日總營業額（試算）</small><strong>{money(data.revenueGil)}</strong></div>
     <div><small>帳務已登錄收入（實收紀錄）</small><strong>{money(data.manualReceiptGil)}</strong></div>
    </div>
    <div className="daily-payroll-roster-heading">
     <div><h3><UsersRound size={18}/>當日出勤人員薪資分配</h3>
      <p>{frozen?'當日分薪清單已建立，金額為建立當時的固定快照。':'依當日「值班排班」登記的員工與婆婆／管理員平均分配；同一帳號只計算一次。'}</p>
     </div>
     {!frozen&&<button type="button" className="is-create"
      disabled={working||loading||!preview.length||!data.revenueGil}
      onClick={()=>void create()}><Wallet size={16}/>建立當日分薪清單</button>}
    </div>
    {frozen&&<div className="daily-payroll-snapshot" role="status">
     <span>固定分薪基數：{money(freezeTotal)} · {frozenMembers} 位員工</span>
     <span>已發薪：{paidCount}/{data.allocations.length} 人 · {money(paidTotal)}</span>
    </div>}
    {frozenMismatch&&<p className="daily-payroll-message is-warning">當前訂單金額或排班人數與建立清單時不同。已建立的薪資不會自動重算，以免有人已領薪後金額改變。</p>}
    {!data.roster.length&&!frozen?<p className="daily-payroll-no-staff">此日期尚無員工或管理員出勤紀錄。請先在「值班排班」確認當日出勤人員，再建立分薪清單。</p>:
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
       </div>
      })}
     </div>}
    {!frozen&&preview.length>0&&<p className="daily-payroll-footnote">分配總額 {money(preview.reduce((sum,x)=>sum+x.amountGil,0))}，平均分給 {preview.length} 位出勤人員；無法整除時，尾數依名單順序逐人補 1 Gil，總額不遺失。</p>}
    <p className="daily-payroll-footnote">
     「建立清單」不會發送遊戲貨幣。只有在 FFXIV 實際交付薪水、按下「確認已發薪」後，才會同步產生一筆帳務支出；薪資支出不會再計入營業額。
    </p>
   </>}
 </section>
}
