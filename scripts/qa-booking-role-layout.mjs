// Protect role-agnostic booking eligibility and responsive card overflow.
// No Supabase access, writes or live visitor data are involved in this test.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const files=[
 'src/pages/BookingPage.tsx',
 'src/pages/booking-page.css',
 'src/pages/admin/AdminBookingCreate.tsx',
 'src/pages/admin/StaffManagement.tsx',
 'supabase/migrations/20261114_03_booking_all_roles.sql',
]
const [page,css,admin,editor,migration]=await Promise.all(files.map(p=>readFile(p,'utf8')))
for(const path of ['p.published&&p.bookingVisible','person.role||\'館員\'']){
 assert.ok(page.includes(path),'Booking page visibility or original job title missing: '+path)
}
assert.ok(admin.includes('p.published&&p.bookingVisible'),'Admin form must use the same visibility filter')
assert.ok(page.includes('onClick={()=>openBooking(person)} disabled={busy}'),'Cards must be inspectable even before plans are enabled')
assert.ok(page.includes('booking-plan-unavailable'),'Guests should understand when plans remain unpublished')
assert.ok(page.includes('disabled={sending||!plans.length}'),'Never submit a booking without a published plan')
assert.ok(!page.includes("role.includes('狐姬')")&&!admin.includes("role.includes('狐姬')"),'No job title gating is allowed')
assert.ok(editor.includes('須先公開名帖，不限職稱。'),'Editor must clearly explain non-role-limited bookings')
for(const part of [
 '.booking-profile-action{','height:auto;min-height:298px',
 'display:grid;grid-template-columns:minmax(145px,34%) minmax(0,1fr)',
 '.booking-card-details{','min-height:298px',
 'overflow-wrap:anywhere',
 '.booking-card-topline{display:flex;flex-wrap:wrap',
 '.booking-card-description{','white-space:normal',
 '.booking-card-services{display:flex;flex-wrap:wrap',
 '.booking-profile.has-manual-crop .booking-portrait img{object-fit:contain',
 '@media(max-width:620px)','@media(max-width:400px)',
]){
 assert.ok(css.includes(part),'Adaptive booking card rule missing: '+part)
}
const cardSection=css.slice(css.indexOf('/* 橫式指名名片'),css.indexOf('.booking-footnote{'))
assert.ok(cardSection.length>2000,'Booking card layout section missing')
assert.ok(!/height:\s*(?:282|245|232)px/.test(cardSection),'Legacy fixed card heights must be removed')
assert.ok(!/\.booking-profile-action\{[^}]*overflow:hidden/.test(cardSection),'Action must never clip text based on size')
assert.ok(!/\.booking-card-details\{[^}]*overflow:hidden/.test(cardSection),'Text column must never crop content')
for(const name of ['submit_booking_request','decide_booking_request','admin_create_booking_request']){
 assert.ok(migration.includes('create or replace function public.'+name+'('),'Missing restored RPC '+name)
}
assert.ok(!migration.includes("role like '%狐姬%'")&&!migration.includes("role not like '%狐姬%'"),'SQL must not reject other roles')
assert.ok(migration.includes('s.is_published=true and s.is_booking_visible=true'),'Public submissions must honor two flags')
assert.ok(migration.includes('(not s.is_published or not s.is_booking_visible)'),'Admin acceptance must honor two flags')
assert.ok(migration.includes('if not public.is_site_admin()'),'Admin-only RPC must check privileges')
assert.ok(migration.includes('for update'),'Acceptance must lock reservation records')
assert.ok(migration.includes('pg_advisory_xact_lock'),'Public rate limit guard must remain')
assert.ok(!migration.includes('delete from public.staff')&&!migration.includes('drop table'),'No destructive schema changes')
console.log('PASS: all job titles are bookable when enabled, cards grow with content, manual crop is preserved, SQL security retained')
