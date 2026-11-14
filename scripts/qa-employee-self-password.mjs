// Self-service employee password changes must never confer admin powers,
// access other accounts, or store plaintext secrets in backoffice tables.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'

const [page,component,accounts,css,docs,edge,adminEditor]=await Promise.all([
 'src/pages/AdminPage.tsx',
 'src/pages/admin/EmployeeSelfPassword.tsx',
 'src/lib/employee-accounts.ts',
 'src/pages/admin/admin-workspace.css',
 'docs/STAFF_ACCOUNTS.md',
 'supabase/functions/manage-employee-accounts/index.ts',
 'src/pages/admin/EmployeeAccountsManagement.tsx',
].map(file=>readFile(file,'utf8')))

assert.ok(page.includes("{access.kind==='employee'&&<EmployeeSelfPassword/>}"),
 'Employees must be shown their own security settings without extra module permissions')
assert.ok(page.includes("{access.kind==='owner'&&<AccountSecurity />}"),
 'The original manager password settings must remain unchanged')
assert.ok(page.includes("if(id==='accounts')return access.kind==='owner'"),
 'Staff must not gain administrator account management access')
assert.ok(!component.includes('manage-employee-accounts'),
 'Employees must not be able to call administrator account management actions')
assert.ok(component.includes('useAdminEditGuard')&&component.includes('setEditing(editing,busy)'),
 'Password edits must participate in the existing navigation guard')
for(const phrase of [
 '我的帳號安全 · 自行修改密碼',
 '目前密碼',
 '新密碼（8～16 字，包含英文及數字）',
 '再次輸入新密碼',
 'autoComplete="current-password"',
 'autoComplete="new-password"',
 'await changeOwnPassword(current,next,confirm)',
 'setCurrent(\'\');setNext(\'\');setConfirm(\'\')',
 'role="alert"',
 'role="status"',
]){
 assert.ok(component.includes(phrase),'Self-service password form missing '+phrase)
}
assert.ok(css.includes('.employee-self-password-form')&&css.includes('@media(max-width:560px)'),
 'Staff security form must be responsive on mobile')
for(const required of [
 'validateOwnPasswordChange(current:string,next:string,confirmation:string)',
 'STAFF_PASSWORD_VALID(next)',
 'if(next===current)',
 'if(next!==confirmation)',
 'supabase.auth.getUser()',
 'persistSession:false,autoRefreshToken:false,detectSessionInUrl:false',
 'checkClient.auth.signInWithPassword({',
 'email:user.email,password:current',
 'data.user.id!==user.id',
 "checkClient.auth.signOut({scope:'local'})",
 'supabase.auth.updateUser({password:next})',
]){
 assert.ok(accounts.includes(required),'Self-service password security guard missing '+required)
}
assert.ok(!accounts.includes('service_role')&&!accounts.includes('SERVICE_ROLE_KEY'),
 'No secret or service role may appear in frontend password code')
assert.ok(!component.includes('employee_accounts')&&!component.includes('admin_users'),
 'Changing own password cannot mutate role or manager tables')
assert.ok(edge.includes("if(!await isManager(user.id))"),
 'Admin-only reset/delete endpoints must remain restricted')
assert.ok(adminEditor.includes('resetEmployeePassword(draft.userId,resetPassword)'),
 'Existing manager password reset must remain available')
assert.ok(docs.includes('「管理總覽」→「我的帳號安全'),
 'Staff documentation must explain where the password form is')
assert.ok(docs.includes('忘記目前密碼'),
 'Staff forgotten-password route must remain manager-assisted')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {validateOwnPasswordChange}=await vite.ssrLoadModule('/src/lib/employee-accounts.ts')
 const valid='NewStaffPass2026'
 assert.equal(validateOwnPasswordChange('CurrentPassword123',valid,valid),null)
 assert.match(validateOwnPasswordChange('',valid,valid),/目前/)
 assert.match(validateOwnPasswordChange('OldPassword123','short1','short1'),/8/)
 assert.match(validateOwnPasswordChange('OldPassword123','abcdefghijkl','abcdefghijkl'),/英文/)
 assert.match(validateOwnPasswordChange('OldPassword123','123456789012','123456789012'),/英文/)
 assert.match(validateOwnPasswordChange('OldPassword123','OldPassword123','OldPassword123'),/不可/)
 assert.match(validateOwnPasswordChange('CurrentPassword123',valid,'not-the-same'),/不一致/)
 assert.equal(validateOwnPasswordChange('OldPassword123','A'.repeat(15)+'1','A'.repeat(15)+'1'),null)
 assert.equal(validateOwnPasswordChange('OldPassword123','Abcdefg1','Abcdefg1'),null)
 assert.match(validateOwnPasswordChange('OldPassword123','Abcdef1','Abcdef1'),/8/)
 assert.match(validateOwnPasswordChange('OldPassword123','A'.repeat(16)+'1','A'.repeat(16)+'1'),/16/)
 console.log('PASS: staff password form, current-password identity check, matching policy, no mail, no role escalation')
}finally{await vite.close()}
