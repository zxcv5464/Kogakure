// BGM management and existing header player regression; no account or
// production database changes are made by this test.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import ts from 'typescript'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

const files=[
 'src/components/SiteBgm.tsx','src/components/site-bgm.css',
 'src/lib/site-bgm.ts','src/pages/admin/BgmManagement.tsx',
 'src/pages/admin/bgm-management.css','src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts','src/lib/employee-accounts.ts',
 'scripts/prepare-pages.mjs',
 'supabase/functions/manage-employee-accounts/index.ts',
 'supabase/migrations/20261116_03_bgm_management.sql',
]
const [player,styles,lib,management,css,admin,modules,accounts,routes,edge,sql]=
 await Promise.all(files.map(f=>readFile(f,'utf8')))
for(const f of files.filter(f=>/\.tsx?$/.test(f))){
 const source=ts.createSourceFile(f,await readFile(f,'utf8'),ts.ScriptTarget.Latest,true,
  f.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(source.parseDiagnostics.length,0,'Invalid TSX/TS: '+f)
}
assert.ok(admin.includes("if(id==='bgm')return permitted(access,'bgm.manage')")&&
 admin.includes('<ProtectedModule access={access} module="bgm">')&&
 admin.includes('<BgmManagement/>')&&
 modules.includes("id: 'bgm'")&&
 routes.includes("'admin/bgm'")&&
 accounts.includes("id:'bgm.manage'")&&edge.includes("'bgm.manage'"),
 'BGM settings must have its own grantable and guarded admin route')
assert.ok(sql.includes('create table if not exists public.site_bgm_settings')&&
 sql.includes("default 'default'")&&
 sql.includes("values(1,true,'default'")&&
 sql.includes('alter table public.site_bgm_settings enable row level security')&&
 sql.includes("has_backoffice_permission('bgm.manage')")&&
 sql.includes('grant select on public.site_bgm_settings to anon,authenticated')&&
 sql.includes("storage.buckets")&&sql.includes("'bgm-media'")&&
 sql.includes("'tracks'")&&sql.includes('20971520')&&
 sql.includes('private.check_employee_backoffice_permission'),
 'New settings and media bucket must retain the default track and enforce manager-only writes')
for(const token of [
 'readPublicBgm()','currentAudioUrl(settings)','const request=audio.play()',
 'audio.volume=config.volume','audioRef.current?.pause()',
 'onRegisterStart?.(startMusic)','<audio ref={audioRef}',
 'site-bgm-toggle','window.setInterval','const youtubeId=',
 'site-bgm-youtube','www.youtube-nocookie.com/embed/',
 'setYoutubeOpen(false)','allow="autoplay; encrypted-media; picture-in-picture; fullscreen"',
]){
 assert.ok(player.includes(token),'Existing SiteBgm player must keep its functionality: '+token)
}
assert.ok(!player.includes('site-bgm-entry-backdrop')&&
 styles.includes('width:40px;height:40px')&&
 styles.includes('.site-bgm-youtube iframe')&&
 styles.includes('height:210px;min-height:200px'),
 'YouTube must use a visible, full-size official iframe while retaining the original header toggle')
for(const token of [
 'readAdminBgm()','listUploadedBgm()','uploadBgm(file)',
 'setDraft(old=>({...old,source:',"source:'upload'",
 'saveBgm(draft)','deleteUploadedBgm(file.path)',
 'YouTube 影片網址','直接音訊檔網址','原本背景音樂',
 '上傳音樂檔','音樂名稱','儲存並發布',
 'bgm-admin-youtube','BGM_MAX_BYTES',
]){
 assert.ok(management.includes(token),'Manager must support live settings, uploads, direct URLs and YouTube: '+token)
}
assert.ok(!management.includes('bgm-admin-volume')&&
 !management.includes('type="range"')&&
 !management.includes("patch('volume'")&&
 !css.includes('.bgm-admin-volume')&&
 lib.includes('volume:DEFAULT_BGM.volume'),
 'BGM admin must hide volume controls and publish the fixed default 24% volume')
assert.ok(css.includes('@media(max-width:560px)')&&
 css.includes('.bgm-admin-main')&&css.includes('.bgm-admin-upload'),
 'BGM editor should be responsive on phones')
assert.ok(lib.includes("rpc(")===false&&
 lib.includes("from('site_bgm_settings')")&&
 lib.includes("storage.from(BGM_BUCKET).upload(")&&
 lib.includes("storage.from(BGM_BUCKET).list(")&&
 lib.includes('new URL(input)')&&
 lib.includes('audio/mpeg')&&
 lib.includes('DEFAULT_BGM_URL'),
 'BGM source validation and upload must use current Supabase storage without extra credentials')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const mod=await vite.ssrLoadModule('/src/lib/site-bgm.ts')
 const base={...mod.DEFAULT_BGM}
 assert.equal(mod.DEFAULT_BGM_URL,'https://bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3')
 assert.equal(mod.currentAudioUrl(base),mod.DEFAULT_BGM_URL)
 assert.equal(mod.youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),'dQw4w9WgXcQ')
 assert.equal(mod.youtubeVideoId('https://youtu.be/dQw4w9WgXcQ'),'dQw4w9WgXcQ')
 assert.equal(mod.youtubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'),'dQw4w9WgXcQ')
 assert.equal(mod.youtubeVideoId('https://evil-youtube.com/watch?v=dQw4w9WgXcQ'),null)
 assert.equal(mod.youtubeVideoId('javascript:alert(1)'),null)
 assert.equal(mod.checkBgm({...base,source:'youtube',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}),null)
 assert.equal(mod.checkBgm({...base,source:'youtube',url:'https://youtube.com/playlist?list=PLtest'})!==null,true)
 assert.equal(mod.checkBgm({...base,source:'direct',url:'https://example.org/track.mp3?sig=123'}),null)
 assert.equal(mod.checkBgm({...base,source:'direct',url:'https://example.org/index.html'})!==null,true)
 assert.equal(mod.checkBgm({...base,source:'direct',url:'http://example.org/track.mp3'})!==null,true)
 const {default:BgmManagement}=await vite.ssrLoadModule('/src/pages/admin/BgmManagement.tsx')
 const {AdminEditGuardProvider}=await vite.ssrLoadModule('/src/pages/admin/AdminEditGuard.tsx')
 const html=renderToStaticMarkup(createElement(AdminEditGuardProvider,null,createElement(BgmManagement)))
 assert.ok(html.includes('正在讀取館內音樂設定')&&html.includes('背景音樂管理'))
 console.log('PASS: existing header player, visible YouTube embed, authorized upload/library and BGM editor')
}finally{await vite.close()}
