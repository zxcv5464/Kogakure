// Ensure service and shift pages reveal the site's existing rotating
// photographic backdrop instead of painting opaque backgrounds over it.
// Static checks only; no browser, external URLs or production data changes.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const [backdrop,backdropCss,transition,app,serviceCss,shiftCss,servicePage,shiftPage]=
 await Promise.all([
  'src/components/SceneBackdrop.tsx',
  'src/components/scene-backdrop.css',
  'src/components/PageTransition.tsx',
  'src/App.tsx',
  'src/pages/services-page.css',
  'src/pages/shifts-page.css',
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
assert.ok(backdrop.includes('requestId !== latestRequest')&&
 backdrop.includes('visibleScene.current === nextImage')&&
 backdrop.indexOf('const requestId = ++latestRequest') < backdrop.indexOf('if (visibleScene.current === nextImage) return'),
 'Invalidate older image requests even when returning to a photograph already shown')
assert.ok(backdrop.includes('!introReady')&&backdrop.includes('[path, introReady]'),
 'Background rotation must wait until the entrance animation is finished')
assert.ok(backdrop.includes("prefers-reduced-motion: reduce")&&backdrop.includes("document.visibilityState !== 'visible'"),
 'Respect reduced motion and pause while the browser is hidden')
assert.ok(transition.includes('<SceneBackdrop introReady={introReady} />'),
 'Render one shared backdrop above the public routes, not one timer per page')
assert.ok(app.includes('path="/services"')&&app.includes('path="/shifts"'),
 'Both public routes must remain mounted inside the public shell')
assert.ok(backdropCss.includes('transition: opacity 2400ms')&&backdropCss.includes('.scene-backdrop__photo.is-active'),
 'Background imagery must still crossfade instead of abruptly switching')

// Both pages deliberately use identical translucent ink-wash strengths.
// Removing the opaque colors is what makes the already-running images visible.
const wash='linear-gradient(180deg,rgba(13,12,22,.69)0%,rgba(15,13,24,.77)52%,rgba(16,14,25,.87)100%)'
const serviceRoot=serviceCss.split('.services-page {')[1]?.split('\n}')[0]??''
const shiftRoot=shiftCss.split('.shift-page{')[1]?.split('}')[0]??''
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
assert.ok(shiftCss.includes('@media(max-width:690px)'),
 'Mobile calendar must retain its responsive layout')
console.log('PASS: services and shifts reveal the shared seven-scene 5-second crossfade while keeping galleries, calendar and accessibility')
