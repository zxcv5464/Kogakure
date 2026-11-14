import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {initialMenu,sortMenu} = await vite.ssrLoadModule('/src/lib/menu-catalog.ts')
 const {default:MenuPage} = await vite.ssrLoadModule('/src/pages/MenuPage.tsx')
 assert.equal(initialMenu.categories.length,3)
 assert.equal(initialMenu.items.length,11)
 assert.deepEqual(sortMenu(initialMenu).categories.map(c=>c.name),['茶飲','和菓','御膳'])
 const expected = [
  ['月白蕎麥茶',5000], ['狐火多瑪茶',5000], ['紫宵莓果茶',5000], ['狐隱抹茶',5000],
  ['月見芝麻酥',10000], ['狐面可可脆菓',10000], ['櫻雪果凝',10000], ['九尾甜菓盛合',20000],
  ['月詠茶香',25000], ['狐火炙香',25000], ['雪月乳香',25000],
 ]
 for (const [name,price] of expected) {
  const item=initialMenu.items.find(i=>i.name===name)
  assert.ok(item,'missing '+name)
  assert.equal(item.priceGil,price,'unexpected price for '+name)
  assert.ok(initialMenu.categories.some(c=>c.id===item.categoryId),'missing category')
 }
 const html=renderToStaticMarkup(createElement(MenuPage))
 assert.equal((html.match(/class="tea-menu-section"/g)||[]).length,3)
 assert.equal((html.match(/class="tea-menu-item"/g)||[]).length,11)
 for(const [name] of expected)assert.ok(html.includes(name),'not rendered '+name)
 assert.ok(html.includes('狐之茶宴'))
 assert.ok(html.includes('點選御品旁的'),'Empty cart should invite the traveler to select dishes')
 assert.ok(!html.includes('複製點單'),'The obsolete copy button must be removed')
 assert.ok(html.includes('展示菜單'),'fallback must identify demo data')
 assert.ok(!html.includes('內容籌備中'),'legacy placeholder found')
 const sql=await readFile('supabase/migrations/20261113_01_menu.sql','utf8')
 for(const required of ['create table if not exists public.menu_categories','create table if not exists public.menu_items','enable row level security','public.is_site_admin()', 'on conflict (id) do nothing'])assert.ok(sql.includes(required),'missing SQL '+required)
 console.log('PASS: 3 sections / 11 items / correct Gil pricing / SSR menu / migration RLS checks')
} finally {await vite.close()}
