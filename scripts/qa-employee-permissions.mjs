// Protect manager-created employee credentials and server-side access control.
// No production accounts, passwords or Auth sessions are created in this test.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const files=[
 'src/pages/AdminPage.tsx',
 'src/pages/admin/EmployeeAccountsManagement.tsx',
 'src/lib/employee-accounts.ts',
 'src/lib/supabase.ts',
 'src/pages/admin/BookingNotification.tsx',
 'src/pages/admin/modules.ts',
 'scripts/prepare-pages.mjs',
 'supabase/migrations/20261115_01_employee_accounts_permissions.sql',
 'supabase/functions/manage-employee-accounts/index.ts',
 'supabase/migrations/20261115_02_employee_permission_invoker.sql',
 'supabase/migrations/20261115_03_booking_operator_staff_read.sql',
 'supabase/migrations/20261115_04_employee_usernames.sql',
 'docs/STAFF_ACCOUNTS.md',
]
const [page,editor,api,auth,notice,modules,routes,sql,edge,invoker,bookingRead,usernames,docs]
 = await Promise.all(files.map(path=>readFile(path,'utf8')))

for(const required of [
 'getBackofficeAccess(id)', 'ProtectedModule', 'allowed(access,module.id)',
 'module="accounts"','module="staff"','module="menu"','module="booking"',
 "usePendingBookings(allowed(access,'booking'))",
 "access.kind==='owner'",'signInWithPassword',
 'staffLoginEmail(loginInput)', '管理員 Email／員工登入帳號',
 '員工忘記密碼，請聯繫館方管理員',
 "{access.kind==='owner'&&<AccountSecurity />}",
]){
 assert.ok(page.includes(required),'Employee login or protected admin UI missing: '+required)
}
assert.ok(modules.includes("id: 'accounts'"),'Owner-only account module missing')
assert.ok(routes.includes("'admin/accounts'"),'GitHub Pages account deep link missing')
assert.ok(auth.includes('detectSessionInUrl:true'),'Existing authenticated callback support missing')
for(const label of [
 '新增員工帳號','員工登入帳號','初始密碼','再次輸入初始密碼',
 '後台功能權限','允許此員工登入後台','建立員工帳號',
 '管理員重設密碼','永久刪除','重設密碼',
]){
 assert.ok(editor.includes(label),'Account form is missing: '+label)
}
assert.ok(editor.includes('window.prompt(')&&editor.includes('window.confirm('),
 'Deleting an account must require typed username and second confirmation')
assert.ok(editor.includes('resetPassword')&&editor.includes('resetConfirm'),
 'Manager password reset needs two password entries')
assert.ok(editor.includes('STAFF_PASSWORD_VALID(password)')&&editor.includes('password!==passwordConfirm'),
 'Initial password must be validated twice')
assert.ok(editor.includes('STAFF_PASSWORD_VALID(resetPassword)')&&editor.includes('resetPassword!==resetConfirm'),
 'Reset password must be validated twice')
assert.ok(!editor.includes('type="email"')&&!editor.includes('inviteEmployee(')
 &&!editor.includes('建立並寄送邀請'),
 'Employee form must use admin-set credentials and must not submit an email invitation')
for(const perm of ['staff.manage','menu.manage','booking.manage']){
 assert.ok(api.includes(perm)&&sql.includes("has_backoffice_permission('"+perm+"')"),
  'Module permission missing: '+perm)
}
assert.ok(api.includes("from('employee_accounts')")&&api.includes('staffLoginEmail'),
 'Login credentials must be linked to employee RLS account records')
for(const action of ["action:'create'","action:'reset_password'","action:'delete'","action:'update'","action:'convert_legacy'"])
 assert.ok(api.includes(action),'Frontend account manager action missing: '+action)
assert.ok(!api.includes('SERVICE_ROLE_KEY')&&!page.includes('SERVICE_ROLE_KEY'),
 'Service-role credentials must never appear in the browser')
for(const guard of [
 'service.auth.getUser(token)',
 "service.from('admin_users')",
 'if(!await isManager(user.id))',
 'service.auth.admin.createUser',
 'service.auth.admin.updateUserById',
 'service.auth.admin.deleteUser',
 "service.from('employee_accounts').insert",
 'await findEmployee(id)',
 'await isManager(id)',
 'email_confirm:true',
 'validatedUsername(body.username)',
 'validatedPassword(body.password)',
 'validatedPassword(body.password)',
 'username+\'@\'+internalDomain',
 'createClient(supabaseUrl, secretKey',
 'auth.admin.deleteUser(created.user.id)',
]){
 assert.ok(edge.includes(guard),'Owner-only server guard missing: '+guard)
}
assert.ok(!edge.includes('inviteUserByEmail')&&!edge.includes("action==='invite'"),
 'Email invitations must be completely removed from the backend')
assert.ok(edge.includes('value.length>=8&&value.length<=16'),
 'The server must enforce 8–16-character passwords for creation, reset and conversion')
assert.ok(!edge.includes('value.length>=12&&value.length<=128'),
 'The obsolete password length must be removed from the server')
