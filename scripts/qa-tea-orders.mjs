import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'

const files=[
 'src/pages/MenuPage.tsx','src/pages/menu-page.css',
 'src/lib/tea-orders.ts','src/pages/admin/OrdersManagement.tsx',
 'src/pages/admin/OrderNotification.tsx','src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts','src/lib/employee-accounts.ts',
 'supabase/functions/manage-employee-accounts/index.ts',
 'supabase/migrations/20261115_05_tea_orders.sql',
 'scripts/prepare-pages.mjs',
]
const [menu,css,orders,admin,notification,adminShell,modules,permissions,edge,sql,pages]=
 await Promise.all(files.map(x=>readFile(x,'utf8')))

for(const part of [
 '旅人角色姓名', '所在伺服器', '請輸入角色姓名',
 '送出茶宴點單', 'setReceipt({id,name,world,items:snapshot,total})',
 'await submitTeaOrder(name,world,selected.map',
 'if(mode!==\'live\')', '訂單編號：', '等待館方確認',
 'menu_page_fake_check_not_present',
]){
 if(part==='menu_page_fake_check_not_present')continue
 assert.ok(menu.includes(part),'Guest order checkout missing: '+part)
}
assert.ok(menu.includes('複製點單'),'Original copy-order feature must remain')
assert.ok(menu.includes('tea-menu-clear'),'Original clear-selection feature must remain')
assert.ok(css.includes('.tea-menu-order-fields')&&css.includes('@media(max-width:600px)'),
 'Guest order checkout must support mobile layout')
for(const token of [
 "rpc('submit_tea_order'",'p_guest_name:name','p_guest_world:world',
 'p_items:items.map','countPendingTeaOrders','count:\'exact\'',
 "head:true", "eq('status','pending')", "watchTeaOrders",
 "rpc('advance_tea_order'","from('tea_orders')",
]){
 assert.ok(orders.includes(token),'Order data access missing '+token)
}
assert.ok(orders.includes(".limit(200)"),'Admin should cap fetched history')
assert.ok(admin.includes('接單 · 開始製作')&&admin.includes('完成訂單')&&admin.includes('取消訂單'),
 'Admin must support pending, preparing, completed, cancelled actions')
assert.ok(admin.includes('guestWorld')&&admin.includes('order.lines.map'),
 'Admin must show world, each item and receipt details')
assert.ok(notification.includes('usePendingTeaOrders(enabled:boolean)')&&notification.includes('9000'),
 'Sidebar needs exact count with realtime and polling fallback')
assert.ok(adminShell.includes("usePendingTeaOrders(allowed(access,'orders'))"),
 'Only staff with order permission may retrieve counts')
assert.ok(adminShell.includes("if(id==='orders')return permitted(access,'orders.manage')"),
 'Order route must require independent order permission')
assert.ok(adminShell.includes('module="orders"')&&adminShell.includes('<OrdersManagement/>'),
 'Order route must be guarded')
assert.ok(adminShell.includes('admin-nav-order-badge')&&adminShell.includes('pendingOrders'),
 'Admin navigation must display pending order badge')
assert.ok(modules.includes("id: 'orders'")&&pages.includes("'admin/orders'"),
 'Order module must have an entry and refresh-safe GitHub Pages route')
assert.ok(permissions.includes("id:'orders.manage'"),'Order operator permission missing')
assert.ok(edge.includes("'orders.manage'")&&edge.includes('value.length>4'),
 'Owner-only credential management must support the new module permission')

const rules=[
 'create table if not exists public.tea_orders',
 'create table if not exists public.tea_order_items',
 'alter table public.tea_orders enable row level security',
 'alter table public.tea_order_items enable row level security',
 'revoke all on public.tea_orders,public.tea_order_items from public,anon,authenticated',
 'grant select on public.tea_orders,public.tea_order_items to authenticated',
 "has_backoffice_permission('orders.manage')",
 'language plpgsql security definer set search_path=\'\'',
 'create or replace function private.submit_tea_order(',
 'create or replace function public.submit_tea_order(',
 'create or replace function private.advance_tea_order(',
 'create or replace function public.advance_tea_order(',
 'revoke all on function public.advance_tea_order(uuid,text) from public,anon',
 "grant execute on function public.advance_tea_order(uuid,text) to authenticated",
 'grant execute on function public.submit_tea_order(text,text,jsonb) to anon,authenticated',
 'pg_catalog.pg_advisory_xact_lock',
 "pg_catalog.jsonb_typeof(v_element->'quantity')<>'number'",
 'for share of i,c',
 'i.is_published=true and i.is_available=true',
 'c.is_published=true',
 'v_menu.price_gil::bigint*v_quantity::bigint',
 'v_menu.name,v_menu.price_gil',
 "v_old='pending' and p_next_status in ('preparing','cancelled')",
 "v_old='preparing' and p_next_status in ('completed','cancelled')",
 "and 'orders.manage'=any(e.permissions)",
]
for(const rule of rules)assert.ok(sql.includes(rule),'Secure order migration missing: '+rule)
assert.ok(!sql.includes('grant insert on public.tea_orders to anon'),
 'Visitor must not write any private order table directly')
assert.ok(!sql.includes('grant update on public.tea_orders to authenticated'),
 'Staff must not bypass validated status transitions')
assert.ok(!sql.includes('insert into public.admin_users'),
 'Orders must not modify manager membership')
assert.ok(!sql.includes('delete from public.booking_requests'),
 'Orders must not delete any bookings')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:MenuPage}=await vite.ssrLoadModule('/src/pages/MenuPage.tsx')
 const html=renderToStaticMarkup(createElement(MenuPage))
 assert.match(html,/旅人點單/)
 assert.match(html,/展示菜單/)
 assert.match(html,/複製點單|點選御品旁的/)
 assert.ok(!html.includes('送出訂單成功'),'SSR preview must never claim an order was placed')
 const {default:OrdersManagement}=await vite.ssrLoadModule('/src/pages/admin/OrdersManagement.tsx')
 assert.equal(typeof OrdersManagement,'function')
 const {permitted,EMPLOYEE_PERMISSIONS}=await vite.ssrLoadModule('/src/lib/employee-accounts.ts')
 assert.ok(EMPLOYEE_PERMISSIONS.some(x=>x.id==='orders.manage'))
 assert.equal(permitted({kind:'employee',active:true,permissions:['menu.manage']},'orders.manage'),false)
 assert.equal(permitted({kind:'employee',active:true,permissions:['orders.manage']},'orders.manage'),true)
 assert.equal(permitted({kind:'owner',permissions:[]},'orders.manage'),true)
 console.log('PASS: guest tea-order checkout, secured server-side totals, scoped order admin, exact badge and responsive UI')
}finally{await vite.close()}
