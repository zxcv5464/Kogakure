// Verify booking cards retain the portrait-first layout while rendering a gallery and sticker overlay.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const [page,css,staff,admin,oldLayout,gallery,galleryCss]=await Promise.all([
 'src/pages/BookingPage.tsx','src/pages/booking-page.css','src/pages/StaffPage.tsx',
 'src/pages/admin/BookingManagement.tsx','scripts/qa-booking-role-layout.mjs',
 'src/components/MysticPhotoGallery.tsx','src/components/mystic-photo-gallery.css',
].map(path=>readFile(path,'utf8')))
const start=page.indexOf('const photo=bookingPhotosByStaff.get(person.id)')
const end=page.indexOf('</article>',start)
assert.ok(start>=0&&end>start,'Expected booking card markup not found')
const cardMarkup=page.slice(start,end)
assert.ok(!cardMarkup.includes('KOGAKURE · 指名名帖'),'Removed card subtitle must not be rendered')
assert.ok(!cardMarkup.includes('booking-card-overline'),'No unused overline inside the card')
for(const phrase of [
 'booking-profile-action','role="button"','booking-portrait','MysticPhotoGallery',
 'booking-card-details','booking-card-status','booking-card-role','booking-card-name',
 'booking-card-ornament','booking-card-description','booking-card-cta',
 'overlayUrl={photo.secondaryImageUrl}',
])assert.ok(cardMarkup.includes(phrase),'Required card area missing: '+phrase)
assert.ok(css.includes('.booking-profile-action:before{content:none}'),'No inner frame should cover the photograph')
assert.ok(css.includes('.booking-portrait:after{content:none}'),'Photo region should not have a decorative frame')
assert.ok(css.includes('.booking-portrait{')&&css.includes('border:0}'),'Photo region should be frameless')
assert.ok(css.includes('.booking-portrait img{')&&css.includes('object-fit:cover;object-position:center;transform:none'),
 'Portrait must fill its area without distortion')
assert.ok(css.includes('.booking-portrait .mystic-photo-overlay')&&
 css.includes('object-fit:contain'),'Floating sticker must preserve its own transparent framing')
assert.ok(css.includes('.booking-profile-action[role=button]')&&
 css.includes('.booking-profile-action.is-disabled'),'Accessible div cards need pointer and disabled states')
assert.ok(css.includes('.booking-card-details:after{')&&css.includes('inset:8px;border:1px solid'),
 'Only information region retains an inner border')
assert.ok(css.includes('.booking-card-topline{')&&css.includes('justify-content:flex-end'),
 'Status must align right above the role')
assert.ok(css.includes('height:auto;min-height:298px'),'Card must adapt height to text')
assert.ok(css.includes('@media(max-width:620px)')&&css.includes('@media(max-width:400px)'),
 'Mobile widths must remain covered')
assert.ok(oldLayout.includes('overflow-wrap:anywhere'),'Long text overflow regression guard must remain')
assert.ok(page.includes('p.published&&p.bookingVisible'),'All visible staff still eligible for booking')
assert.ok(admin.includes('decideBooking'),'Approval workflow must be preserved')
assert.ok(staff.includes('StaffCard'),'Regular staff directory must remain separate')
assert.ok(gallery.includes('services-photo-dots')&&gallery.includes('services-photo-shoji-edges')&&
 galleryCss.includes('1450ms cubic-bezier(.62,0,.12,1)'),
 'Booking portrait uses the same mysterious reveal and pagination as Services')
console.log('PASS: portrait-first booking card, floating overlay, accessible activation, mysterious photo carousel and responsive layout')
