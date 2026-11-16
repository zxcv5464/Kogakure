// Check official FFXIV TC World list, unified guest UI and former name limits.
// No live database writes or network access.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import ts from 'typescript'

const sources=[
 'src/components/TcWorldSelect.tsx','src/pages/MenuPage.tsx',
 'src/pages/BookingPage.tsx','src/pages/admin/AdminBookingCreate.tsx',
 'src/lib/tea-orders.ts','src/pages/menu-page.css',
 'supabase/migrations/20261117_01_tc_world_dropdown_unlimited_guest_name.sql',
]
const [component,menu,booking,admin,orders,css,sql]=await Promise.all(sources.map(x=>readFile(x,'utf8')))
for(const path of sources.filter(p=>p.endsWith('.tsx')||p.endsWith('.ts'))){
 const source=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true,
  path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(source.parseDiagnostics.length,0,'Invalid TS: '+path)
}
for(const field of [menu,booking,admin]){
 assert.ok(field.includes('TcWorldSelect')&&field.includes('onChange={set')&&
  !field.includes('maxLength={48}')&&!field.includes('minLength={2}'),
  'Tea checkout and both nomination forms must use the same World dropdown and unrestricted guest names')
}
assert.ok(css.includes('.tea-menu-order-fields input,.tea-menu-order-fields select'),
 'Tea World dropdown must match existing mobile-friendly inputs')
assert.ok(orders.includes('if(!name||!world)')&&!orders.includes('name.length>48'),
 'Tea ordering must no longer enforce the old 48-character limit')
for(const piece of ['tea_orders_guest_name_check','tea_orders_guest_world_check',
 'booking_requests_guest_name_check','booking_requests_guest_world_check',
 "pg_get_functiondef('private.submit_tea_order", "pg_get_functiondef('public.submit_booking_request",
 'btrim(guest_name)', 'btrim(guest_world)', 'execute fn_text']){
 assert.ok(sql.includes(piece),'Database compatibility patch missing: '+piece)
}
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const mod=await vite.ssrLoadModule('/src/components/TcWorldSelect.tsx')
 assert.deepEqual([...mod.TC_WORLDS],
  ['伊弗利特','迦樓羅','利維坦','鳳凰','奧汀','巴哈姆特','泰坦'])
 const html=renderToStaticMarkup(createElement(mod.default,{value:'利維坦',onChange:()=>{}}))
 assert.equal((html.match(/<option /g)||[]).length,8,'Placeholder + all seven current Worlds')
 assert.ok(html.includes('<select required')&&html.includes('value="利維坦"')===false)
 assert.ok(html.includes('selected=""')&&html.includes('利維坦'),'Controlled select must preserve its selection')
 assert.ok(html.includes('請選擇所在伺服器'))
 console.log('PASS: official TC World list, consistent dropdowns, unlimited guest name inputs and backend migration')
}finally{await vite.close()}
