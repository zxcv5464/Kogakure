// Checks owner-only ledger permissions, date-scoped tea orders and safe Gil sums.
// Never writes to production, verifies SQL migration and frontend under offline preview.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'

const files=[
 'src/pages/admin/modules.ts','src/pages/AdminPage.tsx',
 'src/components/AdminLayout.tsx','src/pages/admin/OrdersManagement.tsx',
 'src/lib/tea-orders.ts','src/lib/taipei-date.ts',
 'src/lib/accounting.ts','src/pages/admin/AccountingManagement.tsx',
 'src/pages/admin/accounting-management.css',
 'supabase/migrations/20261115_16_accounting_ledger.sql',
 'scripts/prepare-pages.mjs',
]
const [modules,admin,layout,orders,tea,dateSource,accounting,dashboard,css,sql,pages]=
 await Promise.all(files.map(path=>readFile(path,'utf8')))
assert.ok(modules.includes("id: 'accounting'")&&modules.includes("title: '帳務管理'")&&
 modules.includes("status: 'available'")&&!modules.includes("title: '營業資訊'"),
 'Accounting must replace the old placeholder, not create a second planned module')
assert.ok(modules.includes("path: '/admin/accounting'")&&
 admin.includes('module="accounting"')&&admin.includes('<AccountingManagement/>')&&
 admin.includes("if(id==='accounts'||id==='services'||id==='accounting')return access.kind==='owner'"),
 'Accounting route must be owner-only even if an employee manages tea orders')
assert.ok(layout.includes("'/admin/accounting' ? '帳務管理'")&&
 pages.includes("'admin/accounting'"),
 'Direct GitHub Pages accounting route must load and display correct title')
assert.ok(orders.includes('type="date"')&&orders.includes('前一天')&&
 orders.includes('後一天')&&orders.includes('今日')&&orders.includes('最近 200 筆')&&
 orders.includes('setSelectedDate')&&orders.includes('setAllDates'),
 'Daily order screen should support full date picker, date navigation and recent history')
assert.ok(tea.includes('venueDayWindow(date)')&&
 tea.includes("request=request.gte('created_at',range.start).lt('created_at',range.end)")&&
 tea.includes(".limit(date?1000:200)"),
 'Daily orders must be queried by day on server, not filtered from the latest 200')
assert.ok(orders.includes('已完成訂單金額')&&orders.includes('不代表已收款'),
 'Order status must not be counted as confirmed Gil income')
assert.ok(dateSource.includes("timeZone:TAIPEI_TZ")&&dateSource.includes("Asia/Taipei"),
 'Local date must not use UTC day conversion around Taiwan midnight')
assert.ok(dashboard.includes('accountingSummary')&&dashboard.includes('saveAccountingEntry')&&
 dashboard.includes('deleteAccountingEntry')&&dashboard.includes('accountingCsv')&&
 dashboard.includes('input type="date"')&&dashboard.includes('input type="month"'),
 'Finance module must support CRUD, summary, daily/monthly filters and CSV')
assert.ok(css.includes('.accounting-summary')&&css.includes('@media(max-width:560px)'),
 'Ledger needs responsive dark-gold presentation')
for(const piece of [
 'create table if not exists public.accounting_entries',
 'alter table public.accounting_entries enable row level security',
 'revoke all on table public.accounting_entries from public,anon,authenticated',
 'grant select,delete on public.accounting_entries to authenticated',
 'grant update(entry_date,kind,category,amount_gil,description,reference)',
 'using ((select public.is_site_admin()))',
 'with check ((select public.is_site_admin()) and created_by=(select auth.uid()))',
 'amount_gil between 1 and 1000000000',
]){
 assert.ok(sql.includes(piece),'Owner-only ledger migration missing: '+piece)
}
assert.ok(!sql.includes('has_backoffice_permission(\'orders.manage\')')&&
 !sql.includes('grant select on public.accounting_entries to anon')&&
 !sql.includes('insert into public.accounting_entries')&&
 !sql.includes('update public.tea_orders'),
 'Ledger migration must not expose employee access, auto count receipts, or mutate existing orders')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const date=await vite.ssrLoadModule('/src/lib/taipei-date.ts')
 assert.equal(date.venueDate(new Date('2026-11-15T17:00:00Z')),'2026-11-16')
 assert.equal(date.shiftVenueDate('2026-12-31',1),'2027-01-01')
 assert.equal(date.shiftVenueDate('2026-01-01',-1),'2025-12-31')
 assert.equal(date.validVenueDate('2026-02-29'),false)
 assert.deepEqual(date.venueDayWindow('2026-11-15'),{
  start:'2026-11-15T00:00:00+08:00',
  end:'2026-11-16T00:00:00+08:00',
 })
 assert.deepEqual(date.venueMonthRange('2026-12'),{
  start:'2026-12-01',end:'2027-01-01',
 })
 const ledger=await vite.ssrLoadModule('/src/lib/accounting.ts')
 const example={id:'abc',date:'2026-11-15',category:'茶宴收入',
  kind:'income',amountGil:5000,description:'',reference:'=HYPERLINK("evil")',
  createdAt:'2026-11-15T12:00:00+08:00',updatedAt:'2026-11-15T12:00:00+08:00'}
 const expense={...example,id:'def',kind:'expense',amountGil:1200,category:'餐點材料'}
 const total=ledger.accountingSummary([example,expense])
 assert.deepEqual(total,{income:5000,expense:1200,balance:3800,count:2})
 assert.equal(ledger.validateAccountingInput({...example,amountGil:-1})!==null,true)
 assert.equal(ledger.validateAccountingInput({...example,amountGil:5000}),null)
 assert.ok(ledger.accountingCsv([example]).includes("'=HYPERLINK"),
  'CSV export must neutralize spreadsheet formulas in free-text columns')
 const {default:OrdersManagement}=await vite.ssrLoadModule('/src/pages/admin/OrdersManagement.tsx')
 const orderHtml=renderToStaticMarkup(createElement(OrdersManagement))
 assert.ok(orderHtml.includes('茶宴訂單管理')&&orderHtml.includes('營業日期')&&
 orderHtml.includes('選擇訂單營業日期')&&orderHtml.includes('最近 200 筆'))
 const {default:AccountingManagement}=await vite.ssrLoadModule('/src/pages/admin/AccountingManagement.tsx')
 const {AdminEditGuardProvider}=await vite.ssrLoadModule('/src/pages/admin/AdminEditGuard.tsx')
 const ui=renderToStaticMarkup(createElement(AdminEditGuardProvider,null,createElement(AccountingManagement)))
 assert.ok(ui.includes('帳務管理')&&ui.includes('新增收支紀錄')&&
 ui.includes('匯出 CSV')&&ui.includes('單日')&&ui.includes('月份'))
 console.log('PASS: owner-only finance ledger, 3 reporting periods, CSV safety, Gil totals and Taiwan-date tea order filtering')
}finally{await vite.close()}
