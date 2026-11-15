import {useState} from 'react'
import {FilePenLine,Save,Trash2,X} from 'lucide-react'
import {managePaidPayroll} from '../../lib/daily-payroll'
import type {PayrollPeriodMode} from '../../lib/daily-payroll'
import './paid-payroll-editor.css'

type Props={
 mode:PayrollPeriodMode;date:string;employeeId:string;employeeName:string
 amountGil:number;disabled?:boolean;onChanged:()=>void
}
const money=(n:number)=>n.toLocaleString('en-US')+' Gil'

/** Protected correction flow: paid expense and snapshot change together,
 * with an independent, permanent audit entry. No FFXIV Gil is sent/refunded. */
export default function PaidPayrollRecordEditor({
 mode,date,employeeId,employeeName,amountGil,disabled=false,onChanged,
}:Props){
 const [open,setOpen]=useState(false)
 const [amount,setAmount]=useState(String(amountGil))
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const value=Number(amount)
 const validAmount=/^\d+$/.test(amount)&&Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000
 const busy=disabled||working
 async function run(action:'edit'|'delete'){
  if(busy||action==='edit'&&(!validAmount||value===amountGil))return
  const confirmText=action==='edit'
   ?'確認更正 '+employeeName+' 已發薪金額：'+money(amountGil)+' → '+money(value)+'？\n系統會同步調整薪資與帳務，並自動保留操作歷史。此操作不會實際補發或收回 Gil。'
   :'確定刪除 '+employeeName+' 已發薪紀錄 '+money(amountGil)+'？\n對應員工薪酬支出將一併刪除，系統會保留操作歷史；不會退還遊戲內已交付的 Gil。'
  if(!window.confirm(confirmText))return
  setWorking(true);setError('');setSuccess('')
  try{
   await managePaidPayroll(mode,date,employeeId,action,action==='edit'?value:null)
   setOpen(false)
   setSuccess(action==='edit'?'薪資與帳務金額已校正':'已刪除薪資及對應帳務，保留調整歷史')
   onChanged()
  }catch(e){setError(e instanceof Error?e.message:'操作失敗，請重新整理後重試')}
  finally{setWorking(false)}
 }
 return <div className="paid-payroll-editor">
  <div className="paid-payroll-toolbar">
   <button type="button" disabled={busy} onClick={()=>{
    setOpen(v=>!v);setAmount(String(amountGil));setError('');setSuccess('')
   }} aria-expanded={open} aria-label={'修改或刪除已發薪：'+employeeName}>
    <FilePenLine size={15}/>修改／刪除已發薪</button>
  </div>
  {success&&<small className="paid-payroll-success">{success}</small>}
  {open&&<div className="paid-payroll-fields" role="group" aria-label={'已發薪資料調整 '+employeeName}>
   <strong>校正已發薪紀錄 · {employeeName}</strong>
   <label>修正後薪資（Gil）
    <input type="number" inputMode="numeric" min={0} max={1000000000} step={1}
     value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/>
   </label>
   <p>修改會同步調整帳務支出；刪除會移除這筆發薪及對應支出。無須填寫原因，系統仍會保留操作歷史，不會實際移轉 Gil。</p>
   {error&&<p className="paid-payroll-error" role="alert">{error}</p>}
   <div className="paid-payroll-actions">
    <button type="button" disabled={busy||!validAmount||value===amountGil}
     onClick={()=>void run('edit')}><Save size={15}/>儲存金額修改</button>
    <button type="button" className="is-delete" disabled={busy}
     onClick={()=>void run('delete')}><Trash2 size={15}/>刪除已發薪紀錄</button>
    <button type="button" disabled={busy} onClick={()=>setOpen(false)}><X size={15}/>取消</button>
   </div>
  </div>}
 </div>
}
