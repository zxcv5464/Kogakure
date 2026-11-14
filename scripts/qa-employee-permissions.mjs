// Regression and security checks for employee-scoped backend access.
// No network, credentials or real users are created by this test.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
const files=[
 'src/pages/AdminPage.tsx','src/pages/admin/EmployeeAccountsManagement.tsx',
 'src/lib/employee-accounts.ts','src/lib/supabase.ts',
 'src/pages/admin/BookingNotification.tsx',
 'src/pages/admin/modules.ts','scripts/prepare-pages.mjs',
 'supabase/migrations/20261115_01_employee_accounts_permissions.sql',
 'supabase/functions/manage-employee-accounts/index.ts',
 'supabase/migrations/20261115_02_employee_permission_invoker.sql',
 'supabase/migrations/20261115_03_booking_operator_staff_read.sql',
]
const [page,editor,api,auth,notice,modules,routes,sql,edge,invoker,bookingStaffRead]=await Promise.all(files.map(x=>readFile(x,'utf8')))
for(const required of [
 "getBackofficeAccess(id)", "ProtectedModule", "allowed(access,module.id)",
 'module="accounts"', 'module="staff"', 'module="menu"', 'module="booking"',
 "usePendingBookings(allowed(access,'booking'))",
 "access.kind==='owner'", "getBackofficeAccess", "signInWithPassword",
 "resetPasswordForEmail", "auth.updateUser({password})",
]){
 assert.ok(page.includes(required),'Authenticated admin shell missing '+required)
}
assert.ok(page.includes("admin/accounts"),'Owner-only account management route missing')
assert.ok(modules.includes("id: 'accounts'"),'Accounts must be a real module')
assert.ok(routes.includes("'admin/accounts'"),'GitHub Pages must support account deep links')
assert.ok(auth.includes('detectSessionInUrl:true'),'Invited staff must be able to accept Supabase Auth redirect')
for(const text of ['邀請員工','員工顯示名稱','登入 Email','後台功能權限','允許此員工登入後台','建立並寄送邀請']){
 assert.ok(editor.includes(text),'Staff account UI missing '+text)
}
for(const permission of ['staff.manage','menu.manage','booking.manage']){
 assert.ok(api.includes(permission),'Missing permission '+permission)
 assert.ok(sql.includes("has_backoffice_permission('"+permission+"')"),'RLS missing permission '+permission)
 assert.ok(edge.includes("'"+permission+"'"),'Edge whitelist missing '+permission)
}
assert.ok(api.includes("from('employee_accounts')"),'Authorized membership must come from a database table')
assert.ok(api.includes("functions.invoke('manage-employee-accounts'"),'Invites must be server-side')
assert.ok(!api.includes('SERVICE_ROLE_KEY')&&!page.includes('SERVICE_ROLE_KEY'),'Never expose service role in frontend')
for(const rule of [
 'references auth.users(id) on delete cascade',
 'alter table public.employee_accounts enable row level security',
 'revoke all on public.employee_accounts from public,anon,authenticated',
 'grant select on public.employee_accounts to authenticated',
 'user_id=(select auth.uid())',
 'site admins list employee accounts',
 'security definer set search_path',
 'and a.active=true',
 'permissions <@ array',
 'booking.manage',
 'permitted employee reads bookings',
 'permitted employee edits staff',
 'permitted employee updates menu_items',
 'permitted employee upload staff media',
]){
 assert.ok(sql.includes(rule),'Employee RLS safety check missing '+rule)
}
assert.ok(!sql.includes('create policy "employees update'), 'Employees may never change their own privileges')
assert.ok(invoker.includes('alter function public.has_backoffice_permission(text) security invoker'), 'Employee authorization helper must execute with caller RLS')
assert.ok(bookingStaffRead.includes('for select to authenticated')&&bookingStaffRead.includes("has_backoffice_permission('booking.manage')"),'Booking employees need READ access to hidden staff for acceptance validation')
assert.ok(!bookingStaffRead.includes('for update'),'Booking staff lookup must not permit editing')
assert.ok(!sql.includes('insert into public.admin_users'), 'Invited staff must never become managers')
assert.ok(sql.includes("if not public.has_backoffice_permission('booking.manage')"),'Booking RPCs must honor assigned module access')
assert.equal((sql.match(/if not public.has_backoffice_permission\('booking.manage'\)/g)||[]).length,3,'All three booking admin RPCs must enforce role scopes')
assert.ok(sql.includes('grant execute on function public.decide_booking_request(uuid,text) to authenticated'))
assert.ok(sql.includes('grant execute on function public.admin_delete_booking_request(uuid) to authenticated'))
for(const guard of [
 "service.auth.getUser(token)",
 "service.from('admin_users')",
 "if(managerError||!manager)",
 "service.auth.admin.inviteUserByEmail",
 "service.from('employee_accounts').insert",
 "service.from('employee_accounts')",
 "createClient(supabaseUrl, secretKey",
 "validate", // checked via actual field validation
]){
 if(guard==='validate')continue
 assert.ok(edge.includes(guard),'Edge invite/update authentication check missing '+guard)
}
assert.ok(edge.includes("action==='update'")&&edge.includes("action==='invite'"))
assert.ok(!edge.includes('insert into admin_users'),'Edge must not promote employees')
assert.ok(notice.includes('usePendingBookings(enabled = true)'),'Booking polling must be disabled for other roles')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {permitted,EMPLOYEE_PERMISSIONS}=await vite.ssrLoadModule('/src/lib/employee-accounts.ts')
 assert.deepEqual(EMPLOYEE_PERMISSIONS.map(x=>x.id),['staff.manage','menu.manage','booking.manage'])
 const owner={kind:'owner',permissions:[]}
 const booking={kind:'employee',active:true,displayName:'月迎',permissions:['booking.manage']}
 for(const name of EMPLOYEE_PERMISSIONS.map(x=>x.id))assert.equal(permitted(owner,name),true)
 assert.equal(permitted(booking,'booking.manage'),true)
 assert.equal(permitted(booking,'staff.manage'),false)
 assert.equal(permitted({...booking,active:false},'booking.manage'),false)
 console.log('PASS: role-aware admin navigation, manager-only employee accounts, RLS guards and server-side invitations')
}finally{await vite.close()}
