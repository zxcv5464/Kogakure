// Regression guard: the menu must not reveal a temporary lazy fallback,
// replace it with a second loader, then remount/re-query after the Logo intro.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const [page,transition,app,events,motion,loader] = await Promise.all([
 'src/pages/MenuPage.tsx','src/components/PageTransition.tsx','src/App.tsx',
 'src/lib/route-events.ts','src/components/route-motion.css',
 'src/components/MenuLoading.tsx',
].map(file => readFile(file,'utf8')))

assert.ok(events.includes('MENU_PAGE_READY_EVENT'), 'Menu readiness event missing')
assert.ok(page.includes("if (mode !== 'loading') window.dispatchEvent(new Event(MENU_PAGE_READY_EVENT))"), 'Only signal readiness after data settles')
assert.ok(page.includes("if (mode === 'loading') return <MenuLoading />"), 'Keep one stable loader during Supabase fetch')
assert.ok(app.includes("location.pathname === '/menu' ? <MenuLoading />"), 'Menu lazy fallback must be identical to data loader')
assert.ok(transition.includes("location.pathname === '/menu' ? MENU_PAGE_READY_EVENT"), 'The curtain must wait for menu data')
assert.ok(transition.includes('if (readyEvent) window.addEventListener(readyEvent, onPageReady)'), 'Readiness listener must be registered')
assert.ok(transition.includes('if (readyEvent) window.removeEventListener(readyEvent, onPageReady)'), 'Readiness listener must be removed')
assert.ok(transition.includes('key={displayed.pathname}'), 'Intro should never remount an already loading route')
assert.ok(!transition.includes('key={`${displayed.pathname}-${introReady}`}', 'Old intro key causes duplicate data loads')
assert.ok(motion.includes('.route-stage.intro-waiting :is('), 'Pause home animations instead of remounting during intro')
assert.ok(loader.includes('tea-menu-loading'), 'Shared loader must be used')

const vite = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {default:MenuLoading} = await vite.ssrLoadModule('/src/components/MenuLoading.tsx')
 const html = renderToStaticMarkup(createElement(MenuLoading))
 assert.ok(html.includes('茶寮正為旅人備妥御品'), 'Loading message absent')
 assert.ok(html.includes('role="status"'), 'Accessible load status missing')
} finally {await vite.close()}

console.log('PASS: stable menu loader, route data readiness gate, one intro mount and retained entrances')
