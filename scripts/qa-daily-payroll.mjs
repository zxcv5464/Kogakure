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
 'supabase/migrations/20261115_21_owner_attendance_payroll.sql',
 'supabase/migrations/20261115_23_period_payroll.sql',
 'supabase/migrations/20261115_24_payroll_reset_recalculate.sql',
 'supabase/migrations/20261115_25_paid_payroll_corrections.sql',
 'src/pages/admin/PaidPayrollRecordEditor.tsx',
]
const [orders,accounting,ui,helper,styles,ledgerStyles,sql,ownerSql,periodSql,resetSql,correctionSql,paidEditor]=
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
assert.ok(ui.includes('<h2>員工分薪</h2>')&&
 !ui.includes('當日營業額・員工分薪')&&
 !ui.includes('daily-payroll-metrics')&&
 ui.includes('modeName[mode]')&&ui.includes('確認已發薪')&&
 ui.includes('其他已登錄收入')&&ui.includes('已完成茶宴')&&
 ui.includes('分薪清單'),
 'Expose calculations, immutable salary confirmation and revenue components')
assert.ok(ui.includes('window.confirm(')&&ui.includes('onLedgerChanged()'),
 'Confirmation must be explicit, with ledger refresh after payout')
assert.ok(helper.includes("rpc('get_accounting_daily_sales'")&&
 helper.includes("rpc('create_daily_payroll'")&&
 helper.includes("rpc('confirm_payroll_paid'"),
 'Use server RPCs for protected revenue aggregation, roster freeze and atomic payout')
assert.ok(helper.includes("rpc('get_accounting_daily_payroll_roster'")&&
 helper.includes("source:item.member_type==='owner'?'owner':'employee'"),
 'Both scheduled employees and owner attendance must be included in the shared payroll roster')
assert.ok(ownerSql.includes('from public.shift_attendance')&&
 ownerSql.includes('from public.shift_owner_attendance')&&
 ownerSql.includes('distinct on (c.employee_id)')&&
 ownerSql.includes('from private.accounting_payroll_roster(p_day)')&&
 ownerSql.includes('member_type')&&
 ownerSql.includes('sort_index'),
 'Payroll preview and frozen allocations must use the same deduplicated owner+employee roster')
assert.ok(helper.includes("x.category!=='茶宴收入'"),
 'Do not double-count manually recorded tea receipts')
assert.ok(ui.includes("week:'當週'")&&ui.includes("month:'當月'")&&
 helper.includes("rpc('create_period_payroll'")&&helper.includes("rpc('confirm_period_payroll_paid'")&&
 helper.includes('fetchPeriodPayrollReport')&&
 periodSql.includes('period_mode')&&periodSql.includes('pay_date < v_end')&&
 periodSql.includes('p.period_end > v_start')&&
 periodSql.includes('pg_catalog.pg_advisory_xact_lock')&&
 periodSql.includes('private.create_period_payroll')&&
 periodSql.includes('private.confirm_period_payroll_paid'),
 'Daily/week/month payroll requires server-side overlap validation, frozen shares and atomic payout')
assert.ok(ui.includes("changeSnapshot('reset')")&&
 ui.includes("changeSnapshot('recalculate')")&&
 ui.includes('person.paidAt===null&&person.accountingEntryId===null')&&
 helper.includes("rpc('reset_period_payroll'")&&
 helper.includes("rpc('recalculate_period_payroll'")&&
 resetSql.includes('private.manage_period_payroll_snapshot')&&
 resetSql.includes("p_action='recalculate'")&&
 resetSql.includes('p.paid_at is not null or p.accounting_entry_id is not null')&&
 resetSql.includes('return private.create_period_payroll(p_mode,p_anchor)')&&
 resetSql.includes('v_deleted<>v_total')&&
 resetSql.includes('pg_catalog.pg_advisory_xact_lock')&&
 !resetSql.includes('delete from public.accounting_entries'),
 'Reset and recalculate must be protected against paid snapshots and atomic with rollback')
assert.ok(accounting.includes('PaidPayrollRecordEditor')&&
 !accounting.includes('accounting-delete-manager')&&
 ui.includes('fetchPaidPayrollAudit')&&ui.includes('PaidPayrollRecordEditor')&&
 ui.includes('已發薪調整歷史')&&
 helper.includes("rpc('manage_paid_payroll'")&&
 helper.includes('parsePayrollReference')&&
 correctionSql.includes('public.payroll_correction_audit')&&
 correctionSql.includes("p_action='edit'")&&
 correctionSql.includes("p_action not in ('edit','delete')")&&
 correctionSql.includes('v_pay.paid_at is null')&&
 correctionSql.includes('delete from public.accounting_entries')&&
 correctionSql.includes('delete from public.payroll_allocations')&&
 correctionSql.includes('private.payroll_period_range(p_mode,p_anchor)')&&
 correctionSql.includes('pg_catalog.pg_advisory_xact_lock')&&
 correctionSql.includes('revoke all on function public.manage_paid_payroll')&&
 correctionSql.includes('to authenticated')&&
 paidEditor.includes('修改／刪除原因')&&paidEditor.includes("void run('delete')")&&
 paidEditor.includes("void run('edit')"),
 'Paid correction/delete requires reason, atomic ledger sync, and durable audit')
assert.ok(styles.includes('.daily-payroll-salary-basis')&&
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
 const withOwner=[
  {id:'owner',name:'婆婆',source:'owner',sortIndex:1},
  {id:'staff-a',name:'狐姬',source:'employee',sortIndex:2},
  {id:'staff-b',name:'狐月',source:'employee',sortIndex:3},
 ]
 const ownerShares=payroll.calculateEqualPayroll(10001,withOwner)
 assert.deepEqual(ownerShares.map(person=>person.amountGil),[3334,3334,3333],
  'Owner/admin shift must receive one equal wage share alongside staff')
 assert.equal(ownerShares[0].source,'owner','Keep owner role visible in payroll list')
 assert.equal(payroll.calculateEqualPayroll(10001,[...withOwner,withOwner[0]]).length,3,
  'Same owner account cannot be paid twice')
 assert.ok(ui.includes('婆婆／管理員出勤')&&ui.includes("person.source==='owner'"),
  'The payroll UI should identify owner/admin and explain that they share pay')
 assert.deepEqual(payroll.parsePayrollReference('PAYROLL:2026-11-15:50dc0795-9064-4969-8914-fcf5e224627d'),{
  mode:'day',date:'2026-11-15',employeeId:'50dc0795-9064-4969-8914-fcf5e224627d',
 })
 assert.deepEqual(payroll.parsePayrollReference('PAYROLL:week:2026-11-09:50dc0795-9064-4969-8914-fcf5e224627d'),{
  mode:'week',date:'2026-11-09',employeeId:'50dc0795-9064-4969-8914-fcf5e224627d',
 })
 assert.equal(payroll.parsePayrollReference('NOTPAYROLL:2026-11-15:x'),null)
 assert.deepEqual(payroll.payrollPeriodWindow('week','2026-11-15'),{start:'2026-11-09',end:'2026-11-16'})
 assert.deepEqual(payroll.payrollPeriodWindow('month','2026-11-15'),{start:'2026-11-01',end:'2026-12-01'})
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
 assert.ok(html.includes('帳務管理')&&html.includes('員工分薪')&&
 !html.includes('當日營業額・員工分薪')&&
 html.includes('選擇當日營業額與分薪日期'),
 'Dashboard must render a selectable daily payroll section even on first paint')
 console.log('PASS: salary corrections and deletion audited, inline ledger actions, safe unpaid reset and 3 periods')
}finally{await vite.close()}
