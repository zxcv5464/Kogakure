import {configured} from './config'
import {supabase} from './supabase'
import {shiftVenueDate,validVenueDate,venueMonthRange,venueWeekRange} from './taipei-date'
import {fetchAccountingEntries,fetchAccountingPeriodSales} from './accounting'
import type {AccountingEntry} from './accounting'

export type SalesSummary={completedCount:number;completedGil:number}
export type PayrollEmployee={id:string;name:string;source?:'employee'|'owner';sortIndex?:number}
export type PayrollShare=PayrollEmployee&{amountGil:number}
export type PayrollAllocation=PayrollShare&{
 date:string;revenueGil:number;employeeCount:number;paidAt:string|null
 accountingEntryId:string|null;createdAt:string
}
export type DailyPayrollReport={
 date:string;sales:SalesSummary;manualOtherIncomeGil:number;manualReceiptGil:number
 revenueGil:number;roster:PayrollEmployee[];allocations:PayrollAllocation[]
}

const db=()=>{
 if(!configured||!supabase)throw new Error('帳務資料庫尚未連線')
 return supabase
}
const dateCheck=(date:string)=>{
 if(!validVenueDate(date)||date<'2020-01-01'||date>'2100-12-31')
  throw new Error('請選擇有效的營業日期')
}
const gil=(value:unknown):number=>{
 const num=Number(value)
 if(!Number.isSafeInteger(num)||num<0)throw new Error('Gil 金額超出可統計範圍')
 return num
}

/** Accountants can see only aggregates, never guests' itemized order rows. */
export async function getDailyCompletedSales(date:string):Promise<SalesSummary>{
 dateCheck(date)
 const {data,error}=await db().rpc('get_accounting_daily_sales',{p_day:date})
 if(error)throw new Error(error.message||'無法取得已完成訂單營業額')
 const raw=Array.isArray(data)?data[0]:data
 if(!raw)throw new Error('已完成訂單資料沒有回應')
 return {completedCount:gil(raw.completed_orders),completedGil:gil(raw.total_gil)}
}

/** Pay all distinct staff and owner/admin users who signed up for this day. */
export async function fetchDailyPayrollRoster(date:string):Promise<PayrollEmployee[]>{
 dateCheck(date)
 // This permission-checked RPC returns both employee and owner attendance
 // even for historical dates that are no longer published on the public calendar.
 const {data,error}=await db().rpc('get_accounting_daily_payroll_roster',{p_day:date})
 if(error)throw new Error('讀取當日員工／管理員排班失敗：'+error.message)
 type PayrollRosterRow={employee_id:string;employee_name:string;member_type:'employee'|'owner';sort_index:number}
 return ((data||[]) as PayrollRosterRow[]).map(row=>({
  id:row.employee_id,name:row.employee_name,
  source:row.member_type==='owner'?'owner' as const:'employee' as const,
  sortIndex:Number(row.sort_index),
 }))
}
export async function fetchDailyPayrollAllocations(date:string):Promise<PayrollAllocation[]>{
 dateCheck(date)
 const {data,error}=await db().from('payroll_allocations')
  .select('pay_date,employee_id,employee_name,member_type,revenue_gil,employee_count,amount_gil,paid_at,accounting_entry_id,created_at')
  .eq('pay_date',date).order('employee_name',{ascending:true})
 if(error)throw new Error('讀取分薪紀錄失敗：'+error.message)
 return (data||[]).map(item=>({
  date:item.pay_date,id:item.employee_id,name:item.employee_name,
  source:item.member_type==='owner'?'owner':'employee',
  revenueGil:gil(item.revenue_gil),employeeCount:Number(item.employee_count),
  amountGil:gil(item.amount_gil),paidAt:item.paid_at,
  accountingEntryId:item.accounting_entry_id,createdAt:item.created_at,
 }))
}

/** Completed orders and ledger receipts are intentionally separate.
 * Exclude manually logged tea income from the calculated turnover to avoid
 * counting the same tea banquet twice. */
export function sumNonTeaIncome(entries:AccountingEntry[]):number{
 return entries.filter(x=>x.kind==='income'&&x.category!=='茶宴收入')
  .reduce((s,x)=>s+x.amountGil,0)
}
export function sumRecordedReceipts(entries:AccountingEntry[]):number{
 return entries.filter(x=>x.kind==='income').reduce((s,x)=>s+x.amountGil,0)
}
/** Distribute every whole Gil deterministically. If not divisible, the
 * remainder is given 1 Gil at a time in the same server-defined roster order. */
