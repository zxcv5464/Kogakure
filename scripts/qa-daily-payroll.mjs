// Daily tea revenue + equal Gil payroll QA (read-only, no live orders edited).
// Protect orders' private guest details, snapshot salary amounts, and ensure
// each salary is booked as an expense only after confirming actual Gil payout.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'

const files=[
 'src/pages/admin/OrdersManagement.tsx',
 'src/pages/admin/AccountingManagement.tsx',
 'src/pages/admin/DailyPayrollSection.tsx',
 'src/lib/daily-payroll.ts',
 'src/pages/admin/daily-payroll.css',
 'src/pages/admin/accounting-management.css',
 'supabase/migrations/20261115_18_accounting_sales_payroll.sql',
]
const [orders,accounting,ui,helper,styles,ledgerStyles,sql]=
 await Promise.all(files.map(path=>readFile(path,'utf8')))
assert.ok(orders.includes("{id:'active',text:'待處理'}"),
 'Keep the existing pending+preparing queue')
assert.ok(!orders.includes("{id:'pending',text:'待接單'}")&&
 !orders.includes('<span>待接單</span>')&&
 !orders.includes("pending:'待接單'"),
 'Remove all redundant 待接單 filters and use 待處理 consistently')
assert.ok(orders.includes("filter==='active'?x.status==='pending'||x.status==='preparing'"),
 'Active queue must still contain pending and preparing orders')
assert.ok(accounting.includes('<DailyPayrollSection')&&
 accounting.includes("entry.reference.startsWith('PAYROLL:')"),
 'Accounting should display daily sales and protect paid-salary entries')
assert.ok(ui.includes('當日營業額・員工分薪')&&
 ui.includes('建立當日分薪清單')&&ui.includes('確認已發薪')&&
 ui.includes('其他已登錄收入')&&ui.includes('已完成茶宴')&&
 ui.includes('分薪清單'),
 'Expose calculations, immutable salary confirmation and revenue components')
assert.ok(ui.includes('window.confirm(')&&ui.includes('onLedgerChanged()'),
 'Confirmation must be explicit, with ledger refresh after payout')
assert.ok(helper.includes("rpc('get_accounting_daily_sales'")&&
 helper.includes("rpc('create_daily_payroll'")&&
 helper.includes("rpc('confirm_payroll_paid'"),
 'Use server RPCs for protected revenue aggregation, roster freeze and atomic payout')
assert.ok(helper.includes("from('shift_attendance')")&&
 !helper.includes("from('shift_owner_attendance')"),
 'Only scheduled employees, not owner shifts, share employee payroll')
assert.ok(helper.includes("x.category!=='茶宴收入'"),
 'Do not double-count manually recorded tea receipts')
assert.ok(styles.includes('.daily-payroll-metrics')&&
 styles.includes('@media(max-width:640px)')&&
 ledgerStyles.includes('.accounting-payroll-locked'),
 'Daily salary report should work on mobile and distinguish protected entries')
for(const token of [
 'create table if not exists public.payroll_allocations',
 'primary key(pay_date,employee_id)',
 'alter table public.payroll_allocations enable row level security',
 "has_backoffice_permission('accounting.manage')",
 "o.status='completed'",
 "o.created_at >= (p_day::timestamp at time zone 'Asia/Taipei')",
 "a.category<>'茶宴收入'",
 'from public.shift_attendance',
 'pg_catalog.pg_advisory_xact_lock',
 'row_number() over(order by s.employee_name,s.employee_id)',
 'v_sales/v_count',
 "raise exception '這筆薪資已標記發放",
 "insert into public.accounting_entries(",
 "p_day,'expense','員工薪酬'",
 'accounting_entry_id=v_expense_id',
 'protect_payroll_expense',
 'on delete restrict',
]){
 assert.ok(sql.includes(token),'Missing safety/audit mechanism: '+token)
}
assert.ok(!sql.includes('grant select on public.tea_orders')&&
 !sql.includes('grant insert on public.payroll_allocations')&&
 !sql.includes('grant execute on function private.create_daily_payroll(date) to anon')&&
 !sql.includes('delete from public.tea_orders'),
 'Finance staff must not access guest orders or directly insert payments')
assert.ok(sql.includes('security definer set search_path=')&&
 sql.includes('security invoker set search_path=')&&
 sql.includes('revoke all on function public.confirm_payroll_paid(date,uuid) from public,anon'),
 'Definer must remain in private schema with narrow authenticated RPC wrapper')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const payroll=await vite.ssrLoadModule('/src/lib/daily-payroll.ts')
 const employees=[
  {id:'02',name:'小紫'},{id:'03',name:'小狐'},{id:'01',name:'小月'},
 ]
 const sorted=[...employees].sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')||a.id.localeCompare(b.id))
 const allocation=payroll.calculateEqualPayroll(10001,employees)
 assert.deepEqual(allocation.map(x=>x.id),sorted.map(x=>x.id),
  'Equal-share distribution must keep deterministic member order')
 assert.equal(allocation.reduce((total,x)=>total+x.amountGil,0),10001)
 assert.deepEqual(allocation.map(x=>x.amountGil),[3334,3334,3333],
  'Uneven remainder gives the first few members 1 Gil, total stays exact')
 assert.deepEqual(payroll.calculateEqualPayroll(1,employees).map(x=>x.amountGil),[1,0,0],
  'Small totals must not lose fractional Gil or turn negative')
 assert.deepEqual(payroll.calculateEqualPayroll(17,[]),[])
 assert.equal(payroll.calculateEqualPayroll(9,[employees[0],employees[0]]).length,1,
  'Duplicate staff identities must not draw two shares')
 assert.throws(()=>payroll.calculateEqualPayroll(-1,employees))
 const entry=(kind,category,amountGil)=>({kind,category,amountGil})
 const ledger=[
  entry('income','茶宴收入',2000),
  entry('income','湯浴收入',3000),
  entry('income','其他收入',750),
  entry('expense','員工薪酬',1800),
 ]
 assert.equal(payroll.sumNonTeaIncome(ledger),3750)
 assert.equal(payroll.sumRecordedReceipts(ledger),5750)
 assert.equal(20000+payroll.sumNonTeaIncome(ledger),23750,
  'Daily gross should combine completed tea orders with other income, excluding duplicate tea receipts')
 const {default:OrdersManagement}=await vite.ssrLoadModule('/src/pages/admin/OrdersManagement.tsx')
 const orderHtml=renderToStaticMarkup(createElement(OrdersManagement))
 assert.ok(orderHtml.includes('茶宴訂單管理')&&orderHtml.includes('待處理')&&!orderHtml.includes('待接單'))
 const {default:AccountingManagement}=await vite.ssrLoadModule('/src/pages/admin/AccountingManagement.tsx')
 const {AdminEditGuardProvider}=await vite.ssrLoadModule('/src/pages/admin/AdminEditGuard.tsx')
 const html=renderToStaticMarkup(createElement(AdminEditGuardProvider,null,createElement(AccountingManagement)))
 assert.ok(html.includes('帳務管理')&&html.includes('當日營業額・員工分薪')&&
 html.includes('選擇當日營業額與分薪日期'),
 'Dashboard must render a selectable daily payroll section even on first paint')
 console.log('PASS: unified 待處理, protected completed-tea gross, 100% equal Gil payroll, immutable payout and accounting integration')
}finally{await vite.close()}
