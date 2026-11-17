// Ensure public pages keep the shared rotating photography and their intended
// translucent ink washes, including full-height dark veils on roster and memories.
// Static checks only; no browser, external URLs or production data changes.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const [backdrop,backdropCss,transition,app,serviceCss,shiftCss,memoriesCss,staffCss,servicePage,shiftPage]=
 await Promise.all([
  'src/components/SceneBackdrop.tsx',
  'src/components/scene-backdrop.css',
  'src/components/PageTransition.tsx',
  'src/App.tsx',
  'src/pages/services-page.css',
  'src/pages/shifts-page.css',
  'src/pages/memories.css',
  'src/pages/staff-page.css',
  'src/pages/ServicesPage.tsx',
  'src/pages/ShiftsPage.tsx',
 ].map(p=>readFile(p,'utf8')))

assert.ok(backdrop.includes('Array.from({ length: 7 }'),'Expected the seven venue background photos')
assert.ok(backdrop.includes("'/services': 2")&&backdrop.includes("'/shifts': 4"),
 'Service and shifts routes must participate in the shared scene loop')
assert.ok(backdrop.includes('window.setInterval(')&&backdrop.includes('5000)'),
 'Shared background must keep its five-second photo cycling')
assert.ok(backdrop.includes('preload.onload')&&backdrop.includes('setBackdrop(previous =>'),
 'Switch only after next shared background photo has loaded')
assert.ok(backdrop.includes("prefers-reduced-motion: reduce")&&backdrop.includes("document.visibilityState !== 'visible'"),
 'Respect reduced motion and pause while the browser is hidden')
assert.ok(transition.includes('<SceneBackdrop introReady={introReady} />'),
 'Render one shared backdrop above the public routes, not one timer per page')
assert.ok(app.includes('path="/services"')&&app.includes('path="/shifts"'),
 'Both public routes must remain mounted inside the public shell')
assert.ok(backdropCss.includes('transition: opacity 2400ms')&&backdropCss.includes('.scene-backdrop__photo.is-active'),
 'Background imagery must still crossfade instead of abruptly switching')

// Services and shifts use the lighter scene wash; memories uses a darker veil.
// Removing the opaque colors is what makes the already-running images visible.
const wash='linear-gradient(180deg,rgba(13,12,22,.69)0%,rgba(15,13,24,.77)52%,rgba(16,14,25,.87)100%)'
const serviceRoot=serviceCss.split('.services-page {')[1]?.split('\n}')[0]??''
const shiftRoot=shiftCss.split('.shift-page{')[1]?.split('}')[0]??''
const memoriesRoot=memoriesCss.split('.memories-page{')[1]?.split('}')[0]??''
const staffRoot=staffCss.split('.site > main .staff-page {')[1]?.split('\n}')[0]??''
for(const [name,root] of [['services',serviceRoot],['shifts',shiftRoot]]){
 const normalized=root.replace(/\s+/g,'')
 assert.ok(normalized.includes(wash),name+' page must use the shared translucent scene wash')
 assert.ok(!/linear-gradient\(180deg,#/.test(normalized),
  name+' page may not conceal the rotating scene behind opaque hex colors')
}
assert.ok(servicePage.includes('ServicePhotoGallery')&&serviceCss.includes('.services-photo-slide.is-visible'),
 'Independent service photo carousel must be preserved')
assert.ok(shiftPage.includes('shift-calendar-weekdays')&&shiftPage.includes('shift-selected-detail'),
 'Monthly roster and selected-day details must not be replaced')
// Memories are intentionally darker than the service and shift scene wash:
 // match the translucent ink veil used by the booking page.
const memoriesVeil='linear-gradient(180deg,rgba(12,12,21,.90)0%,rgba(17,15,26,.98)100%)'
assert.ok(memoriesRoot.replace(/\s+/g,'').includes(memoriesVeil),
 'Traveler memories needs the same dark translucent overlay as booking')
assert.ok(memoriesCss.includes('.site:has(.memories-page)>main{display:flex;flex-direction:column;flex:1;min-height:0}')&&
 memoriesCss.includes('.site:has(.memories-page) .memories-page{flex:1}'),
 'Traveler memories overlay must reach the footer even when content is short')
assert.ok(app.includes('path="/memories"'), 'Traveler memories must remain in the shared public scene shell')
assert.ok(memoriesRoot.includes('width:100%')&&memoriesRoot.includes('min-width:0')&&
 !memoriesRoot.includes('max-width:')&&!memoriesRoot.includes('1100px'),
 'Traveler memories ink wash must cover the viewport rather than a centered 1100px strip')
assert.ok(memoriesCss.includes('.memories-page{padding:44px 12px 90px}'),
 'Mobile traveler memories must retain a full-width ink wash')
assert.ok(memoriesCss.includes('.memories-panel{max-width:850px'),
 'Keep traveler forms comfortably centered inside the full-width background')
assert.ok(staffRoot.replace(/\s+/g,'').includes(memoriesVeil),
 'Staff roster must use the same translucent dark gradient as traveler memories')
assert.ok(staffCss.includes('.site:has(.staff-page)>main{display:flex;flex-direction:column;flex:1;min-height:0}')&&
 staffRoot.includes('flex: 1;'),
 'Staff roster dark backdrop must fill short viewport pages through the footer')
assert.ok(staffCss.includes('.site > main .staff-page .staff-grid')&&
 staffCss.includes('.staff-page .staff-entry')&&
 staffCss.includes('.staff-page .staff-catalog-panel'),
 'Staff portrait grid, card sizing and directory filtering must remain intact')
assert.ok(shiftCss.includes('@media(max-width:690px)'),
 'Mobile calendar must retain its responsive layout')
console.log('PASS: services, shifts, traveler memories and staff roster reveal the shared seven-scene 5-second crossfade while keeping galleries, calendar and accessibility')
