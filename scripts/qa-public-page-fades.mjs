// Regression check for the two published informational page entrances.
// This does not touch Supabase or alter UI data.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const motion = await readFile('src/components/route-motion.css','utf8')
const transition = await readFile('src/components/PageTransition.tsx','utf8')
const app = await readFile('src/App.tsx','utf8')

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
assert.ok(motion.includes('--public-reveal-ease:cubic-bezier(.22,.65,.25,1)'), 'Fade pacing must match staff page')
assert.ok(motion.includes(':is(.is-covering,.intro-waiting)'), 'Entrance must pause behind curtain and site intro')
assert.ok(motion.includes('animation-play-state:paused'), 'Covered entrance must pause')
assert.ok(motion.includes('prefers-reduced-motion:reduce'), 'Motion accessibility must remain supported')
assert.ok(transition.includes("phase === 'cover' ? ' is-covering' : ''"), 'Route curtain state must reach stage')
assert.ok(app.includes('path="/about"'))
assert.ok(app.includes('path="/menu"'))
console.log('PASS: house rules and menu share staff pacing, curtain pause and reduced-motion support')
