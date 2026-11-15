// Booking retains the same ordered staff-directory reveal, but avoids excessive waiting on first entry.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const [motion,bookingCss,bookingPage,transition]=await Promise.all([
 'src/components/route-motion.css',
 'src/pages/booking-page.css',
 'src/pages/BookingPage.tsx',
 'src/components/PageTransition.tsx',
].map(path=>readFile(path,'utf8')))

assert.ok(motion.includes('.route-stage .booking-page{--public-reveal-ease:cubic-bezier(.22,.65,.25,1)}'),
 'Booking must share other public pages\' easing curve')
assert.ok(motion.includes('.route-stage .staff-entry{animation:staffReveal 1.34s var(--staff-ease) both;animation-delay:calc(1.2s + min(var(--delay,0ms),640ms))}'),
 'Staff directory reference animation has unexpectedly changed')
assert.ok(motion.includes('.route-stage .booking-profile{animation:staffReveal .92s var(--public-reveal-ease) both;animation-delay:calc(.48s + min(var(--booking-delay,0ms),640ms))}'),
 'Booking cards should arrive gently but without an extra 1.2s invisible delay')
assert.ok(!motion.includes('.booking-profile.staff-entry'), 'Obsolete selector cannot match the redesigned landscape cards')
assert.ok(!bookingCss.includes('animation:bookingReveal'), 'Do not override the shared entrance with an earlier page-local animation')
assert.ok(!bookingCss.includes('@keyframes bookingReveal'), 'Remove unused faster animation')
assert.ok(bookingPage.includes("'--booking-delay':Math.min(index,8)*80+'ms'"),
 'Each card should stagger at the same 80ms interval as staff profiles')
assert.ok(motion.includes('.route-stage .booking-hero-label{animation:quietRise 1.18s var(--public-reveal-ease) .54s both}'),
 'Subtitle should reveal between heading and verse')
assert.ok(motion.includes('.route-stage .booking-hero-verse{animation:quietRise 1.28s var(--public-reveal-ease) .72s both}'),
 'Intro should follow the same cadence as the staff page')
assert.ok(motion.includes('.route-stage .booking-legend{animation:quietRise .88s var(--public-reveal-ease) .42s both}'),
 'Booking status legend should precede cards')
assert.ok(motion.includes('.booking-profile,.booking-footnote){animation-play-state:paused}'),
 'Curtain and first-visit intro must pause the booking animations')
assert.ok(motion.includes('@media(prefers-reduced-motion:reduce){.route-stage,.route-stage *{animation:none!important}}'),
 'Reduced-motion support must remain intact')
assert.ok(transition.includes('BOOKING_PAGE_READY_EVENT')&&bookingPage.includes('window.requestAnimationFrame(()=>window.dispatchEvent(new Event(BOOKING_PAGE_READY_EVENT)))'),
 'Curtain should reveal the stable reservation shell on first paint, not after three queries')
console.log('PASS: booking preserves ordered fades while reducing card delay, first-paint curtain and reduced-motion support')
