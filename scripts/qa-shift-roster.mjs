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
 'supabase/migrations/20261115_11_employee_shift_display_name.sql',
 'supabase/migrations/20261115_12_employee_preferred_shift_name.sql',
 'supabase/migrations/20261115_13_shift_event_title.sql']
const [calendar,lib,page,editor,app,shell,modules,routes,main,otherPages,css,adminCss,sql,ownerSql,nameSql,preferredSql,eventSql]=await Promise.all(sources.map(path=>readFile(path,'utf8')))
for(const path of sources.filter(p=>p.endsWith('.ts')||p.endsWith('.tsx'))){
 const source=await readFile(path,'utf8')
 const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(ast.parseDiagnostics.length,0,'Invalid TS syntax in '+path+': '+ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '))
}
for(const term of [
 "if(id==='shifts')return permitted(access,'shifts.manage')||permitted(access,'shifts.attend')",
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
assert.ok(editor.includes('setShiftOpening(date,kind,hours,note,eventTitle)'))
assert.ok(lib.includes("kind:'open'|'closed'")&&!lib.includes("kind:'open'|'closed'|'unannounced'"),
 'Business opening API should expose only open or closed')
assert.ok(!lib.includes("kind==='unannounced'"),
 'Marking a day closed must not delete historical opening rows')
assert.ok(editor.includes("const savedKind:ShiftKind=day?.open?'open':'closed'"),
 'Owner and employee calendar editors must default missing days to closed')
assert.ok(editor.includes("const state:ShiftKind=day?.open?'open':'closed'"),
 'Admin calendar cells must render missing dates as closed')
assert.ok(!editor.includes('未公告')&&!editor.includes('unannounced'),
 'Remove unannounced labels and manager dropdown options')
assert.ok(!page.includes('未公告')&&!page.includes('unannounced'),
 'No unannounced status should remain on the visitor page')
assert.ok(!css.includes('is-unannounced')&&!adminCss.includes('is-unannounced'),
 'Unused unannounced styling should not remain')
assert.ok(editor.includes('<option value="open">營業</option>')&&editor.includes('<option value="closed">休館</option>'),
 'Owner may switch only between business open and closed states')
assert.ok(editor.includes('markShiftAttendance(date,person)'))
assert.ok(editor.includes('unmarkShiftAttendance(date,person.employeeId,person.source)'), 'Cancel attendance must use owner/employee source')
assert.ok(!editor.includes('window.confirm('),
 'Administrator cancellation must not show a blocking confirmation dialog')
assert.ok(editor.includes("已取消 '+person.name+' 在 '+date+' 的出勤。"),
 'Cancelled shifts should still report completion')
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
for(const phrase of [
 'ADD COLUMN IF NOT EXISTS shift_display_name text',
 'UPDATE public.employee_accounts AS account',
 'GRANT UPDATE(shift_display_name) ON public.employee_accounts TO authenticated',
 'user_id=(SELECT auth.uid())',
 'AND active=true',
 'WITH CHECK',
])assert.ok(preferredSql.includes(phrase),'Missing secure persistent preferred name: '+phrase)
assert.ok(!preferredSql.includes('GRANT UPDATE ON public.employee_accounts'),
 'Employees must never receive full employee-account UPDATE permissions')
assert.ok(lib.includes("select('user_id,display_name,shift_display_name')"),
 'Owner roster must retrieve saved preferred names')
assert.ok(lib.includes("name:r.shift_display_name||r.display_name"),
 'Owner roster must prefer saved RP name over account display name')
assert.ok(lib.includes('export async function saveOwnPreferredShiftName('),
 'Employees must persist their selected public name securely')
assert.ok(lib.includes('.eq(\'user_id\',user.id).eq(\'active\',true)'),
 'Preferred name updates must target the authenticated active account')
assert.ok(editor.includes('await saveOwnPreferredShiftName(person.name)'),
 'Employee self-signup must sync preferred name before saving shift')
assert.ok(editor.includes('await saveOwnPreferredShiftName(label)'),
 'Editing a recorded shift should also update future manager assignments')
assert.ok(editor.includes('fetchOwnPreferredShiftName(signedInId)'),
 'Employee login must load server preference across devices')
assert.ok(editor.includes('儲存常用出勤名稱')&&editor.includes('savePreferredName()'),
 'Employee must be able to save preferred name without picking a shift')
assert.ok(editor.includes("person.accountName!==person.name"),
 'Manager can distinguish account identity from preferred RP label')
assert.ok(adminCss.includes('.shift-admin-save-preference'),
 'Save-preference control needs responsive styling')
assert.ok(editor.includes('date>=today'))
// 28 accessible date buttons in a 7-column calendar; forms open only on demand.
assert.ok(editor.includes('className="shift-calendar-grid"'),
 'Admin shifts must use a compact calendar rather than stacked week forms')
assert.ok(editor.includes('weeks.flatMap(week=>week.days).map((date,index)=>'),
 'The calendar must render one button for all 28 dates')
assert.ok(editor.includes('SHIFT_WEEKDAYS.map(day=>'),
 'Calendar must show fixed Monday-to-Sunday weekday labels')
assert.ok(editor.includes('showDay(date,event.currentTarget)'),
 'Clicking a calendar date must open its own editing controls')
assert.ok(editor.includes('aria-haspopup="dialog"')&&editor.includes('aria-expanded={selectedDate===date}'),
 'Date buttons must advertise the editor dialog')
assert.ok(editor.includes('role="dialog" aria-modal="true"'),
 'The daily editor must be an accessible modal')
assert.ok(editor.includes('ShiftDayEditor key={selectedDate}'),
 'Opening a different day should reset editing draft state')
assert.ok(editor.includes("event.key==='Escape'")&&editor.includes('triggerRef.current?.focus()'),
 'Escape should close the modal and restore focus to the date')
assert.ok(editor.includes("if(busyRef.current)return"),
 'Modal must not close while changes are saving')
assert.ok(editor.includes('staff={byDate.get(selectedDate)||[]}'),
 'Daily editor must use the stored shift records')
assert.ok(adminCss.includes('.shift-calendar-grid')&&adminCss.includes('grid-template-columns:repeat(7,'),
 'Calendar needs seven weekday columns')
assert.ok(!editor.includes('shift-calendar-names'), 'Calendar overview must not reveal employee names')
assert.ok(editor.includes('visibleStaff.length')&&editor.includes('位出勤'), 'Calendar should keep attendance counts')
assert.ok(editor.includes('day?.eventTitle&&<span className="shift-calendar-event"'),
 'Only dates with an arranged event should show an event label')
assert.ok(editor.includes('活動安排（選填）')&&editor.includes('onChange={e=>setEventTitle(e.target.value)}'),
 'Manager should be able to add, change, and clear events in day editor')
assert.ok(editor.includes('onOpening(date,kind,hours,note,eventTitle)'),
 'Saving an opening date should also persist the arranged event')
assert.ok(editor.includes("const [eventTitle,setEventTitle]=useState(day?.eventTitle||'')"),
 'Daily edit dialog should hydrate existing event title')
assert.ok(!adminCss.includes('.shift-calendar-names'), 'Old name-list styling should be removed')
assert.ok(adminCss.includes('.shift-calendar-event'), 'Event titles should receive distinct calendar styling')
assert.ok(eventSql.includes('add column if not exists event_title text not null default'),
 'Event title needs a backward-compatible database column')
assert.ok(eventSql.includes('char_length(event_title)<=120'),
 'Event names should have database length validation')
assert.ok(!eventSql.includes('drop table')&&!eventSql.includes('delete from'),
 'Event feature must not change existing attendance records')
assert.ok(lib.includes("note,event_title")&&lib.includes("eventTitle:r.event_title||''"),
 'Calendar must read persisted event title')
assert.ok(lib.includes("event_title:kind==='open'?eventTitle.trim():''"),
 'Opening updates must save or clear event title for closed dates')
assert.ok(adminCss.includes('.shift-admin-modal-backdrop'),
 'Daily edit options must appear in a modal overlay')
assert.ok(adminCss.includes('overflow-x:auto'),
 'Calendar needs horizontal access on smaller screens')
assert.ok(page.includes('opening?.open?members.get(date)||[]:[]'))
assert.ok(page.includes('className="shift-calendar-weekdays"')&&page.includes('className="shift-weeks"'),
 'Public roster must use a recognizable weekday-aligned calendar')
assert.ok(page.includes("weeks.map((week,index)=>")&&page.includes('week.days.map((date,i)=>'),
 'Public calendar must show all 28 days in four weekly rows')
assert.ok(page.includes('aria-pressed={selectedDate===date}')&&page.includes('onClick={()=>selectDate(date)}'),
 'All calendar dates must be keyboard-accessible buttons that select a detailed day')
assert.ok(page.includes('id="shift-selected-detail"')&&page.includes('selectedNames.map('),
 'Selected-day detail must show actual published attendance names')
assert.ok(page.includes('selectedOpening?.eventTitle')&&page.includes('shift-event-indicator'),
 'Travelers must see scheduled activities and a mobile event marker')
assert.ok(page.includes('selectedStatus===\'open\'')&&page.includes('休館')&&!page.includes('未公告'),
 'Public calendar must show unconfigured dates as closed without an unannounced state')
assert.ok(page.includes('opening?.open?members.get(date)||[]:[]'),
 'Closed days must not display roster names')
assert.ok(css.includes('grid-template-columns:repeat(7,minmax(0,1fr))'),
 'Public four-week calendar needs seven fixed weekday columns')
assert.ok(css.includes('.shift-selected-detail')&&css.includes('.shift-day.is-selected'),
 'Day selection needs a visually clear detail section')
assert.ok(css.includes('.shift-event-indicator{display:block')&&css.includes('.shift-day-details,.shift-day-muted{display:none}'),
 'Mobile calendar cells should remain legible without overflow')
assert.ok(page.includes('status===\'open\''))
assert.ok(lib.includes("onConflict:'shift_date'"))
assert.ok(css.includes('@media(max-width:690px)'))
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
assert.ok(editor.includes('onMarkOwn(date,myDisplayName)'),
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
 assert.equal((publicHtml.match(/aria-pressed="/g)||[]).length,28)
 assert.ok(publicHtml.includes('shift-calendar-weekdays'))
 assert.ok(publicHtml.includes('shift-selected-detail'))
 assert.ok(publicHtml.includes('休館')&&!publicHtml.includes('未公告'))
 assert.ok(publicHtml.includes('當日資訊'))
 assert.equal((publicHtml.match(/shift-day is-closed/g)||[]).length,28,
  'All 28 unconfigured visitor dates must render as closed by default')
 const {default:ShiftManagement}=await vite.ssrLoadModule('/src/pages/admin/ShiftManagement.tsx')
 const employeeHtml=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(ShiftManagement,{access:{kind:'employee',active:true,displayName:'試班狐姬',permissions:[]}})))
 assert.ok(employeeHtml.includes('我的出勤顯示名稱')&&employeeHtml.includes('shift-employee-duty-name')&&employeeHtml.includes('儲存常用出勤名稱'),
  'Employee admin page must render the editable public shift name')
 assert.equal(typeof ShiftManagement,'function')
 console.log('PASS: Taiwan Monday rolling 4 weeks, public calendar, employee shift signup, manager opening dates, secure RLS')
}finally{await vite.close()}