export function calculateEqualPayroll(totalGil:number,people:PayrollEmployee[]):PayrollShare[]{
 if(!Number.isSafeInteger(totalGil)||totalGil<0)throw new Error('營業額不是有效整數')
 const unique=new Map<string,PayrollEmployee>()
 for(const person of people){
  if(!unique.has(person.id))unique.set(person.id,person)
 }
 const sorted=[...unique.values()].sort((a,b)=>
  a.sortIndex!==undefined&&b.sortIndex!==undefined
   ? a.sortIndex-b.sortIndex
   : a.name.localeCompare(b.name,'zh-TW')||a.id.localeCompare(b.id))
 if(!sorted.length)return []
 const base=Math.floor(totalGil/sorted.length)
 const remainder=totalGil%sorted.length
 return sorted.map((person,index)=>({
  ...person,amountGil:base+(index<remainder?1:0),
 }))
}

export async function fetchDailyPayrollReport(date:string):Promise<DailyPayrollReport>{
 dateCheck(date)
 const [sales,ledger,roster,allocations]=await Promise.all([
  getDailyCompletedSales(date),
  fetchAccountingEntries({mode:'day',value:date}),
  fetchDailyPayrollRoster(date),
  fetchDailyPayrollAllocations(date),
 ])
 const manualOtherIncomeGil=sumNonTeaIncome(ledger)
 const revenueGil=sales.completedGil+manualOtherIncomeGil
 if(!Number.isSafeInteger(revenueGil))throw new Error('當日營業額超出可計算範圍')
 return {
  date,sales,manualOtherIncomeGil,
  manualReceiptGil:sumRecordedReceipts(ledger),revenueGil,
  roster,allocations,
 }
}
export async function createDailyPayroll(date:string):Promise<void>{
 dateCheck(date)
 const {data,error}=await db().rpc('create_daily_payroll',{p_day:date})
 if(error)throw new Error(error.message||'建立分薪清單失敗')
 if(!Number.isInteger(Number(data))||Number(data)<1)
  throw new Error('分薪名單未建立，請重新整理確認')
}
export async function confirmPayrollPaid(date:string,employeeId:string):Promise<void>{
 dateCheck(date)
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(employeeId))
  throw new Error('員工編號不正確')
 const {error}=await db().rpc('confirm_payroll_paid',{p_day:date,p_employee_id:employeeId})
 if(error)throw new Error(error.message||'標記發薪失敗')
}

/** Weekly periods are Monday–Sunday, monthly periods are calendar months.
 * Existing day payrolls remain immutable and reserve their dates. */
