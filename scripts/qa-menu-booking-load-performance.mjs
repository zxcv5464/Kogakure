// Visitors can enter the tea banquet and booking shells without awaiting
// network data. Caches are read-only, expire quickly and never alter admin APIs.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

const files=[
 'src/pages/MenuPage.tsx','src/pages/BookingPage.tsx',
 'src/lib/public-menu.ts','src/lib/public-booking-data.ts',
 'src/lib/prefetch.ts','src/components/Layout.tsx',
 'src/components/PageTransition.tsx','src/components/route-motion.css',
 'src/pages/menu-page.css','src/pages/booking-page.css',
 'src/pages/admin/MenuManagement.tsx','src/pages/admin/BookingManagement.tsx',
]
const [menu,booking,menuCache,bookingCache,prefetch,layout,transition,motion,
 menuCss,bookingCss,menuAdmin,bookingAdmin]=
 await Promise.all(files.map(p=>readFile(p,'utf8')))
const app=await readFile('src/App.tsx','utf8')
const viteConfig=await readFile('vite.config.ts','utf8')
assert.ok(viteConfig.includes('vendor-react')&&viteConfig.includes('vendor-supabase')&&
 viteConfig.includes('inlineDynamicImports: true'),
 'Keep stable vendor chunks separated while retaining single-file offline preview support')
for(const name of ['AboutPage','ServicesPage','ShiftsPage','BookingPage']){
 assert.ok(app.includes(`const ${name} = lazy(() => import('./pages/${name}'))`),
  `${name} should remain lazy-loaded so unrelated page code is excluded from the entry bundle`)
}
assert.ok(app.includes("import MenuPage from './pages/MenuPage'"),
 'Preserve the first-paint tea menu shell without a lazy route waterfall')

for(const [name,source] of [['Menu',menu],['Booking',booking]]){
 assert.ok(source.includes('window.requestAnimationFrame(()=>window.dispatchEvent(new Event('),
  name+' shell should dispatch readiness on first paint rather than network settle')
}
assert.ok(menu.includes("mode==='loading'&&<div className=\"tea-menu-loading-stage\""),
 'Show the branded menu header with a distinct in-content loading state')
assert.ok(menu.includes("const categories = mode === 'loading' ? []"),
 'Never display unverified sample menu prices during the live first fetch')
assert.ok(!menu.includes("if (mode === 'loading') return <MenuLoading />"),
 'Full-screen menu loading should no longer hide the brand')
assert.ok(booking.includes('booking-loading-stage')&&
 booking.includes('!loading&&!error&&people.length>0'),
 'Display the booking headline without implying profiles are bookable while pending')
assert.ok(!booking.includes('if(loading)return <BookingLoading />'),
 'Full-screen booking loader must not hide the header before data arrives')
assert.ok(booking.includes('Promise.all([loadPublicStaff(),loadPublicBookingPlans(),loadPublicStaffPresence()])'),
 'Initial booking checks still require published staff, live plans and presence')
assert.ok(booking.includes('loadPublicStaffPresence({force:true})')&&
 booking.includes('loadPublicBookingPlans({force:true})'),
 'Live realtime/poll updates must bypass old visitor cache')
assert.ok(menuCache.includes('45_000')&&
 bookingCache.includes('45_000')&&bookingCache.includes('6_000'),
 'Menu, plans and occupancy should use bounded, separately chosen TTLs')
assert.ok(prefetch.includes('prefetchMenuPage')&&prefetch.includes('prefetchBookingPage')&&
 prefetch.includes("import {prefetchPublicMenu} from './public-menu'")&&
 prefetch.includes('prefetchPublicMenu()')&&
 !prefetch.includes("import('../pages/MenuPage')")&&
 !prefetch.includes("import('./public-menu')")&&
 prefetch.includes("import('../pages/BookingPage')"),
 'Reuse the statically bundled menu catalog without a redundant dynamic import, while booking stays lazy')
assert.ok(layout.includes("to==='/menu'?prefetchMenuPage")&&
 layout.includes("to==='/booking'?prefetchBookingPage"),
 'All desktop/mobile menus should trigger the new on-intent prefetch')
