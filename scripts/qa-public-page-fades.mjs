// Regression check for the two published informational page entrances.
// This does not touch Supabase or alter UI data.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const motion = await readFile('src/components/route-motion.css','utf8')
const transition = await readFile('src/components/PageTransition.tsx','utf8')
const app = await readFile('src/App.tsx','utf8')
const memories = await readFile('src/pages/MemoriesPage.tsx','utf8')
const shifts = await readFile('src/pages/ShiftsPage.tsx','utf8')

for (const selector of [
 '.route-stage .house-rules-hero h1',
 '.route-stage .house-rules-epigraph',
 '.route-stage .house-rules-welcome',
 '.route-stage .house-rules-index',
 '.route-stage .house-rules-chapter',
 '.route-stage .tea-menu-hero h1',
 '.route-stage .tea-menu-verse',
 '.route-stage .tea-menu-section',
 '.route-stage .tea-menu-summary',
]) {
 assert.ok(motion.includes(selector), 'Missing fade selector: ' + selector)
}
// Both travel keepsakes and shift calendar must use the site's existing
// group-based reveal, not show a finished animation under the route curtain.
for (const selector of [
 '.route-stage .memories-hero .eyebrow',
 '.route-stage .memories-glyph',
 '.route-stage .memories-hero h1',
 '.route-stage .memories-tabs',
 '.route-stage .memories-panel',
 '.route-stage .memories-section-title',
 '.route-stage .memories-claim-form',
 '.route-stage .memories-feedback-form',
 '.route-stage .memories-privacy-note',
 '.route-stage .memories-guestbook',
 '.route-stage .shift-calendar-shell',
 '.route-stage .shift-calendar-heading',
 '.route-stage .shift-calendar-weekdays',
 '.route-stage .shift-week',
 '.route-stage .shift-selected-detail',
])assert.ok(motion.includes(selector),'Missing public fade: '+selector)
assert.ok(motion.includes('.route-stage .memories-panel{animation:quietRise 1.2s')&&
 motion.includes('.route-stage .shift-calendar-shell{animation:quietFade 1.12s')&&
 motion.includes('.route-stage .shift-week:nth-child(4){animation-delay:1.43s}'),
 'Traveler album and calendar should share unhurried group fades, without moving the day-cell grid')
assert.ok(motion.includes('.route-stage:is(.is-covering,.intro-waiting) .memories-page :is(')&&
 motion.includes('.shift-calendar-shell,.shift-calendar-heading,.shift-calendar-weekdays,.shift-week,.shift-selected-detail')&&
 motion.includes('){animation-play-state:paused}'),
 'Memories and the calendar must pause while the scene curtain or initial intro is active')
assert.ok(memories.includes('className="memories-hero"')&&
 memories.includes('className="memories-panel"')&&
 memories.includes('className="memories-tabs"')&&
 shifts.includes('className="shift-calendar-shell"')&&
 shifts.includes('className="shift-weeks"'),
 'The animated CSS must target stable real public DOM sections')
assert.ok(motion.includes('.route-stage .home-content>.home-news{animation:quietRise')&&
 motion.includes('.route-stage.is-covering .home-content>.home-news{animation-play-state:paused}')&&
 motion.includes('.home-content>.primary-link,.home-content>.home-news,.home-note'),
 'Home notice board must use the same intro-safe, curtain-safe fade as homepage artwork')
assert.ok(motion.includes('--public-reveal-ease:cubic-bezier(.22,.65,.25,1)'), 'Fade pacing must match staff page')
assert.ok(motion.includes(':is(.is-covering,.intro-waiting)'), 'Entrance must pause behind curtain and site intro')
assert.ok(motion.includes('animation-play-state:paused'), 'Covered entrance must pause')
assert.ok(motion.includes('prefers-reduced-motion:reduce'), 'Motion accessibility must remain supported')
assert.ok(transition.includes("phase === 'cover' ? ' is-covering' : ''"), 'Route curtain state must reach stage')
assert.ok(app.includes('path="/about"'))
assert.ok(app.includes('path="/menu"'))
assert.ok(transition.includes('PUBLIC_ROUTE_MOUNTED_EVENT')&&
 transition.includes("location.pathname === '/' ? null : PUBLIC_ROUTE_MOUNTED_EVENT"),
 'About, services and memories transitions must wait for lazy route mount before reveal')
assert.ok(app.includes('useLayoutEffect')&&app.includes('<PublicRouteMounted path={location.pathname}/>'),
 'Signal route readiness only after content under Suspense can commit')
console.log('PASS: house rules, tea, traveler memories and shifts calendar share curtain-safe staged public reveals and reduced-motion support')
