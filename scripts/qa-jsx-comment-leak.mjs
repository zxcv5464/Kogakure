// Regression test: transition implementation notes must never be visible HTML.
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const vite = await createServer({
 server: { middlewareMode: true, hmr: false },
 appType: 'custom',
})
try {
 const { default: PageTransition } = await vite.ssrLoadModule('/src/components/PageTransition.tsx')
 const html = renderToStaticMarkup(createElement(
  MemoryRouter,
  { initialEntries: ['/menu'] },
  createElement(PageTransition, { introReady: true },
   () => createElement('main', null, '茶宴頁面')),
 ))
 for (const forbidden of [
  'Keep the mounted route stable',
  'Remounting a live menu',
  'would fetch Supabase twice',
 ]) assert.ok(!html.includes(forbidden), 'Internal JSX comment leaked into rendered HTML: ' + forbidden)
 assert.ok(html.includes('茶宴頁面'), 'Page content was not rendered')
 assert.ok(html.includes('route-stage'), 'Transition structure changed unexpectedly')
 console.log('PASS: no implementation comments appear in the rendered page')
} finally {
 await vite.close()
}
