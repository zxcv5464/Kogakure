// Verify the booking card visual contract without changing staff data or Supabase.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [page,css,staff,admin,oldLayout] = await Promise.all([
 'src/pages/BookingPage.tsx',
 'src/pages/booking-page.css',
 'src/pages/StaffPage.tsx',
 'src/pages/admin/BookingManagement.tsx',
 'scripts/qa-booking-role-layout.mjs',
].map(path=>readFile(path,'utf8')))

const cardMarkup=page.slice(
 page.indexOf('<span className="booking-portrait">'),
 page.indexOf('</button>',page.indexOf('<span className="booking-portrait">'))
)
assert.ok(cardMarkup.length>300,'Expected booking card markup not found')
assert.ok(!cardMarkup.includes('KOGAKURE · 指名名帖'),'Removed card subtitle must not be rendered')
assert.ok(!cardMarkup.includes('booking-card-overline'),'No unused overline inside the card')
for (const phrase of [
 'booking-portrait', 'booking-card-details', 'booking-card-status',
 'booking-card-role','booking-card-name','booking-card-ornament',
 'booking-card-description','booking-card-cta'
]) assert.ok(cardMarkup.includes(phrase),'Required card area missing: '+phrase)

assert.ok(css.includes('.booking-profile-action:before{content:none}'),'No inner frame should cover the photograph')
assert.ok(css.includes('.booking-portrait:after{content:none}'),'Photo must not have an overlay or decorative frame')
assert.ok(css.includes('.booking-portrait{') && css.includes('border:0}'),'Photo region should have no extra border')
assert.ok(css.includes('.booking-portrait img{') && css.includes('object-fit:cover;object-position:center;transform:none'),'Images must fill the photo area without distortion')
assert.ok(css.includes('.booking-profile.has-manual-crop .booking-portrait img{object-fit:cover'),'Both manual and original thumbnails must fill the left region')
assert.ok(css.includes('.booking-card-details:after{') && css.includes('inset:8px;border:1px solid'),'Only information region retains an inner border')
assert.ok(css.includes('.booking-card-topline{') && css.includes('justify-content:flex-end'),'Status must align right above the role')
assert.ok(!css.includes('.booking-card-overline{'),'No obsolete subtitle CSS')
assert.ok(css.includes('height:auto;min-height:298px'),'Card must adapt height to text')
assert.ok(css.includes('@media(max-width:620px)') && css.includes('@media(max-width:400px)'),'Mobile widths must remain covered')
assert.ok(oldLayout.includes('overflow-wrap:anywhere'),'Long text overflow regression guard must remain')
assert.ok(page.includes('p.published&&p.bookingVisible'),'All visible staff still eligible for booking')
assert.ok(admin.includes('decideBooking'),'Approval workflow must be preserved')
assert.ok(staff.includes('StaffCard'),'Regular staff directory must remain separate')
console.log('PASS: full-bleed photos, no photograph inner frame, text-only border, status-first card and responsive layout')
