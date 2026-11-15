import {configured} from './config'
import {supabase} from './supabase'
import {shiftVenueDate,validVenueDate,validVenueMonth,venueMonthRange,venueWeekRange} from './taipei-date'

export type AccountingKind='income'|'expense'
export type PayrollDistribution='none'|'shared'|'individual'
export type AccountingPayee={id:string;name:string;source:'owner'|'employee'}
export type AccountingEntry={
 id:string;date:string;kind:AccountingKind;category:string;amountGil:number
 description:string;reference:string;isAdditionalRevenue:boolean
 payrollDistribution:PayrollDistribution;payrollRecipientId:string|null
 createdAt:string;updatedAt:string
}
export type AccountingInput=Omit<AccountingEntry,'id'|'createdAt'|'updatedAt'>
export type AccountingPeriod={mode:'day'|'week'|'month'|'all';value:string}
export type AccountingSalesSummary={completedCount:number;completedGil:number}
export type AccountingOverview={
 income:number;expense:number;balance:number;count:number
 completedCount:number;completedGil:number;otherIncome:number
 ledgerCount:number;recordedReceipts:number
}
type Row={
 id:string;entry_date:string;kind:AccountingKind;category:string
 amount_gil:number;description:string;reference:string
 is_additional_revenue:boolean;payroll_distribution:PayrollDistribution;payroll_recipient_id:string|null
 created_at:string;updated_at:string
}

const db=()=>{
 if(!configured||!supabase)throw new Error('帳務資料庫尚未連線')
 return supabase
}
export function validateAccountingInput(entry:AccountingInput):string|null{
 if(!validVenueDate(entry.date))return '請選擇有效的帳務日期'
 if(entry.kind!=='income'&&entry.kind!=='expense')return '請選擇收入或支出'
 if(entry.category.trim().length<1||entry.category.trim().length>48)return '項目分類請輸入 1～48 字'
 if(!Number.isSafeInteger(entry.amountGil)||entry.amountGil<1||entry.amountGil>1_000_000_000)
  return 'Gil 金額需為 1～1,000,000,000 的整數'
 if(entry.description.length>240)return '備註最多 240 字'
 if(entry.reference.length>100)return '參考單號最多 100 字'
 if(typeof entry.isAdditionalRevenue!=='boolean')return '請確認此收入是否為額外營業額'
 if(!['none','shared','individual'].includes(entry.payrollDistribution))return '請選擇收入分薪方式'
 if(entry.kind==='income'&&entry.isAdditionalRevenue&&entry.payrollDistribution==='individual'&&
  !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.payrollRecipientId??''))
  return '指定個別員工分薪時，請選擇有效員工'
 if(entry.kind==='income'&&!entry.isAdditionalRevenue&&entry.payrollDistribution!=='none')
  return '已計入茶宴訂單的收款不得再次分薪'
 return null
}
const rowToEntry=(row:Row):AccountingEntry=>({
 id:row.id,date:row.entry_date,kind:row.kind,category:row.category,
 amountGil:Number(row.amount_gil),description:row.description,
 reference:row.reference,isAdditionalRevenue:row.is_additional_revenue,
 payrollDistribution:row.payroll_distribution,payrollRecipientId:row.payroll_recipient_id,
 createdAt:row.created_at,updatedAt:row.updated_at,
})
function scopedRows(period:AccountingPeriod){
 if((period.mode==='day'||period.mode==='week')&&!validVenueDate(period.value))throw new Error('日期格式不正確')
 if(period.mode==='month'&&!validVenueMonth(period.value))throw new Error('月份格式不正確')
 return period.mode==='month'?venueMonthRange(period.value):period.mode==='week'?venueWeekRange(period.value):null
}
export async function fetchAccountingEntries(period:AccountingPeriod):Promise<AccountingEntry[]>{
 const month=scopedRows(period)
 const pageSize=500
 const rows:Row[]=[]
 // Traverse actual journal entries so the total is not silently limited to
 // the PostgREST maximum or whichever records loaded most recently.
 for(let offset=0;offset<10_000;offset+=pageSize){
  let request=db().from('accounting_entries')
   .select('id,entry_date,kind,category,amount_gil,description,reference,is_additional_revenue,payroll_distribution,payroll_recipient_id,created_at,updated_at')
  if(period.mode==='day')request=request.eq('entry_date',period.value)
  if(month)request=request.gte('entry_date',month.start).lt('entry_date',month.end)
  const {data,error}=await request.order('entry_date',{ascending:false})
   .order('created_at',{ascending:false}).range(offset,offset+pageSize-1)
  if(error)throw new Error(error.message||'無法讀取帳務明細')
  rows.push(...(data as Row[]))
  if(!data||data.length<pageSize)return rows.map(rowToEntry)
 }
 throw new Error('帳務明細筆數超過單次處理上限，請改選月份或日期')
}
/** Return protected aggregate totals, not individual guest orders. */
export async function fetchAccountingPeriodSales(period:AccountingPeriod):Promise<AccountingSalesSummary>{
 const month=scopedRows(period)
 const start=period.mode==='day'?period.value:month?.start??null
 const end=period.mode==='day'?shiftVenueDate(period.value,1):month?.end??null
 const {data,error}=await db().rpc('get_accounting_period_sales',{p_start:start,p_end:end})
 if(error)throw new Error(error.message||'無法讀取已完成茶宴營業額')
 const row=Array.isArray(data)?data[0]:data
 if(!row)throw new Error('已完成訂單統計沒有回應')
 const completedCount=Number(row.completed_orders),completedGil=Number(row.total_gil)
 if(!Number.isSafeInteger(completedCount)||completedCount<0||
  !Number.isSafeInteger(completedGil)||completedGil<0)
  throw new Error('已完成訂單統計金額超出可處理範圍')
 return {completedCount,completedGil}
}
function payload(entry:AccountingInput){
 const problem=validateAccountingInput(entry)
 if(problem)throw new Error(problem)
 return {
  entry_date:entry.date,kind:entry.kind,category:entry.category.trim(),
  amount_gil:entry.amountGil,description:entry.description.trim(),
  reference:entry.reference.trim(),
  is_additional_revenue:entry.kind==='income'&&entry.isAdditionalRevenue,
  payroll_distribution:entry.kind==='income'&&entry.isAdditionalRevenue?entry.payrollDistribution:'none',
  payroll_recipient_id:entry.kind==='income'&&entry.isAdditionalRevenue&&entry.payrollDistribution==='individual'
   ?entry.payrollRecipientId:null,
 }
}
export async function saveAccountingEntry(entry:AccountingInput,id?:string):Promise<void>{
 const data=payload(entry)
 const request=id?db().from('accounting_entries').update(data).eq('id',id):
  db().from('accounting_entries').insert(data)
 const {data:result,error}=await request.select('id').single()
 if(error||!result)throw new Error(error?.message||'帳務儲存未成功，請重新整理確認')
}
export async function deleteAccountingEntry(id:string):Promise<void>{
 const {data,error}=await db().from('accounting_entries').delete().eq('id',id).select('id').single()
 if(error||!data)throw new Error(error?.message||'帳務刪除未成功，請重新整理確認')
}
export function accountingSummary(rows:AccountingEntry[]){
 const income=rows.filter(x=>x.kind==='income').reduce((s,x)=>s+x.amountGil,0)
 const expense=rows.filter(x=>x.kind==='expense').reduce((s,x)=>s+x.amountGil,0)
 return {income,expense,balance:income-expense,count:rows.length}
}
/** Operating turnover includes completed orders plus independently entered manual income.
 * Mark receipts for already-counted completed orders to avoid double counting. */
