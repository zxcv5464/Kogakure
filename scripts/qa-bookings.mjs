// Regression checks for nomination booking front/back, price-free draft plans,
// and the security boundaries in the database migration.
// The test never contacts or modifies a live Supabase database.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const names=[
 'src/pages/BookingPage.tsx','src/pages/admin/BookingManagement.tsx',
 'src/pages/admin/BookingNotification.tsx','src/lib/bookings.ts',
 'src/components/PageTransition.tsx','src/App.tsx',
 'src/pages/admin/modules.ts','supabase/migrations/20261114_01_booking.sql',
 'scripts/prepare-pages.mjs',
]
const texts=await Promise.all(names.map(f=>readFile(f,'utf8')))
const [page,admin,notice,api,transition,app,modules,sql,build]=texts
assert.ok(page.includes('setPeople(staff.filter(p=>p.published&&p.bookingVisible))'), 'Booking gallery must use visibility flags regardless of role')
for (const phrase of ['空閒中','指名中','預約者遊戲角色姓名','所在伺服器','指名方案','是否同時指名其他狐姬','送出預約申請'])
 assert.ok(page.includes(phrase),'Booking form missing '+phrase)
for (const phrase of ['接取','婉拒','結束服務','同步倒數','剩餘','方案已儲存','待審核'])
 assert.ok(admin.includes(phrase),'Admin workflow missing '+phrase)
assert.ok(notice.includes('新指名申請'), 'Admin-wide toast missing')
assert.ok(api.includes("rpc('submit_booking_request'"), 'Public requests must go through RPC')
assert.ok(api.includes("rpc('decide_booking_request'"), 'Admin decisions must go through atomic RPC')
assert.ok(api.includes('busyUntil')&&api.includes('new Date(until).getTime()>nowMs'), 'Card status needs server timestamp')
assert.ok(app.includes('path="/booking"'), 'Booking page route missing')
assert.ok(transition.includes('BOOKING_PAGE_READY_EVENT'), 'Route reveal must await booking data')
assert.ok(modules.includes("path: '/admin/booking'"), 'Admin inbox must be linked')
assert.ok(build.includes("'admin/booking'"), 'GitHub Pages deep link missing')
for (const table of ['booking_plans','booking_requests','booking_request_staff','staff_booking_presence'])
 assert.ok(sql.includes('create table if not exists public.'+table), 'Missing table '+table)
for(const s of [
 'alter table public.booking_requests enable row level security',
 'alter table public.booking_request_staff enable row level security',
 'alter table public.staff_booking_presence enable row level security',
 "revoke all on public.booking_requests, public.booking_request_staff from anon",
 'security definer set search_path',
 'security invoker set search_path',
 'pg_advisory_xact_lock',
 'for update',
 'on conflict(id) do nothing',
 'price_gil,sort_order,is_active',
 '30,null,10,false',
 '60,null,20,false',
])assert.ok(sql.includes(s),'Missing security/plan rule '+s)
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {countdown,isStaffBusy}=await vite.ssrLoadModule('/src/lib/bookings.ts')
 const now=Date.parse('2026-11-14T09:00:00Z')
 assert.equal(countdown('2026-11-14T09:03:02Z',now),'3:02')
 assert.equal(countdown('2026-11-14T08:59:00Z',now),'0:00')
 assert.equal(isStaffBusy('2026-11-14T09:03:02Z',now),true)
 assert.equal(isStaffBusy('2026-11-14T08:59:00Z',now),false)
 const {default:BookingPage}=await vite.ssrLoadModule('/src/pages/BookingPage.tsx')
 const output=renderToStaticMarkup(createElement(BookingPage))
 assert.ok(output.includes('正在尋訪館中的狐姬'), 'First render needs stable placeholder')
 console.log('PASS: booking routes, modal, admin actions, RLS migration and 0:00 timer boundary')
}finally{await vite.close()}
