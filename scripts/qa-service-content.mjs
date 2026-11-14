// Offline and schema-level regression tests for editable service descriptions.
// Does not alter the production Supabase database or touch real guest records.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import {MemoryRouter} from 'react-router-dom'
const paths=[
 'src/pages/ServicesPage.tsx','src/lib/service-content.ts',
 'src/pages/admin/ServiceManagement.tsx','src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts','scripts/prepare-pages.mjs',
 'src/pages/services-page.css','src/pages/admin/service-management.css',
 'supabase/migrations/20261115_07_service_content_management.sql',
]
const [page,lib,admin,shell,modules,pages,css,adminCss,sql]=await Promise.all(paths.map(p=>readFile(p,'utf8')))
for(const term of [
 'fetchServiceContents()','service.slug','service.category','service.paragraphs.map',
 'service.details.map','service.imageUrl','service.photoLabel','services-photo-placeholder',
]){
 assert.ok(page.includes(term),'Public service content must be dynamic: '+term)
}
for(const term of ['bath','divination','polaroid','留影之儀','拍立得合照','一瞬狐影']){
 assert.ok(lib.includes(term),'Default services and photo keepsake missing: '+term)
 assert.ok(sql.includes(term),'DB seed missing: '+term)
}
assert.ok(!page.includes('const services: ServiceFeature[]'),'Static fixed services must be removed')
assert.ok(!page.includes("imagePath: null"),'Image must now come from editable database data')
for(const term of ['saveServiceContent','deleteServiceContent','uploadServicePhoto',
 'removeUnusedServicePhoto','validateServicePhoto','fetchServiceContents(true)',
 'function createNew(){','function select(row:ServiceEntry)','service-admin-publish',
 'service-admin-upload','setEditing(dirty,busy)',
 'if(!window.confirm(','service-admin-actions',
]){
 assert.ok(admin.includes(term),'Management flow missing: '+term)
}
assert.ok(admin.includes('if(uploadedPath&&!savedToDatabase)'),
 'A failed refresh must never delete a photo already saved in the database')
assert.ok(lib.includes(".eq('updated_at',service.updatedAt)"),
 'Service writes must detect stale edits')
assert.ok(lib.includes("storage.from('service-media')"),
 'Service image uploads must use the dedicated bucket')
assert.ok(shell.includes("if(id==='accounts'||id==='services')return access.kind==='owner'"),
 'Service management must remain owner-only')
assert.ok(shell.includes('module="services"')&&shell.includes('<ServiceManagement/>'),
 'Admin module must be authorization guarded')
assert.ok(modules.includes("id: 'services'")&&modules.includes("'/admin/services'"),
 'Service editor must be listed in admin navigation')
assert.ok(pages.includes("'admin/services'"),'GitHub Pages must support direct editor URLs')
for(const phrase of [
 'create table if not exists public.service_contents',
 'alter table public.service_contents enable row level security',
 'for select to anon,authenticated using (is_published=true)',
 'for insert to authenticated with check ((select public.is_site_admin()))',
 'for update to authenticated',
 'with check ((select public.is_site_admin()))',
 'for delete to authenticated using ((select public.is_site_admin()))',
 "values('service-media','service-media',true",
 "bucket_id='service-media' and (select public.is_site_admin())",
 'on conflict(slug) do nothing',
])assert.ok(sql.includes(phrase),'Service schema and authorization missing: '+phrase)
assert.ok(!sql.includes('delete from public.booking_requests')&&!sql.includes('drop table'),
 'Service management migration must be non-destructive')
assert.ok(css.includes('.services-photo-placeholder'),'Unuploaded image placeholder must remain')
assert.ok(adminCss.includes('@media(max-width:850px)'),'Admin form must respond on mobile')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:ServicesPage}=await vite.ssrLoadModule('/src/pages/ServicesPage.tsx')
 const rendered=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ServicesPage)))
 for(const word of ['湯浴之儀','占卜之儀','留影之儀','拍立得合照','等待上傳']){
  assert.ok(rendered.includes(word),'Offline service preview missing: '+word)
 }
 const {default:ServiceManagement}=await vite.ssrLoadModule('/src/pages/admin/ServiceManagement.tsx')
 assert.equal(typeof ServiceManagement,'function')
 console.log('PASS: published dynamic service pages, polaroid intro, safe editable admin, photo placeholders, RLS and storage')
}finally{await vite.close()}
