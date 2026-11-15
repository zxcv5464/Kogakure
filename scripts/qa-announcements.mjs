// Read-only regression QA for published home announcements and protected admin editing.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {createServer} from 'vite'

const paths=[
 'src/pages/OtherPages.tsx',
 'src/components/HomeAnnouncements.tsx',
 'src/components/home-announcements.css',
 'src/pages/home-page.css',
 'src/pages/admin/AnnouncementManagement.tsx',
 'src/pages/admin/announcement-management.css',
 'src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts',
 'src/lib/announcements.ts',
 'supabase/migrations/20261115_27_site_announcements.sql',
 'scripts/prepare-pages.mjs',
]
const [home,board,boardStyles,homeStyles,adminEditor,adminStyles,admin,modules,api,migration,routes]=
 await Promise.all(paths.map(path=>readFile(path,'utf8')))
assert.ok(home.includes('<HomeAnnouncements/>')&&home.includes('<Link className="primary-link"'),
 'The new board must coexist with the original branded homepage and CTA')
assert.ok(board.includes("role=\"tablist\"")&&
 board.includes('館內公告')&&board.includes('最新消息')&&
 board.includes("role=\"dialog\"")&&board.includes('createPortal')&&
 board.includes('aria-modal="true"')&&board.includes("onClick={()=>setActive(item)}")&&
 board.includes('setInterval(onFocus,45000)')&&
 board.includes('visibilitychange')&&board.includes('Escape'),
 'Public announcements must offer categories, accessible full details and live refresh')
assert.ok(boardStyles.includes('.home-news')&&boardStyles.includes('.home-news-dialog')&&
 boardStyles.includes('@media(max-width:570px)')&&homeStyles.includes('.home-news-list'),
 'Responsive board must be part of homepage composition')
assert.ok(modules.includes("id: 'announcements'")&&
 modules.includes("path: '/admin/announcements', status: 'available'")&&
 !modules.includes("id: 'announcements', title: '公告管理', summary: '館內公告、最新消息與首頁資訊', icon: FileText, status: 'planned'"),
 'Existing planned announcements module must become a real backoffice page')
assert.ok(admin.includes("const AnnouncementManagement = lazy(")&&
 admin.includes("id==='accounts'||id==='services'||id==='announcements'")&&
 admin.includes('<ProtectedModule access={access} module="announcements">')&&
 routes.includes("'admin/announcements'")&&
 routes.includes("'admin/announcements': '公告管理'"),
 'Newsroom must be accessible only to owner and support direct GitHub Pages refresh')
assert.ok(adminEditor.includes('fetchAdminAnnouncements')&&
 adminEditor.includes('saveAnnouncement')&&
 adminEditor.includes('deleteAnnouncement')&&
 adminEditor.includes('公告類別')&&adminEditor.includes('對外發布')&&
 adminEditor.includes('置頂此公告')&&adminEditor.includes('useAdminEditGuard')&&
 adminStyles.includes('@media(max-width:900px)'),
 'Newsroom must manage publication, reorder priority and drafts with navigation guard')
assert.ok(api.includes(".eq('is_published',true)")&&
 api.includes("order('is_pinned',{ascending:false})")&&
 api.includes("order('published_at',{ascending:false})")&&
 api.includes(".limit(60)")&&
 api.includes("if(!configured)return []")&&
 api.includes("new Error('公告儲存失敗")&&
 !api.includes('.rpc('),
 'Public feed uses safely limited direct reads and owner RLS for writes')
for(const term of [
 'alter table public.site_announcements enable row level security',
 'using (is_published=true)',
 'for select to anon,authenticated',
 'for select to authenticated using ((select public.is_site_admin()))',
 'for insert to authenticated with check ((select public.is_site_admin()))',
 'for update to authenticated',
 'for delete to authenticated using ((select public.is_site_admin()))',
 'grant select on public.site_announcements to anon,authenticated',
 "check(category in ('notice','news'))",
 'create trigger touch_site_announcements',
]){
 assert.ok(migration.includes(term),'Missing RLS, publication or validation: '+term)
}
assert.ok(!migration.includes('insert into public.site_announcements')&&
 !migration.includes('grant insert,update,delete on public.site_announcements to anon'),
 'No unapproved announcement content is seeded or writable by guests')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {validateAnnouncement,fetchPublicAnnouncements}=await vite.ssrLoadModule('/src/lib/announcements.ts')
 const proper={category:'notice',title:'營業消息',content:'月夜相見',pinned:true,published:false}
 assert.equal(validateAnnouncement(proper),null)
 assert.equal(validateAnnouncement({...proper,title:'   '}),'公告標題需為 1～100 字')
 assert.equal(validateAnnouncement({...proper,content:' '}),'請填寫公告內文')
 assert.equal(validateAnnouncement({...proper,category:'invalid'}),'請選擇館內公告或最新消息')
 assert.equal(validateAnnouncement({...proper,content:'長'.repeat(3001)}),'公告內文最多 3000 字')
 assert.deepEqual(await fetchPublicAnnouncements(),[],'Offline preview must not make any real queries')
 const {HomePage}=await vite.ssrLoadModule('/src/pages/OtherPages.tsx')
 const homepage=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(HomePage)))
 assert.ok(homepage.includes('館內公告')&&homepage.includes('最新消息')&&
 homepage.includes('狐隱手帖')&&homepage.includes('邂逅狐姬')&&
 homepage.includes('home-news'),
 'Home board should render even without a network request, preserving original branding')
 const {default:AnnouncementManagement}=await vite.ssrLoadModule('/src/pages/admin/AnnouncementManagement.tsx')
 const {AdminEditGuardProvider}=await vite.ssrLoadModule('/src/pages/admin/AdminEditGuard.tsx')
 const editor=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(AdminEditGuardProvider,null,createElement(AnnouncementManagement))))
 assert.ok(editor.includes('館內公告・最新消息')&&editor.includes('新增公告')&&editor.includes('公告列表'))
 console.log('PASS: owner-only notice publishing, safe public categories, direct admin route, public first paint and responsive board')
}finally{await vite.close()}
