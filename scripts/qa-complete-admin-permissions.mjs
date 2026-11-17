// KOGAKURE module-level authorization regression; no real accounts are mutated.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import ts from 'typescript'

const paths=[
 'src/lib/employee-accounts.ts','src/pages/AdminPage.tsx',
 'src/pages/admin/EmployeeAccountsManagement.tsx',
 'src/pages/admin/ShiftManagement.tsx',
 'src/pages/admin/modules.ts',
 'supabase/migrations/20261115_28_complete_admin_module_permissions.sql',
 'supabase/migrations/20261116_03_bgm_management.sql',
 'supabase/migrations/20261117_01_guest_memories.sql',
 'supabase/functions/manage-employee-accounts/index.ts',
]
const [accounts,admin,accountEditor,shifts,modules,sql,bgmSql,memorySql,edge]=
 await Promise.all(paths.map(p=>readFile(p,'utf8')))
for(const file of paths.filter(p=>/\.(tsx|ts)$/.test(p))){
 const ast=ts.createSourceFile(file,await readFile(file,'utf8'),
  ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(ast.parseDiagnostics.length,0,'Invalid TypeScript in '+file)
}
const permissions=[
 'accounts.manage','staff.manage','announcements.manage','bgm.manage','accounting.manage',
 'menu.manage','services.manage','orders.manage','booking.manage',
 'keepsakes.manage','feedback.manage','shifts.manage','shifts.attend',
]
for(const id of permissions){
 assert.ok(accounts.includes("id:'"+id+"'"),'Missing frontend grantable permission: '+id)
 assert.ok((id==='bgm.manage'?bgmSql:id==='keepsakes.manage'||id==='feedback.manage'?memorySql:sql).includes("'"+id+"'"),'Missing SQL permission allowlist: '+id)
 assert.ok(edge.includes("'"+id+"'"),'Missing credential-service permission allowlist: '+id)
}
assert.ok(bgmSql.includes('private.check_employee_backoffice_permission')&&
 bgmSql.includes("'bgm.manage'")&&
 bgmSql.includes("bucket_id='bgm-media'")&&
 bgmSql.includes("has_backoffice_permission('bgm.manage')"),
 'BGM role must have independent database, media and table-level guards')
assert.ok(sql.includes('private.check_employee_backoffice_permission')&&
 sql.includes('security definer set search_path')&&
 sql.includes('security invoker set search_path')&&
 sql.includes('auth.uid()')&&
 sql.includes('and a.active=true')&&
 sql.includes('p_permission=any(a.permissions)'),
 'Access must use an active authenticated account and recursion-safe private lookup')
for(const id of ['accounts.manage','services.manage','announcements.manage','bgm.manage','shifts.manage']){
 assert.ok(admin.includes("permitted(access,'"+id+"')"),
  'Admin route must enforce assigned '+id)
}
assert.ok(admin.includes("permitted(access,'shifts.attend')")&&
 admin.includes('<ProtectedModule access={access} module="accounts">')&&
 admin.includes('<ProtectedModule access={access} module="announcements">')&&
 admin.includes('<ProtectedModule access={access} module="bgm">')&&
 admin.includes('<ProtectedModule access={access} module="services">')&&
 admin.includes('<EmployeeAccountsManagement access={access}/>'),
 'Direct routes and all workspaces must be protected')
assert.ok(shifts.includes("permitted(access,'shifts.manage')")&&
 shifts.includes("access.kind==='owner'?onMarkOwn")&&
 shifts.includes("access.kind==='owner'?'owner':'employee'"),
 'Delegated scheduler must not impersonate owner for self attendance')
for(const phrase of [
 "'services.manage'","'announcements.manage'","'shifts.manage'","'shifts.attend'",
 'create policy "permitted operators read service drafts"',
 'create policy "permitted operators create announcements"',
 "bucket_id='service-media'",
 'create policy "permitted schedulers add opening dates"',
 'create policy "permitted shift signups"',
 "grant execute on function private.check_employee_backoffice_permission(text) to authenticated",
 'alter table public.employee_accounts',
 'set permissions=array_append(permissions,\'shifts.attend\')',
]){
 assert.ok(sql.includes(phrase),'Missing server-side module authorization: '+phrase)
}
assert.ok(sql.includes('using ((select public.has_backoffice_permission')&&
 sql.includes('with check ((select public.has_backoffice_permission'),
 'Write permissions must be RLS-protected, not merely hidden in the UI')
assert.ok(edge.includes('operatorScope(user.id)')&&
 edge.includes('canManageTarget(scope,user.id,id)')&&
 edge.includes("id!=='accounts.manage'&&actor.grants.has(id)")&&
 edge.includes("previous.includes('accounts.manage')")&&
 edge.includes("actorId===targetId||await isManager(targetId)")&&
 edge.includes('canGrant(scope,permissions)')&&
 edge.includes('service.auth.getUser(token)')&&
 edge.includes('validatedPermissions(body.permissions)')&&
 !edge.includes('inviteUserByEmail'),
 'Credential manager cannot escalate access, manage own/peer/owner accounts, or send invitation email')
assert.ok(accountEditor.includes('disabled={busy||!canGrant(permission.id)}')&&
 accountEditor.includes('canEditAccount(record)')&&
 accountEditor.includes('沒有的功能權限'),
 'Delegated account manager UI must not allow higher-privilege actions')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {EMPLOYEE_PERMISSIONS,permitted}=await vite.ssrLoadModule('/src/lib/employee-accounts.ts')
 assert.deepEqual(EMPLOYEE_PERMISSIONS.map(p=>p.id),permissions)
 const staff={kind:'employee',active:true,displayName:'QA',permissions:['shifts.attend','menu.manage']}
 assert.equal(permitted(staff,'shifts.attend'),true)
 assert.equal(permitted(staff,'shifts.manage'),false)
 assert.equal(permitted(staff,'services.manage'),false)
 assert.equal(permitted({...staff,active:false},'shifts.attend'),false)
 assert.equal(permitted({kind:'owner',permissions:[]},'accounts.manage'),true)
 console.log('PASS: all backoffice modules grantable, independent shift self/schedule rights, RLS guards and no delegated privilege escalation')
}finally{await vite.close()}
