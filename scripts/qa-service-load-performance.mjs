// Ensure public services avoid repeated queries and excessive image work.
// No production DB access, no data writes and no network dependency.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {createServer} from 'vite'

const [page,cacheSource,prefetch,layout,gallery,motion,admin]=await Promise.all([
 'src/pages/ServicesPage.tsx','src/lib/public-services.ts',
 'src/lib/prefetch.ts','src/components/Layout.tsx',
 'src/components/ServicePhotoGallery.tsx','src/components/route-motion.css',
 'src/pages/admin/ServiceManagement.tsx',
].map(path=>readFile(path,'utf8')))

assert.ok(page.includes('peekPublicServices()')&&page.includes('loadPublicServices()'),
 'Public service page should reuse its published-content cache')
assert.ok(page.includes('!loading&&entries.map('),
 'Keep cached service descriptions visible when revalidation fails')
assert.ok(cacheSource.includes('CACHE_TTL_MS=45_000')&&cacheSource.includes('if(pending)return pending'),
 'Cache must expire quickly and deduplicate overlapping visitor requests')
assert.ok(!admin.includes('loadPublicServices')&&!admin.includes('peekPublicServices'),
 'Admin service editor must bypass the public cache to see new edits and drafts')
assert.ok(prefetch.includes('export function prefetchServicesPage():void')&&
 prefetch.includes('prefetchPublicServices()'),
 'Load published services on navigation intent, not automatically on home')
assert.ok(layout.includes("to==='/services'?prefetchServicesPage"),
 'Desktop and mobile navigation should warm the services content')
assert.ok(gallery.includes('IntersectionObserver')&&gallery.includes('nearViewport')&&
 gallery.includes('document.visibilityState'),
 'Offscreen and background tabs should pause service photo rotation')
assert.ok(gallery.includes('image.decode().then(ready,ready)')&&
 gallery.includes('indices:[number,number]'),
 'Images should decode before fade and stay in two reusable layers')
assert.ok(motion.includes('.route-stage .services-feature{animation:quietRise .85s')&&
 motion.includes('.route-stage .services-feature:nth-child(n+3){animation-delay:.62s}'),
 'Service cards should fade smoothly without multi-second stagger delays')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {createPublicServiceCache}=await vite.ssrLoadModule('/src/lib/public-services.ts')
 let clock=1000,requests=0
 const resolvers=[]
 const rows=[{id:'service-1'}]
 const cache=createPublicServiceCache(async()=>{
  requests++
  await new Promise(resolve=>resolvers.push(resolve))
  return rows
 },45,()=>clock)

 const a=cache.load(),b=cache.load()
 assert.equal(requests,1,'Concurrent entry and prefetch should share a single database request')
 assert.strictEqual(a,b,'Readers must share the in-flight promise')
 resolvers.shift()()
 assert.strictEqual(await a,rows)
 assert.strictEqual(await b,rows)
 assert.strictEqual(cache.peek(),rows)
 assert.strictEqual(await cache.load(),rows)
 assert.equal(requests,1,'Fresh results must not require another read')
 clock+=46
 const refresh=cache.load()
 assert.equal(requests,2,'Expired data must be revalidated')
 assert.strictEqual(cache.peek(),rows,'Retain old public results until refresh finishes')
 resolvers.shift()()
 await refresh
 const forced=cache.load({force:true})
 assert.equal(requests,3,'Explicit forced loads must bypass TTL')
 resolvers.shift()()
 await forced

 const {default:ServicePhotoGallery}=await vite.ssrLoadModule('/src/components/ServicePhotoGallery.tsx')
 const {previewServices}=await vite.ssrLoadModule('/src/lib/service-content.ts')
 const twelve=renderToStaticMarkup(createElement(ServicePhotoGallery,{
  service:{...previewServices[0],imageUrls:Array.from({length:12},(_,i)=>'https://example.invalid/'+i+'.webp')},
  number:'01',
 }))
 assert.equal((twelve.match(/class="services-photo-slide(?: is-visible)?"/g)||[]).length,2,
  'Twelve photos must not render twelve full-size offscreen image elements')
 assert.ok(twelve.includes('01 / 12'),'First image should still display slideshow position')
 assert.ok(twelve.includes('services-photo-counter'),
  'Rotating gallery needs its original counter')
 const {default:ServicesPage}=await vite.ssrLoadModule('/src/pages/ServicesPage.tsx')
 const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ServicesPage)))
 assert.ok(html.includes('湯浴之儀')&&html.includes('占卜之儀')&&html.includes('留影之儀'),
  'Offline service preview must preserve all three published service categories')
 assert.ok(html.includes('services-photo-placeholder'),
  'Missing photos must still render existing matching-design placeholders')
 console.log('PASS: service content cache and dedup, stale-while-refresh, intent prefetch, 2-layer gallery, slow-motion mitigation and all 3 service categories')
}finally{await vite.close()}
