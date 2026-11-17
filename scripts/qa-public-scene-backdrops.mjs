// Shared public scene and ink veil regression tests. The dark veil must
// exist in the eagerly loaded transition layer, before any lazy route CSS.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const read=path=>readFile(path,'utf8')
const [app,transition,transitionCss,scene,sceneCss,events,motion,servicePage,shiftPage,...pageCss]=
 await Promise.all([
  'src/App.tsx',
  'src/components/PageTransition.tsx',
  'src/components/page-transition.css',
  'src/components/SceneBackdrop.tsx',
  'src/components/scene-backdrop.css',
  'src/lib/route-events.ts',
  'src/components/route-motion.css',
  'src/pages/ServicesPage.tsx',
  'src/pages/ShiftsPage.tsx',
  'src/pages/about-page.css',
  'src/pages/services-page.css',
  'src/pages/staff-page.css',
  'src/pages/shifts-page.css',
  'src/pages/menu-page.css',
  'src/pages/booking-page.css',
  'src/pages/memories.css',
 ].map(read))

const roots=[
 ['/about','house rules',pageCss[0],'\n.house-rules-page {'],
 ['/services','services',pageCss[1],'\n.services-page {'],
 ['/staff','staff roster',pageCss[2],'\n.site > main .staff-page {'],
 ['/shifts','shifts',pageCss[3],'\n.shift-page{'],
 ['/menu','tea menu',pageCss[4],'\n.tea-menu-page{'],
 ['/booking','bookings',pageCss[5],'\n.booking-page{'],
 ['/memories','traveler memories',pageCss[6],'\n.memories-page{'],
]
for(const [path,name,css,selector] of roots){
 const section=css.split(selector)[1]?.split('}')[0]
 assert.ok(section,name+' must retain its own page container')
 assert.match(section,/background:\s*transparent\s*;/,
  name+' must not stack a second gradient over the shared site veil')
 assert.ok(app.includes('path="'+path+'"'),name+' public route must remain present')
}

assert.ok(transitionCss.includes('.public-page-veil {')&&
 transitionCss.replace(/\s+/g,'').includes('background:linear-gradient(180deg,rgba(13,12,21,.75),rgba(14,13,21,.95))'),
 'All non-home pages must use the same tea-inspired translucent ink veil')
assert.ok(!transitionCss.includes('.public-page-veil.is-home')&&
 !transition.includes(' is-home')&&
 transition.includes('<div className="public-page-veil" aria-hidden="true" />'),
 'Homepage and all other public pages must share the same permanently mounted veil')
assert.ok(transitionCss.includes('z-index: -1;')&&transitionCss.includes('pointer-events: none;'),
 'Global veil must sit between photographs and interactive page content')
assert.ok(app.includes('path="/" element={<HomePage />} />')&&
 transition.indexOf('<SceneBackdrop introReady={introReady} path={displayed.pathname} />') <
 transition.indexOf('<div className="public-page-veil" aria-hidden="true" />'),
 'Homepage must share the backdrop and veil from the first render, without route-specific toggling')
assert.ok(transition.includes('<SceneBackdrop introReady={introReady} path={displayed.pathname} />'),
 'Scene photo and shared veil must change together behind the covering curtain')
assert.ok(scene.includes('Array.from({ length: 7 }')&&
 scene.includes('window.setInterval(')&&scene.includes('5000)'),
 'Retain existing seven image five-second rotation')
assert.ok(scene.includes('requestId !== latestRequest')&&
 scene.includes('visibleScene.current === nextImage'),
 'Late background image decodes must never overwrite a newer scene')
assert.ok(scene.includes('!introReady')&&
 scene.includes("prefers-reduced-motion: reduce")&&
 scene.includes("document.visibilityState !== 'visible'"),
 'Preserve intro gating, reduced motion and hidden-tab throttling')
assert.ok(!scene.includes('useLocation')&&scene.includes('path: string'),
 'Shared photo path must follow the displayed route after curtain swap')
assert.ok(sceneCss.includes('transition: opacity 2400ms')&&
 sceneCss.includes('.scene-backdrop__photo.is-active')&&
 sceneCss.includes('background: transparent !important;'),
 'Maintain smooth photo crossfade and avoid double tint on fallback pages')
assert.ok(events.includes('PUBLIC_ROUTE_MOUNTED_EVENT')&&
 app.includes('useLayoutEffect')&&
 app.includes('<PublicRouteMounted path={location.pathname}/>')&&
 app.indexOf('<PublicRouteMounted path={location.pathname}/>')>app.indexOf('</Routes>'),
 'Lazy routes must signal completion from inside the Suspense boundary')
assert.ok(transition.includes('PUBLIC_ROUTE_MOUNTED_EVENT')&&
 transition.includes('(event as CustomEvent<string>).detail !== location.pathname')&&
 transition.includes('location.pathname === \'/\' ? null : PUBLIC_ROUTE_MOUNTED_EVENT'),
 'Never reveal unloaded pages or accept stale route mount notifications')
for(const selector of ['.route-stage .house-rules-hero h1','.route-stage .services-hero h1',
 '.route-stage .tea-menu-hero h1','.route-stage .staff-entry']){
 assert.ok(motion.includes(selector),'Keep public entrance animation '+selector)
}
assert.ok(servicePage.includes('ServicePhotoGallery')&&
 shiftPage.includes('shift-calendar-weekdays')&&shiftPage.includes('shift-selected-detail'),
 'Service photo galleries and shifts calendar must remain intact')
assert.ok(pageCss[2].includes('.site > main .staff-page .staff-grid')&&
 pageCss[6].includes('.memories-panel{max-width:850px'),
 'Staff cards and centered traveler forms must remain unchanged')
console.log('PASS: homepage and all seven public pages share one early dark veil; lazy routes wait for CSS; admin remains independent')
