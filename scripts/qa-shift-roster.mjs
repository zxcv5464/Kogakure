// Rolling duty roster checks: date boundaries, secure DB rules and both UIs.
// No production database mutations.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import ts from 'typescript'
import {createServer} from 'vite'
const sources=['src/lib/shift-calendar.ts','src/lib/shifts.ts','src/pages/ShiftsPage.tsx',
 'src/pages/admin/ShiftManagement.tsx','src/App.tsx','src/pages/AdminPage.tsx',
 'src/pages/admin/modules.ts','scripts/prepare-pages.mjs',
 'src/pages/shifts-page.css','src/pages/admin/shift-management.css',
 'supabase/migrations/20261115_09_rolling_four_week_shifts.sql']
const [calendar,lib,page,editor,app,shell,modules,routes,css,adminCss,sql]=await Promise.all(sources.map(path=>readFile(path,'utf8')))
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
assert.ok(editor.includes('unmarkShiftAttendance(date,person.employeeId)'))
assert.ok(editor.includes('date>=today'))
assert.ok(page.includes('opening?.open?members.get(date)||[]:[]'))
assert.ok(page.includes('status===\'open\''))
assert.ok(lib.includes("onConflict:'shift_date'"))
assert.ok(css.includes('@media(max-width:590px)'))
assert.ok(adminCss.includes('@media(max-width:460px)'))
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
 assert.ok(employeeHtml.includes('員工')||employeeHtml.includes('出勤'))
 assert.equal(typeof ShiftManagement,'function')
 console.log('PASS: Taiwan Monday rolling 4 weeks, public calendar, employee shift signup, manager opening dates, secure RLS')
}finally{await vite.close()}
