// Rolling duty roster checks: date boundaries, secure DB rules and both UIs.
// No production database mutations.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter,matchRoutes} from 'react-router-dom'
import ts from 'typescript'
import {createServer} from 'vite'
const sources=['src/lib/shift-calendar.ts','src/lib/shifts.ts','src/pages/ShiftsPage.tsx',
 'src/pages/admin/ShiftManagement.tsx','src/App.tsx','src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts','scripts/prepare-pages.mjs','src/main.tsx','src/pages/OtherPages.tsx',
 'src/pages/shifts-page.css','src/pages/admin/shift-management.css',
 'supabase/migrations/20261115_09_rolling_four_week_shifts.sql',
 'supabase/migrations/20261115_10_owner_self_attendance.sql',
 'supabase/migrations/20261115_11_employee_shift_display_name.sql']
const [calendar,lib,page,editor,app,shell,modules,routes,main,otherPages,css,adminCss,sql,ownerSql,nameSql]=await Promise.all(sources.map(path=>readFile(path,'utf8')))
for(const path of sources.filter(p=>p.endsWith('.ts')||p.endsWith('.tsx'))){
 const source=await readFile(path,'utf8')
 const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(ast.parseDiagnostics.length,0,'Invalid TS syntax in '+path+': '+ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '))
}
for(const term of [
 "if(id==='shifts')return access.kind==='owner'||(access.kind==='employee'&&access.active)",
 '<ShiftManagement access={access}/>','module="shifts"',
])assert.ok(shell.includes(term),'Missing shift permission or route '+term)
assert.ok(app.includes('<Route path="/shifts" element={<ShiftsPage />} />'))
assert.ok(modules.includes("id: 'shifts'")&&modules.includes("path: '/admin/shifts', status: 'available'"))
assert.ok(routes.includes("'admin/shifts'"))
// GitHub Pages publishes /shifts/ directory index; the browser must restore
// the canonical React route before rendering, even on a hard refresh.
const directRoute=await readFile('dist/shifts/index.html','utf8')
assert.ok(directRoute.includes('值班排班'),'Published /shifts/ entry must have the shift page title')
assert.ok(directRoute.includes('/Kogakure/'),'Deep-link entry must retain the GitHub Pages deployment base')
assert.ok(main.includes("current.endsWith('/')")&&main.includes('current.slice(0,-1)'),
 'Normalize GitHub Pages trailing slashes before BrowserRouter starts')
assert.ok(otherPages.includes("const path=useLocation().pathname.replace("),
 'Fallback route should handle trailing slashes consistently')
assert.ok(!otherPages.includes("||pages['/about']"),
 'A mismatched route must never show the old house-rules placeholder')
assert.equal(matchRoutes([{path:'/shifts'},{path:'*'}],'/shifts/')?.[0]?.route.path,'/shifts',
 'React Router must resolve a direct /shifts/ refresh to the current shift page')
for(const term of [
 "create table if not exists public.shift_open_days",
 "create table if not exists public.shift_attendance",
 "alter table public.shift_open_days enable row level security",
 "alter table public.shift_attendance enable row level security",
 "employee_id=(select auth.uid())",
 "e.active=true",
 "e.display_name=employee_name",
 "and d.is_open=true",
 "public.is_site_admin()",
 "for select to anon,authenticated",
 "on delete cascade",
])assert.ok(sql.includes(term),'Shift RLS missing: '+term)
assert.ok(!sql.includes('drop table')&&!sql.includes('delete from public.employee_accounts'))
assert.ok(editor.includes('setShiftOpening(date,kind,hours,note)'))
assert.ok(editor.includes('markShiftAttendance(date,person)'))
assert.ok(editor.includes('unmarkShiftAttendance(date,person.employeeId,person.source)'), 'Cancel attendance must use owner/employee source')
assert.ok(editor.includes('我的出勤顯示名稱')&&editor.includes('shift-employee-duty-name'),
 'Active employee should see a custom shift display-name input')
assert.ok(editor.includes('onMark(date,{id:selfId,name:myDisplayName})'),
 'Employee self-signup must submit custom attendance name, not account display name')
assert.ok(editor.includes('onRename(date,mine,myDisplayName)'),
 'Existing self-registered shifts must allow updating the name without cancelling attendance')
assert.ok(lib.includes("export async function renameOwnShiftAttendance("),
 'A self-only renaming function is required')
assert.ok(lib.includes(".eq('shift_date',date).eq(key,user.id)"),
 'Renaming must bind to the authenticated user and a single shift day')
assert.ok(lib.includes("const displayName=validateShiftName(employee.name)"),
 'The signup API should trim and validate employee-supplied duty names')
assert.ok(adminCss.includes('.shift-admin-rename'),
 'The shift renaming control needs styling')
for(const clause of [
 'drop policy if exists "active employees signup on open days"',
 'grant update(employee_name) on public.shift_attendance to authenticated',
 'grant update(display_name) on public.shift_owner_attendance to authenticated',
 'employee_id=(select auth.uid())',
 'owner_id=(select auth.uid())',
 'e.active=true',
 'for update to authenticated',
 'with check',
])assert.ok(nameSql.includes(clause),'Secure duty-name edit migration missing: '+clause)
assert.ok(!nameSql.includes('grant update on public.shift_attendance to authenticated'),
 'Do not grant broad UPDATE rights to employee shift dates or identities')
assert.ok(editor.includes('date>=today'))
assert.ok(page.includes('opening?.open?members.get(date)||[]:[]'))
assert.ok(page.includes('status===\'open\''))
assert.ok(lib.includes("onConflict:'shift_date'"))
assert.ok(css.includes('@media(max-width:590px)'))
assert.ok(adminCss.includes('@media(max-width:460px)'))
assert.ok(adminCss.includes('.shift-admin-owner-identity'),'Owner display-name control needs responsive styling')
for(const phrase of [
 'create table if not exists public.shift_owner_attendance',
 "references public.admin_users(user_id) on delete cascade",
 'alter table public.shift_owner_attendance enable row level security',
 'for select to anon,authenticated',
 'for insert to authenticated with check',
 'owner_id=(select auth.uid())',
 'public.is_site_admin()',
 "day.is_open=true",
 "for delete to authenticated using",
])assert.ok(ownerSql.includes(phrase),'Owner self-attendance authorization missing: '+phrase)
assert.ok(!ownerSql.includes('drop table public.shift_attendance')&&!ownerSql.includes('drop constraint'),
 'Do not weaken staff attendance permissions or foreign keys')
assert.ok(lib.includes("db.from('shift_owner_attendance').select("),
 'Public schedule must fetch owner attendance in addition to employees')
assert.ok(lib.includes("source:'owner' as const")&&lib.includes("source:'employee' as const"),
 'Owner attendance records must be source-tagged for safe cancellation')
assert.ok(lib.includes("export async function markOwnerShiftAttendance("),
 'Site owner needs a distinct self-signup API without a fabricated employee account')
assert.ok(lib.includes("const table=source==='owner'?'shift_owner_attendance':'shift_attendance'"),
 'Cancelling attendance must target the correct table')
assert.ok(editor.includes('onMarkOwn(date,ownerName)'),
 'Site owner must see a real self-signup action on open days')
assert.ok(editor.includes('onRemove(date,mine)'),
 'Site owner must be able to cancel own attendance')
assert.ok(editor.includes('我的出勤顯示名稱'),
 'Owner duty nickname must be editable')
assert.ok(editor.includes("markOwnerShiftAttendance(date,label)"),
 'Owner self-signup must not attempt the employee account insert')
assert.ok(editor.includes('unmarkShiftAttendance(date,person.employeeId,person.source)'),
 'Owners and employees must cancel rows from their respective tables')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {taipeiToday,rollingShiftWeeks,shiftAddDays,shiftWeekStart}=await vite.ssrLoadModule('/src/lib/shift-calendar.ts')
 assert.equal(taipeiToday(new Date('2026-11-15T15:59:59Z')),'2026-11-15')
 assert.equal(taipeiToday(new Date('2026-11-15T16:00:00Z')),'2026-11-16')
 assert.equal(shiftWeekStart('2026-11-15'),'2026-11-09')
 assert.equal(shiftWeekStart('2026-11-16'),'2026-11-16')
 assert.equal(shiftAddDays('2026-12-31',1),'2027-01-01')
 const previous=rollingShiftWeeks('2026-11-15')
 const following=rollingShiftWeeks('2026-11-16')
 assert.equal(previous.length,4)
 assert.equal(previous.flatMap(w=>w.days).length,28)
 assert.equal(previous[0].start,'2026-11-09')
 assert.equal(previous[3].end,'2026-12-06')
 assert.equal(following[0].start,previous[1].start)
 assert.equal(following[3].end,'2026-12-13')
 const {default:ShiftsPage}=await vite.ssrLoadModule('/src/pages/ShiftsPage.tsx')
 const publicHtml=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ShiftsPage)))
 assert.equal((publicHtml.match(/class="shift-week"/g)||[]).length,4)
 assert.equal((publicHtml.match(/class="shift-day /g)||[]).length,28)
 assert.ok(publicHtml.includes('未公告'))
 const {default:ShiftManagement}=await vite.ssrLoadModule('/src/pages/admin/ShiftManagement.tsx')
 const employeeHtml=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(ShiftManagement,{access:{kind:'employee',active:true,displayName:'試班狐姬',permissions:[]}})))
 assert.ok(employeeHtml.includes('我的出勤顯示名稱')&&employeeHtml.includes('shift-employee-duty-name'),
  'Employee admin page must render the editable public shift name')
 assert.equal(typeof ShiftManagement,'function')
 console.log('PASS: Taiwan Monday rolling 4 weeks, public calendar, employee shift signup, manager opening dates, secure RLS')
}finally{await vite.close()}
