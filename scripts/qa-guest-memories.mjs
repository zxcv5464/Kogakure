// KOGAKURE public photo delivery and moderated feedback: structural regression.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const files=[
 'src/App.tsx','src/components/Layout.tsx','src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts','src/lib/employee-accounts.ts',
 'src/pages/MemoriesPage.tsx','src/pages/admin/MemoriesManagement.tsx',
 'src/lib/guest-memories.ts','scripts/prepare-pages.mjs',
 'supabase/migrations/20261117_01_guest_memories.sql',
 'supabase/functions/guest-keepsakes/index.ts',
 'supabase/functions/manage-employee-accounts/index.ts',
]
const [app,layout,admin,modules,permissions,publicPage,manager,api,routes,sql,edge,accountsEdge]=
 await Promise.all(files.map(path=>readFile(path,'utf8')))
for(const path of [
 'src/pages/MemoriesPage.tsx','src/pages/admin/MemoriesManagement.tsx',
 'src/lib/guest-memories.ts','src/pages/AdminPage.tsx',
]){
 const source=await readFile(path,'utf8')
 const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,
  path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(ast.parseDiagnostics.length,0,'Invalid syntax in '+path)
}
const has=(source,fragments,label)=>{
 for(const fragment of fragments)assert.ok(source.includes(fragment),label+': '+fragment)
}
has(app,['path="/memories"','<MemoriesPage />'],'Public route')
has(layout,["to:'/memories'","label:'旅人繪卷'"],'Public nav')
has(routes,["'memories'","'admin/keepsakes'","'admin/feedback'"],'Deep links')
has(modules,["id: 'keepsakes'","id: 'feedback'"],'Backoffice navigation')
for(const permission of ['keepsakes.manage','feedback.manage']){
 has(permissions,[permission], 'Grantable frontend permission')
 has(accountsEdge,[permission], 'Server-side credential allowlist')
 has(sql,[permission], 'SQL authorization allowlist')
 has(admin,["permitted(access,'"+permission+"')"],'Protected manager route')
}
has(admin,['module="keepsakes"','module="feedback"'],'Protected manager UI')
has(sql,[
 'alter table public.keepsake_claims enable row level security',
 'alter table public.keepsake_photos enable row level security',
 'alter table public.guest_feedback enable row level security',
 "values('keepsake-deliveries','keepsake-deliveries',false",
 'token_sha256 text not null unique',
 "status='published'",
 'submit_guest_feedback',
 'revoke all on public.guest_feedback',
 'kogakure-keepsake-expiry',
 "grant execute on function private.check_employee_backoffice_permission(text) to authenticated",
],'Private guest media and approval-first messages')
has(edge,[
 "body.action==='cleanup'",
 'keepsake_cleanup_token_valid',
 ".lte('expires_at',new Date().toISOString())",
 ".storage.from(bucket).remove(",
 ".gt('expires_at',new Date().toISOString())",
 'createSignedUrl(',
 'Math.min(300,',
],'Expiry and short-lived signed delivery')
has(api,[
 'crypto.getRandomValues(new Uint8Array(16))',
 "crypto.subtle.digest('SHA-256'",
 "from('keepsake_claims')",
 "from('guest_feedback')",
 "rpc('submit_guest_feedback'",
 'keepsakeShareLink',
],'Browser services')
has(publicPage,[
 '狐影留帖','狐語迴音','anonymous','setAnonymous',
 '領取我的留影','留言經館方審核後才會公開',
 'lookupKeepsake(token)','photo.url',
],'Public visitor interactions')
has(manager,[
 'createKeepsake(guest,note)',
 'uploadKeepsakePhoto',
 'deleteKeepsake(claim)',
 "moderateFeedback(item.id,status",
 'deleteFeedback(item.id)',
 'newCode','newLink',
],'Backoffice workflow')
assert.ok(!sql.includes("values('keepsake-deliveries','keepsake-deliveries',true"),
 'Customer photos must never use a public Storage bucket')
console.log('PASS: private seven-day polaroid delivery, delegated backoffice and anonymous moderated feedback')