export type PayrollPeriodMode='day'|'week'|'month'
export type PayrollOverlap={mode:PayrollPeriodMode;start:string;end:string}
export type PeriodPayrollReport=DailyPayrollReport&{
 periodMode:PayrollPeriodMode;periodEnd:string;overlaps:PayrollOverlap[]
}
export function payrollPeriodWindow(mode:PayrollPeriodMode,date:string):{start:string;end:string}{
 dateCheck(date)
 if(mode==='day')return {start:date,end:shiftVenueDate(date,1)}
 if(mode==='week')return venueWeekRange(date)
 if(mode==='month')return venueMonthRange(date.slice(0,7))
 throw new Error('請選擇有效的分薪週期')
}
export async function fetchPeriodPayrollReport(mode:PayrollPeriodMode,date:string):Promise<PeriodPayrollReport>{
 const period=payrollPeriodWindow(mode,date)
 const accountingPeriod=mode==='month'?{mode,value:period.start.slice(0,7)}:{mode,value:date}
 const [sales,ledger,rosterResult,allocationResult,overlapResult]=await Promise.all([
  fetchAccountingPeriodSales(accountingPeriod),
  fetchAccountingEntries(accountingPeriod),
  db().rpc('get_accounting_payroll_period_roster',{p_mode:mode,p_anchor:date}),
  db().from('payroll_allocations')
   .select('pay_date,period_mode,period_end,employee_id,employee_name,member_type,revenue_gil,employee_count,amount_gil,paid_at,accounting_entry_id,created_at')
   .eq('pay_date',period.start).eq('period_mode',mode)
   .order('employee_name',{ascending:true}),
  db().from('payroll_allocations')
   .select('pay_date,period_mode,period_end')
   .lt('pay_date',period.end).gt('period_end',period.start)
   .limit(300),
 ])
 if(rosterResult.error)throw new Error('無法讀取出勤名單：'+rosterResult.error.message)
 if(allocationResult.error)throw new Error('無法讀取分薪清單：'+allocationResult.error.message)
 if(overlapResult.error)throw new Error('無法核對其他期間的分薪清單：'+overlapResult.error.message)
 type RosterRow={employee_id:string;employee_name:string;member_type:string;sort_index:number}
 type AllocationRow={pay_date:string;employee_id:string;employee_name:string;member_type:string;revenue_gil:number;employee_count:number;amount_gil:number;paid_at:string|null;accounting_entry_id:string|null;created_at:string}
 type OverlapRow={pay_date:string;period_end:string;period_mode:PayrollPeriodMode}
 const roster=((rosterResult.data||[]) as RosterRow[]).map(row=>({
  id:row.employee_id,name:row.employee_name,source:row.member_type==='owner'?'owner' as const:'employee' as const,
  sortIndex:Number(row.sort_index),
 }))
 const allocations=((allocationResult.data||[]) as AllocationRow[]).map(item=>({
  date:item.pay_date,id:item.employee_id,name:item.employee_name,source:item.member_type==='owner'?'owner' as const:'employee' as const,
  amountGil:gil(item.amount_gil),revenueGil:gil(item.revenue_gil),employeeCount:Number(item.employee_count),
  paidAt:item.paid_at,accountingEntryId:item.accounting_entry_id,createdAt:item.created_at,
 }))
 const found=new Map<string,PayrollOverlap>()
 for(const item of (overlapResult.data||[]) as OverlapRow[]){
  if(item.pay_date===period.start&&item.period_mode===mode)continue
  const key=item.period_mode+':'+item.pay_date
  found.set(key,{mode:item.period_mode,start:item.pay_date,end:item.period_end})
 }
 const manualOtherIncomeGil=sumNonTeaIncome(ledger)
 const revenueGil=sales.completedGil+manualOtherIncomeGil
 if(!Number.isSafeInteger(revenueGil))throw new Error('期間營業額超出可計算範圍')
 return {
  date:period.start,periodMode:mode,periodEnd:period.end,
  sales,manualOtherIncomeGil,manualReceiptGil:sumRecordedReceipts(ledger),revenueGil,
  roster,allocations,overlaps:[...found.values()].sort((a,b)=>a.start.localeCompare(b.start)),
 }
}
export async function createPeriodPayroll(mode:PayrollPeriodMode,date:string):Promise<void>{
 payrollPeriodWindow(mode,date)
 const {data,error}=await db().rpc('create_period_payroll',{p_mode:mode,p_anchor:date})
 if(error)throw new Error(error.message||'建立分薪清單失敗')
 if(!Number.isSafeInteger(Number(data))||Number(data)<1)
  throw new Error('分薪清單未建立，請重新整理核對')
}
export async function confirmPeriodPayrollPaid(mode:PayrollPeriodMode,date:string,employeeId:string):Promise<void>{
 payrollPeriodWindow(mode,date)
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(employeeId))
  throw new Error('員工編號不正確')
 const {error}=await db().rpc('confirm_period_payroll_paid',{
  p_mode:mode,p_anchor:date,p_employee_id:employeeId,
 })
 if(error)throw new Error(error.message||'登錄發薪失敗')
}

/** Manage a frozen salary snapshot only if no employee has been paid.
 * Recalculation happens transactionally in PostgreSQL; if income/roster
 * validation fails the old snapshot is preserved. */
export async function resetPeriodPayroll(mode:PayrollPeriodMode,date:string):Promise<void>{
 payrollPeriodWindow(mode,date)
 const {data,error}=await db().rpc('reset_period_payroll',{p_mode:mode,p_anchor:date})
 if(error)throw new Error(error.message||'重置分薪清單失敗')
 if(!Number.isSafeInteger(Number(data))||Number(data)<1)
  throw new Error('沒有可重置的分薪清單')
}
export async function recalculatePeriodPayroll(mode:PayrollPeriodMode,date:string):Promise<void>{
 payrollPeriodWindow(mode,date)
 const {data,error}=await db().rpc('recalculate_period_payroll',{p_mode:mode,p_anchor:date})
 if(error)throw new Error(error.message||'重新計算薪資失敗')
 if(!Number.isSafeInteger(Number(data))||Number(data)<1)
  throw new Error('重新計算未成功，原分薪清單應保持不變')
}
