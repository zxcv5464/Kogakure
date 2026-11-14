// Verify the no-bookable-staff reservation state fills the space above
// the footer and reveals its notice in sequence with the public pages.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [css, motion, page, layout] = await Promise.all([
 'src/pages/booking-page.css',
 'src/components/route-motion.css',
 'src/pages/BookingPage.tsx',
 'src/components/Layout.tsx',
].map(file => readFile(file, 'utf8')))

assert.ok(css.includes('.site:has(.booking-page){display:flex;flex-direction:column;min-height:100vh;min-height:100dvh}'),
 'Booking route must expand its site shell to the viewport height')
assert.ok(css.includes('.site:has(.booking-page)>main{display:flex;flex-direction:column;flex:1;min-height:0}'),
 'The main content must consume all remaining space above the footer')
assert.ok(css.includes('.site:has(.booking-page) .booking-page{flex:1}'),
 'The booking background should cover its full main-area height')
assert.ok(!css.includes('.site{display:flex;flex-direction:column;min-height:100dvh}'),
 'Do not change the height/layout behavior of unrelated pages')
assert.ok(css.includes('rgba(17,15,26,.98)'),
 'The background should end opaque enough to hide underlying scene photos')
assert.ok(layout.includes('<main>{children}</main>') && layout.includes('<footer className="site-footer">'),
 'The footer must remain outside the booking section')
assert.ok(page.includes('!loading&&!error&&!people.length&&<div className="booking-notice"'),
 'No-staff message must remain present')
assert.ok(page.includes('!loading&&!error&&people.length>0&&<div className="booking-grid">'),
 'Do not render an empty grid with unwanted padding below the message')
for (const part of [
 '.route-stage .booking-notice{animation:quietRise 1.28s var(--public-reveal-ease) 1.16s both}',
 '.route-stage .booking-notice+.booking-notice{animation-delay:1.34s}',
 '.route-stage .booking-footnote{animation:quietFade 1.12s ease-out 1.45s both}',
 '.booking-legend,.booking-notice,.booking-profile,.booking-footnote){animation-play-state:paused}',
 '@media(prefers-reduced-motion:reduce){.route-stage,.route-stage *{animation:none!important}}',
]){
 assert.ok(motion.includes(part), 'No-staff fade / curtain / reduced-motion rule missing: ' + part)
}
assert.ok(motion.includes('.route-stage .booking-profile{animation:staffReveal 1.34s'),
 'The regular staff-booking card animations must remain unchanged')
console.log('PASS: full-height booking background, compact empty state, unified staged notice fades and curtain pause')
