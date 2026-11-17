// KOGAKURE public photo delivery and moderated feedback: structural regression.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {runInNewContext} from 'node:vm'

const files=[
 'src/App.tsx','src/components/Layout.tsx','src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts','src/lib/employee-accounts.ts',
 'src/pages/MemoriesPage.tsx','src/pages/admin/MemoriesManagement.tsx',
 'src/lib/guest-memories.ts','scripts/prepare-pages.mjs',
 'supabase/migrations/20261117_01_guest_memories.sql',
 'supabase/migrations/20261117_02_keepsake_code_retrieval.sql',
 'supabase/migrations/20261117_03_manual_keepsake_claim_codes.sql',
 'supabase/migrations/20261117_04_rate_limit_short_keepsake_claims.sql',
 'supabase/migrations/20261117_05_manual_alphanumeric_8_to_16_keepsake_codes.sql',
 'supabase/functions/guest-keepsakes/index.ts',
 'supabase/functions/manage-employee-accounts/index.ts',
]
const [app,layout,admin,modules,permissions,publicPage,manager,api,routes,sql,codeSql,manualSql,limitSql,shortSql,edge,accountsEdge]=
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
has(api,["/^[A-Z0-9]{8,16}$/", "rpc('update_keepsake_claim_code'"],'Input and code update validation')
has(publicPage,['maxLength={48}','輸入館方提供的專屬領取碼'],'Public code form accepts custom labels')
has(edge,["/^[a-z0-9]{8,32}$/.test(token)",".replace(/[\\s-]/g,'').toLowerCase()"],'Public lookup normalizes 8–16 and legacy codes')
has(publicPage,[
 'className="memories-keepsake-intro"',
 '將今夜的月色，輕輕收進相片。',
 '請輸入館方交付的專屬領取碼，',
 'const [anonymous,setAnonymous]=useState(false)',
],'Split visitor instructions and named-first feedback')
assert.ok(!publicPage.includes('const [anonymous,setAnonymous]=useState(true)'),
 'Guest feedback must not silently default to anonymous')
has(manager,[
 '確認修改領取碼',
 'minLength={8} maxLength={16} pattern="[A-Za-z0-9]{8,16}"',
 'window.confirm(',
],'Existing claim edits require explicit confirmation')
has(manager,[
 'placeholder="例如：KOGAKURE26"',
 'placeholder="自行設定 8～16 位英數字"',
 'setEditCode(\'\');setEditClaim(claim.id);setError(\'\')',
],'New and existing delivery codes must be manually entered')
assert.ok(!manager.includes('generateKeepsakeCode')&&
 !manager.includes('重新產生4位數字')&&
 !manager.includes('memories-regenerate-code')&&
 !api.includes('generateKeepsakeCode'),
 'The old automatic random code generation UI and helper must be removed')
has(shortSql,[
 "v_display !~ '^[A-Z0-9]{8,16}$'",
 'v_normalized text:=lower(v_display);',
 'public.create_keepsake_claim(',
 'public.update_keepsake_claim_code(',
 "has_backoffice_permission('keepsakes.manage')",
 'grant execute on function public.update_keepsake_claim_code(uuid,text) to authenticated',
],'Server-side 8–16 alphanumeric code validation, scoped to authorized staff')
assert.ok(shortSql.split("v_display !~ '^[A-Z0-9]{8,16}$'").length===3,
 'Both creation and existing-code replacement must enforce the new format')
assert.ok(!shortSql.includes("reveal_keepsake_claim_code("),
 'Historic code retrieval must remain compatible and unchanged')

// Exercise the pure validation helper in isolation without DB/session access.
const validationSource=api.slice(
 api.indexOf('export function validateKeepsakeCode('),
 api.indexOf('export async function createKeepsake('))
const compiled=ts.transpileModule(validationSource,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText
const isolatedExports={}
runInNewContext(compiled,{exports:isolatedExports,Error})
const validate=isolatedExports.validateKeepsakeCode
assert.equal(validate('abc12345'),'ABC12345','Eight characters must be accepted case-insensitively')
assert.equal(validate('Ab12Cd34Ef56Gh78'),'AB12CD34EF56GH78','Sixteen characters must be accepted')
for(const invalid of [
 'ABC1234','ABCDEFGHIJKLMNOPQ','ABC-12345','AB_12345','AB 12345','密碼123456',
])assert.throws(()=>validate(invalid),'Reject code outside 8–16 alphanumeric rule: '+invalid)
has(limitSql,[
 'create table if not exists private.keepsake_lookup_quota',
 'alter table private.keepsake_lookup_quota enable row level security',
 'private.keepsake_lookup_quota',
 'create or replace function public.reserve_keepsake_lookup(',
 'insert into private.keepsake_lookup_quota(',
 'hits<=8 else hits<=20',
 'grant execute on function public.reserve_keepsake_lookup(text,text) to service_role',
 'revoke all on function public.reserve_keepsake_lookup(text,text)',
 'create or replace function public.purge_keepsake_lookup_quota()',
],'Private per-client and prefix-wide anti-enumeration budget')
has(edge,[
 "rpc('reserve_keepsake_lookup'",
 "rpc('purge_keepsake_lookup_quota')",
 "data:allowed",
 "'short:'+token.slice(0,-4)",
 "if(allowed!==true)return reply(",
 "429,origin",
],'Public album lookup must enforce numeric short-code anti-brute-force limits')
assert.ok(!edge.includes('const digest=await crypto.subtle.digest'),
 'Public album lookup should reuse one consistent SHA-256 helper for tokens and hashed quota keys')
assert.ok(!api.includes('crypto.getRandomValues(new Uint8Array(16))'),
 'Backoffice must require staff-chosen code rather than issuing automatic random tokens')
assert.ok(!api.includes("token_sha256:sha"),
 'Clients may not create unrecoverable legacy claim records')
assert.ok(!sql.includes("values('keepsake-deliveries','keepsake-deliveries',true"),
 'Customer photos must never use a public Storage bucket')
console.log('PASS: manually entered 8–16 alphanumeric claim codes, legacy redemption, rate limits, seven-day delivery and moderated feedback')
