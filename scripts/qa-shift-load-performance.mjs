// Public shift load smoothness: test requests, cache freshness and rendering
// without Supabase credentials or live visitor data.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'

const [source,publicSource,nav,prefetch,calendar,motion,admin]=await Promise.all([
 'src/pages/ShiftsPage.tsx','src/lib/public-shifts.ts',
 'src/components/Layout.tsx','src/lib/prefetch.ts',
 'src/lib/shift-calendar.ts','src/components/route-motion.css',
 'src/pages/admin/ShiftManagement.tsx',
].map(file=>readFile(file,'utf8')))
assert.ok(source.includes('peekPublicShifts(start,end)')&&source.includes('loadPublicShifts(start,end)'),
 'Public shifts must reuse cached snapshots and fetch through deduplicating reader')
assert.ok(source.includes('setRefreshing(true)')&&source.includes('loadPublicShifts(start,end,{force:true})'),
 'Visitor refresh must force a network read without blanking the existing calendar')
assert.ok(!source.includes('!loading&&(!error||hasSnapshot)')&&
 source.includes('const unavailable=configured&&!hasSnapshot')&&
 source.includes('aria-busy={unavailable}'),
 'All 28 calendar cells should paint even on first network load, without pretending missing days are closed')
assert.ok(source.includes('latestRequest.current')&&source.includes('request===latestRequest.current'),
 'Out-of-order requests must not overwrite the latest schedule or error state')
assert.ok(source.includes('useMemo(()=>')&&calendar.includes('useMemo(()=>rollingShiftWeeks(today),[today])'),
 'Selection and data updates must not recompute calendar dates and daily lookups unnecessarily')
assert.ok(prefetch.includes("export function prefetchShiftsPage():void")&&
 prefetch.includes('prefetchCurrentPublicShifts()'),
 'Keep intent-driven schedule prefetch, without prefetching production data on home load')
assert.ok((nav.match(/onMouseEnter=\{to==='\/staff'\?prefetchStaffPage:to==='\/shifts'\?prefetchShiftsPage/g)||[]).length===2,
 'Both desktop and mobile Shifts links must warm the lazy page and data')
assert.ok(publicSource.includes('CACHE_TTL_MS=45_000')&&publicSource.includes('pending.get(key)'),
 'Use a bounded, in-flight-deduplicated cache for the public page')
assert.ok(!admin.includes('peekPublicShifts')&&!admin.includes('loadPublicShifts'),
 'Administration must keep fetching fresh data and ignore visitor-only caches')
assert.ok(motion.includes('.route-stage .shift-calendar-shell{animation:quietFade 1.12s')&&
 motion.includes('.route-stage .shift-calendar-heading{animation:quietRise .96s')&&
 motion.includes('.route-stage .shift-calendar-weekdays{animation:quietFade .78s')&&
 motion.includes('.route-stage .shift-week{animation:quietFade .82s')&&
 motion.includes('.route-stage .shift-week:nth-child(4){animation-delay:1.43s}')&&
 motion.includes('.route-stage .shift-selected-detail{animation:quietRise 1.05s')&&
 motion.includes('.shift-calendar-shell,.shift-calendar-heading,.shift-calendar-weekdays,.shift-week,.shift-selected-detail'),
 'Month calendar, rows and selected-day detail must fade in behind the shared curtain, without moving the day grid')
assert.ok(source.includes("opening?.open?members.get(date)||[]:[]")&&
 source.includes('shift-selected-detail'),
 'Preserve the actual daily roster and selected-day UI')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {createPublicShiftCache}=await vite.ssrLoadModule('/src/lib/public-shifts.ts')
 let now=1000,calls=0,pending=[]
 const result={days:[{date:'2026-11-16',open:true,hours:'21:00–24:00',eventTitle:'',note:''}],attendance:[]}
 const cache=createPublicShiftCache(async()=>{
  calls++
  await new Promise(resolve=>pending.push(resolve))
  return result
 },45,()=>now)
 const start='2026-11-16',end='2026-12-13'
 const a=cache.load(start,end),b=cache.load(start,end)
 assert.equal(calls,1,'Concurrent view/prefetch must issue only one request')
 assert.strictEqual(a,b,'Both callers must share one pending promise')
 pending.shift()()
 assert.strictEqual(await a,result)
 assert.strictEqual(await b,result)
 assert.strictEqual(cache.peek(start,end),result)
 assert.strictEqual(await cache.load(start,end),result)
 assert.equal(calls,1,'Recent snapshots must load without another Supabase read')

 now+=46
 const slowRefresh=cache.load(start,end)
 assert.strictEqual(cache.peek(start,end),result,
  'An expired snapshot must remain readable during background refresh')
 assert.equal(calls,2,'Expired cache must revalidate')
 pending.shift()()
 await slowRefresh
 assert.equal(calls,2)

 const manual=cache.load(start,end,{force:true})
 assert.equal(calls,3,'Explicit Update Shifts must bypass the cache TTL')
 pending.shift()()
 await manual

 // A failed update must not erase the previously confirmed four-week data.
 const failed=createPublicShiftCache(async()=>{
  throw Error('temporary network error')
 },45,()=>now)
 await assert.rejects(failed.load(start,end),/temporary network error/)
 assert.equal(failed.peek(start,end),null)
 assert.equal(cache.peek(start,end),result)

 const {default:ShiftsPage}=await vite.ssrLoadModule('/src/pages/ShiftsPage.tsx')
 const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ShiftsPage)))
 assert.equal((html.match(/class="shift-day /g)||[]).length,28,
  'The four-week display must still have exactly 28 day cells')
 assert.ok(html.includes('休館')&&html.includes('shift-selected-detail'),
  'Default-closed state and selected-day detail must remain intact')
 console.log('PASS: visitor shift cache, deduplication, expiry, forced reload, 28-day schedule, prefetch and shorter fades')
}finally{await vite.close()}
