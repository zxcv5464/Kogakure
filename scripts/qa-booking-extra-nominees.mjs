// Regression tests: primary and every extra nominee must be submitted
// and visibly listed on both the client confirmation and admin inbox.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const [page,selection,api,notification,admin,style,adminStyle] = await Promise.all([
 'src/pages/BookingPage.tsx',
 'src/lib/booking-selection.ts',
 'src/lib/bookings.ts',
 'src/pages/admin/BookingNotification.tsx',
 'src/pages/admin/BookingManagement.tsx',
 'src/pages/booking-page.css',
 'src/pages/admin/booking-management.css',
].map(file => readFile(file,'utf8')))

for (const snippet of [
 "const chosen=resolveBookingNominees(selected,people,others,withOthers)",
 "const ids=chosen.map(person=>person.id)",
 "staffIds:ids",
 "setSubmittedNominees(chosen)",
 "setResult(bookingId)",
 "<NomineeSummary nominees={submittedNominees}/>",
 "<NomineeSummary nominees={nominees}/>",
 "person.primary?'主要指名':'追加指名'",
 "本次指名人員 · {nominees.length} 位",
 "ids.length!==1+(withOthers?others.length:0)",
]) assert.ok(page.includes(snippet), 'Booking selection/confirmation missing: '+snippet)
assert.ok(!page.includes('setOthers([]);setWithOthers(false)\n  }catch'), 'Do not clear extra nominees after a successful submission')
assert.ok(selection.includes('additionalIds'), 'Selection utility must account for extras')
assert.ok(api.includes("p_staff_ids:input.staffIds"), 'RPC must send the full selected staff array')
assert.ok(api.includes('for(const l of links as BookingLinkRow[])'), 'Admin must preserve all booking-to-staff links')
assert.ok(notification.includes('booking_request_staff(staff_name)'), 'Admin incoming notice must include all nominated names')
assert.ok(notification.includes('map(person => person.staff_name)'), 'Admin notice must display every nominated name')
assert.ok(notification.includes("{ count: 'exact' }"), 'Exact pending count must remain unaffected')
assert.ok(admin.includes('指名人員（{r.staff.length} 位）'), 'Admin list must display nominee count')
assert.ok(admin.includes('指名人員（{selectedBooking.staff.length} 位）'), 'Admin detail must display nominee count')
assert.ok(admin.includes('r.staff.map(person=><span key={person.id}>'), 'Admin list must render every nomination')
assert.ok(style.includes('.booking-nominee-summary'), 'Guest nomination summary must be styled')
assert.ok(adminStyle.includes('.booking-admin-nominee-list'), 'Admin nomination list must be readable')

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType:'custom' })
try {
 const { resolveBookingNominees } = await vite.ssrLoadModule('/src/lib/booking-selection.ts')
 const primary={id:'a',name:'紫狐'}
 const everyone=[primary,{id:'b',name:'婆婆'},{id:'c',name:'星詠'},{id:'d',name:'狐姬'}]
 const full=resolveBookingNominees(primary,everyone,['b'],true)
 assert.deepEqual(full.map(x=>x.id),['a','b'])
 assert.deepEqual(full.map(x=>x.name),['紫狐','婆婆'])
 assert.deepEqual(full.map(x=>x.primary),[true,false])
 assert.deepEqual(resolveBookingNominees(primary,everyone,['b','c','d'],false).map(x=>x.name),['紫狐'])
 assert.deepEqual(resolveBookingNominees(primary,everyone,['a','b','b','not-present'],true).map(x=>x.name),['紫狐','婆婆'])
 assert.deepEqual(resolveBookingNominees(null,everyone,['b'],true),[])
 assert.ok(page.includes('const maximumStaff = 2'), 'Only primary + one extra can be chosen')
 assert.ok(page.includes('onChange={e=>setOthers(e.target.checked?[person.id]:[])}'), 'Selecting an extra must replace the earlier extra')
 assert.ok(page.includes('追加指名（最多再選 1 位館員）'), 'Visitor must see the single-extra limit')
 const manual=await readFile('src/pages/admin/AdminBookingCreate.tsx','utf8')
 assert.ok(manual.includes('staffIds.length>=2'), 'Admin manually created bookings must also cap at two')
 assert.ok(manual.includes('if(staffIds.length>2)'), 'Admin request must validate the two-person maximum')
 const sql=await readFile('supabase/migrations/20261114_04_booking_max_two_nominees.sql','utf8')
 assert.ok(sql.includes('public.submit_booking_request('), 'Public booking RPC must enforce 2')
 assert.ok(sql.includes('public.admin_create_booking_request('), 'Admin booking RPC must enforce 2')
 assert.equal((sql.match(/not between 1 and 2/g)||[]).length,2,'Both public and admin RPCs must limit to two')
 assert.ok(!sql.includes('not between 1 and 4'),'Old max four must be removed in migration')
 console.log('PASS: primary plus one extra, selection replacement, complete confirmation and server-side max two')
} finally { await vite.close() }