assert.ok(editor.includes('minLength={8} maxLength={16}')&&editor.includes('minLength={8} maxLength={16}'),
 'Staff credential inputs must use the new length boundaries')
assert.ok(edge.includes("if(body.action==='delete')")&&edge.includes("if(body.action==='reset_password')"),
 'Both delete and reset flows must be present')
assert.ok(edge.includes("if(body.action==='convert_legacy')")&&edge.includes("!employee.username.startsWith('legacy_')"),
 'Existing employee logins must be preserved and convertible only by a manager')
assert.ok(edge.includes("email,password:body.password,email_confirm:true") &&
 edge.includes("username:employee.username,email:employee.email"),
 'Legacy conversion must set new login credentials with rollback on Auth failure')
assert.ok(editor.includes('舊版帳號轉換')&&editor.includes('convertLegacyEmployee'),
 'An existing invited employee needs a manager-run migration path')
assert.ok(edge.includes("if(!await findEmployee(id)||await isManager(id))"),
 'Owner account must never be a valid delete or password-reset target')
assert.ok(edge.includes("service.auth.admin.deleteUser(id)"),
 'Delete must remove the actual Supabase Auth credential')
assert.ok(usernames.includes('add column if not exists username text'),
 'Migration must create employee usernames')
assert.ok(usernames.includes('employee_accounts_username_unique'),
 'Employee username must be unique in the database')
assert.ok(usernames.includes("'legacy_'"), 'Old employee accounts must retain an identity until explicitly converted')
assert.ok(usernames.includes('employee_accounts_username_format'),
 'Username format must be validated server-side')
assert.ok(usernames.includes('alter column username set not null'),
 'Every employee must have a username after migration')
assert.ok(sql.includes('references auth.users(id) on delete cascade'),
 'Deleting an employee Auth user must clear its permission row')
assert.ok(sql.includes('alter table public.employee_accounts enable row level security'),
 'Employee account records require RLS')
assert.ok(sql.includes('revoke all on public.employee_accounts from public,anon,authenticated'),
 'Clients must not modify user permissions')
assert.ok(!sql.includes('insert into public.admin_users'),
 'Do not grant owner status to new employees')
assert.ok(invoker.includes('alter function public.has_backoffice_permission(text) security invoker'),
 'Permission helper must respect caller RLS')
assert.ok(bookingRead.includes("has_backoffice_permission('booking.manage')"),
 'Booking operators need read-only access for booking validation')
assert.ok(notice.includes('usePendingBookings(enabled = true)'),'Booking notifications remain scoped')
assert.ok(!docs.includes('inviteUserByEmail')&&!docs.includes('建立並寄送邀請')
 &&docs.includes('不會寄出任何員工邀請'),
 'Documentation must describe direct account creation while allowing legacy-user migration notes')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const mod=await vite.ssrLoadModule('/src/lib/employee-accounts.ts')
 assert.deepEqual(mod.EMPLOYEE_PERMISSIONS.map(x=>x.id),['staff.manage','menu.manage','booking.manage'])
 assert.equal(mod.staffLoginEmail('Fox_01'),'fox_01@staff.kogakure.invalid')
 assert.equal(mod.staffLoginEmail(' yueying '),'yueying@staff.kogakure.invalid')
 for(const invalid of ['a','1user','ab','a.b','evil@example.com','a b','john+1'])
  assert.equal(mod.staffLoginEmail(invalid),null,'Invalid username should be rejected: '+invalid)
 assert.equal(mod.STAFF_PASSWORD_VALID('StaffPass1234'),true)
 assert.equal(mod.STAFF_PASSWORD_VALID('Abcdefg1'),true,'8 characters should be accepted')
 assert.equal(mod.STAFF_PASSWORD_VALID('Abcdefghijklmno1'),true,'16 characters should be accepted')
 assert.equal(mod.STAFF_PASSWORD_VALID('Abcdef1'),false,'7 characters should be rejected')
 assert.equal(mod.STAFF_PASSWORD_VALID('Abcdefghijklmnop1'),false,'17 characters should be rejected')
 assert.equal(mod.STAFF_PASSWORD_VALID('LettersOnly'),false,'Letters alone should not pass')
 assert.equal(mod.STAFF_PASSWORD_VALID('123456789012'),false,'Digits alone should not pass')
 const manager={kind:'owner',permissions:[]}
 const staff={kind:'employee',active:true,displayName:'月迎',permissions:['booking.manage']}
 assert.equal(mod.permitted(manager,'staff.manage'),true)
 assert.equal(mod.permitted(manager,'menu.manage'),true)
 assert.equal(mod.permitted(manager,'booking.manage'),true)
 assert.equal(mod.permitted(staff,'booking.manage'),true)
 assert.equal(mod.permitted(staff,'staff.manage'),false)
 assert.equal(mod.permitted({...staff,active:false},'booking.manage'),false)
 console.log('PASS: manager-created staff credentials, no invitations, protected delete/reset and scoped module RLS')
} finally {await vite.close()}
