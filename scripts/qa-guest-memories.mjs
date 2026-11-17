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
 'supabase/migrations/20261117_02_keepsake_code_retrieval.sql',
 'supabase/migrations/20261117_03_manual_keepsake_claim_codes.sql',
 'supabase/functions/guest-keepsakes/index.ts',
 'supabase/functions/manage-employee-accounts/index.ts',
]
const [app,layout,admin,modules,permissions,publicPage,manager,api,routes,sql,codeSql,manualSql,edge,accountsEdge]=
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
 'validateKeepsakeCode(code)',
 "rpc('create_keepsake_claim'",
 "rpc('update_keepsake_claim_code'",
 "rpc('reveal_keepsake_claim_code'",
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
 'createKeepsake(guest,note,claimCode)',
 'changeClaimCode(e,claim)',
 'updateKeepsakeCode(claim.id,nextCode)',
 '專屬領取碼（由後台自行設定）','修改領取碼','取消變更',
 'uploadKeepsakePhoto',
 'deleteKeepsake(claim)',
 "moderateFeedback(item.id,status",
 'deleteFeedback(item.id)',
 'newCode','newLink','toggleClaimCode(claim)','revealKeepsakeCode(claim.id)',
 '顯示領取碼','複製領取碼','複製連結',
],'Backoffice workflow')
has(codeSql,[
 'create table if not exists private.keepsake_claim_codes',
 'encrypted_code bytea not null',
 'alter table private.keepsake_claim_codes enable row level security',
 'create or replace function public.create_keepsake_claim(',
 'create or replace function public.reveal_keepsake_claim_code(',
 "has_backoffice_permission('keepsakes.manage')",
 "extensions.pgp_sym_encrypt(",
 "extensions.pgp_sym_decrypt(",
 "extensions.digest(v_code,'sha256')",
 "grant execute on function public.reveal_keepsake_claim_code(uuid) to authenticated",
 "revoke insert,update on public.keepsake_claims from authenticated",
 "c.expires_at>now()",
],'Operators can recover encrypted codes but guests cannot')
// Staff-defined codes keep the same protected backend and do not allow guests
// to select private claim records, bypass seven-day expiry or see plaintext.
has(manualSql,[
 'create or replace function public.create_keepsake_claim(',
 'create or replace function public.update_keepsake_claim_code(',
 'create or replace function public.reveal_keepsake_claim_code(',
 "has_backoffice_permission('keepsakes.manage')",
 'v_normalized text:=lower(replace(v_display',
 "extensions.digest(v_normalized,'sha256')",
 'update private.keepsake_claim_codes set',
 'for update;',
 'c.expires_at>now()',
 'where id=p_claim_id and expires_at>now()',
 'return upper(v_plain)',
 'revoke all on function public.update_keepsake_claim_code(uuid,text) from public,anon,authenticated',
 'grant execute on function public.update_keepsake_claim_code(uuid,text) to authenticated',
],'Permission-checked, reversible admin codes with legacy compatibility')
has(api,['normalized.length<12','normalized.length>32',"rpc('update_keepsake_claim_code'"],'Input and code update validation')
has(publicPage,['maxLength={48}','輸入館方提供的專屬領取碼'],'Public code form accepts custom labels')
has(edge,["/^[a-z0-9]{12,32}$/.test(token)",".replace(/[\\s-]/g,'').toLowerCase()"],'Public lookup normalizes custom and legacy codes')
assert.ok(!api.includes('crypto.getRandomValues(new Uint8Array(16))'),
 'Backoffice must require staff-chosen code rather than issuing automatic random tokens')
assert.ok(!api.includes("token_sha256:sha"),
 'Clients may not create unrecoverable legacy claim records')
assert.ok(!sql.includes("values('keepsake-deliveries','keepsake-deliveries',true"),
 'Customer photos must never use a public Storage bucket')
console.log('PASS: manually chosen and replaceable private claim codes, legacy compatibility, seven-day delivery and moderated feedback')