assert.ok(transition.includes('MENU_PAGE_READY_EVENT')&&
 transition.includes('BOOKING_PAGE_READY_EVENT'),
 'Keep the existing curtain but release it after initial page paint')
assert.ok(motion.includes('.route-stage .tea-menu-section{animation:quietRise .85s')&&
 motion.includes('.route-stage .tea-menu-summary{animation:quietRise .88s')&&
 motion.includes('.route-stage .booking-profile{animation:staffReveal 1.1s'),
 'Tea and booking should follow the same deliberate staged fades as other public pages')
assert.ok(menuCss.includes('.tea-menu-loading-stage{')&&
 bookingCss.includes('.booking-loading-stage{'),
 'Loading surfaces should occupy stable space within their respective pages')
assert.ok(!menuAdmin.includes('public-menu')&&!bookingAdmin.includes('public-booking-data'),
 'Private order/booking administration must never use the visitor-only cache')
assert.ok(menu.includes('submitTeaOrder(')&&booking.includes('submitNomination('),
 'Keep the existing order and booking RPC submission mechanisms')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {createPublicMenuCache}=await vite.ssrLoadModule('/src/lib/public-menu.ts')
 const {createBookingReadCache}=await vite.ssrLoadModule('/src/lib/public-booking-data.ts')
 let t=500,menuCalls=0,bookCalls=0
 const pendingMenu=[],pendingBooking=[]
 const menuValue={categories:[],items:[]}
 const menuCacheTest=createPublicMenuCache(async()=>{
  menuCalls++
  await new Promise(resolve=>pendingMenu.push(resolve))
  return menuValue
 },45,()=>t)
 const first=menuCacheTest.load(),second=menuCacheTest.load()
 assert.strictEqual(first,second,'Hover and page mount must reuse one pending menu promise')
 assert.equal(menuCalls,1)
 pendingMenu.shift()()
 assert.strictEqual(await first,menuValue)
 assert.strictEqual(await second,menuValue)
 assert.strictEqual(await menuCacheTest.load(),menuValue)
 assert.equal(menuCalls,1,'Fresh menu cache should suppress repeated database lookups')
 t+=46
 const reread=menuCacheTest.load()
 assert.equal(menuCalls,2)
 pendingMenu.shift()()
 await reread
 const result=[{id:'plan1'}]
 const bookingCacheTest=createBookingReadCache(async()=>{
  bookCalls++
  await new Promise(resolve=>pendingBooking.push(resolve))
  return result
 },6,()=>t)
 const a=bookingCacheTest.load(),b=bookingCacheTest.load()
 assert.strictEqual(a,b,'Plan/presence entry and prefetch must deduplicate')
 assert.equal(bookCalls,1)
 pendingBooking.shift()()
 await a
 assert.strictEqual(bookingCacheTest.peek(),result)
 assert.strictEqual(await bookingCacheTest.load(),result)
 t+=7
 const force=bookingCacheTest.load()
 assert.equal(bookCalls,2,'Busy-state cache must expire quickly')
 pendingBooking.shift()()
 await force
 const manual=bookingCacheTest.load({force:true})
 assert.equal(bookCalls,3,'Realtime/poll should always force authoritative read')
 pendingBooking.shift()()
 await manual

 const {default:MenuPage}=await vite.ssrLoadModule('/src/pages/MenuPage.tsx')
 const {default:BookingPage}=await vite.ssrLoadModule('/src/pages/BookingPage.tsx')
 const menuHtml=renderToStaticMarkup(createElement(MenuPage))
 const bookingHtml=renderToStaticMarkup(createElement(BookingPage))
 assert.ok(menuHtml.includes('狐之茶宴'),'The tea banquet heading must render')
 assert.ok(bookingHtml.includes('狐隱指名'),'The reservation heading must render')
 assert.ok(bookingHtml.includes('正在尋訪館中的狐姬'),'No false booking availability while offline')
 console.log('PASS: menu/booking first-paint shells, short cache TTL and dedup, live refresh, safe checkout and booking submission')
}finally{await vite.close()}
