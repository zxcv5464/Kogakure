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
 const full=resolveBookingNominees(primary,everyone,['b','c','d'],true)
 assert.deepEqual(full.map(x=>x.id),['a','b','c','d'])
 assert.deepEqual(full.map(x=>x.name),['紫狐','婆婆','星詠','狐姬'])
 assert.deepEqual(full.map(x=>x.primary),[true,false,false,false])
 assert.deepEqual(resolveBookingNominees(primary,everyone,['b','c','d'],false).map(x=>x.name),['紫狐'])
 assert.deepEqual(resolveBookingNominees(primary,everyone,['a','b','b','not-present'],true).map(x=>x.name),['紫狐','婆婆'])
 assert.deepEqual(resolveBookingNominees(null,everyone,['b'],true),[])
 console.log('PASS: all selected nominees survive the RPC submission and appear in guest/admin confirmations')
} finally { await vite.close() }