export function mergedAccountingSummary(rows:AccountingEntry[],sales:AccountingSalesSummary):AccountingOverview{
 const journal=accountingSummary(rows)
 const otherIncome=rows.filter(x=>x.kind==='income'&&x.isAdditionalRevenue)
  .reduce((sum,x)=>sum+x.amountGil,0)
 const income=sales.completedGil+otherIncome
 if(!Number.isSafeInteger(income)||!Number.isSafeInteger(income-journal.expense))
  throw new Error('帳務總額超出可計算範圍')
 return {income,expense:journal.expense,balance:income-journal.expense,
  count:journal.count+sales.completedCount,
  completedCount:sales.completedCount,completedGil:sales.completedGil,
  otherIncome,ledgerCount:journal.count,recordedReceipts:journal.income}
}
/** Prevent spreadsheet formula execution when an exported note starts with
 * =, +, -, @ or controls/whitespace before one of those characters. */
const csvCell=(value:string|number)=>{
 const raw=String(value)
 const safe=/^[\s\u0000-\u001f]*[=+\-@]/u.test(raw)?"'"+raw:raw
 return '"'+safe.replaceAll('"','""')+'"'
}
export function accountingCsv(rows:AccountingEntry[]):string{
 const headers=['日期','收支','分類','金額 Gil','備註','參考單號','建立時間']
 const lines=rows.map(x=>[
  x.date,x.kind==='income'?'收入':'支出',x.category,x.amountGil,
  x.description,x.reference,x.createdAt,
 ].map(csvCell).join(','))
 return '\ufeff'+[headers.map(csvCell).join(','),...lines].join('\r\n')
}

/** Payees are employee accounts and known owner/manager accounts, never guests. */
export async function fetchAccountingPayees():Promise<AccountingPayee[]>{
 const {data,error}=await db().rpc('get_accounting_payroll_payees')
 if(error)throw new Error(error.message||'無法讀取員工薪資名單')
 type PayeeRow={employee_id:string;employee_name:string;member_type:'owner'|'employee'}
 return ((data||[]) as PayeeRow[]).map(p=>({
  id:p.employee_id,name:p.employee_name,source:p.member_type==='owner'?'owner' as const:'employee' as const,
 }))
}
