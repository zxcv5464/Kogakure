// Read-only quota and iPhone services regression, no production mutations.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import ts from 'typescript'
const files=[
 'src/pages/services-page.css','src/components/ServicePhotoGallery.tsx',
 'src/types.ts','src/data/demo.ts','src/lib/staff.ts','src/lib/bookings.ts',
 'src/pages/BookingPage.tsx','src/pages/admin/BookingManagement.tsx',
 'src/pages/admin/AdminBookingCreate.tsx','src/pages/admin/booking-management.css',
 'supabase/migrations/20261116_01_booking_quota_limits.sql',
 'supabase/migrations/20261116_02_private_quota_definers.sql',
]
const [photoCss,gallery,types,demo,staff,lib,publicPage,admin,manual,adminCss,sql,hardening]=
 await Promise.all(files.map(p=>readFile(p,'utf8')))
for(const p of files.filter(p=>/\.tsx?$/.test(p))){
 const ast=ts.createSourceFile(p,await readFile(p,'utf8'),ts.ScriptTarget.Latest,true,
  p.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(ast.parseDiagnostics.length,0,'Invalid TS source: '+p)
}
const responsiveCss=photoCss.slice(photoCss.indexOf('@media (max-width: 850px)'))
assert.ok(responsiveCss.includes('height:clamp(230px,52vw,405px)')&&
 responsiveCss.includes('height:clamp(200px,69vw,310px)')&&
 !responsiveCss.includes('clip-path:none!important')&&
 !responsiveCss.includes('transition:opacity .55s ease')&&
 !responsiveCss.includes('.services-photo-shoji-edges{display:none}')&&
 photoCss.includes('.services-photo-slide.is-revealing{transition:clip-path 1450ms')&&
 photoCss.includes('@keyframes servicesShogiLeft')&&
 photoCss.includes('@keyframes servicesShogiRight')&&
 gallery.includes('services-photo-slides'),
 'Mobile frames must retain stable height and share the desktop center-opening shoji transition')
assert.ok(types.includes('bookingPlanCaps: Record<string,number>')&&
 demo.includes('bookingPlanCaps:{}')&&
 staff.includes('booking_plan_caps:_planCaps')&&
 staff.includes('bookingPlanCaps:s.booking_plan_caps'),
 'Per-staff quota must round-trip without staff photo edits overwriting restrictions')
assert.ok(lib.includes('max_accepted_bookings:plan.maxUses')&&
 lib.includes("rpc('get_booking_quota_usage')")&&
 lib.includes("rpc('set_staff_booking_settings'")&&
 lib.includes('export const quotaAvailable=')&&
 lib.includes("usage.staff[staff.id+':'+plan.id]"),
 'One shared quota model must be used for guest, admin and read-only occupancy')
assert.ok(publicPage.includes('loadBookingQuotaUsage()')&&
 publicPage.includes('quotaAvailable(p,selected,quotaUsage)')&&
 publicPage.includes('quotaAvailable(activePlan,p,quotaUsage)')&&
 publicPage.includes('const fresh=await loadBookingQuotaUsage()')&&
 publicPage.includes('接受次數已達上限'),
 'Guest booking must hide full options and validate live usage before send')
assert.ok(admin.includes('maxUses:null')&&
 admin.includes('可接取上限')&&
 admin.includes('方案接受數量')&&
 admin.includes('各方案可接受次數')&&
 admin.includes('setStaffBookingSettings(')&&
 admin.includes('bookingPlanCaps:setting.caps')&&
 admin.includes('已接取')&&
 adminCss.includes('.booking-admin-staff-quota-row'),
 'Backoffice must configure overall and individual quota, with progress on phones')
assert.ok(manual.includes('quotaAvailable(selectedPlan,p,quotaUsage)')&&
 manual.includes('const recent=await loadBookingQuotaUsage()')&&
 manual.includes('此方案或狐姬的接取次數已滿'),
 'Manual booking must honor the same capacity limits')
for(const item of [
 'add column if not exists max_accepted_bookings integer',
 "add column if not exists booking_plan_caps jsonb not null default '{}'::jsonb",
 'public.set_staff_booking_plan_caps','public.set_staff_booking_settings',
 'public.get_booking_quota_usage','private.enforce_booking_quotas',
 'booking_quotas_before_accept','pg_advisory_xact_lock',
 "b.status in ('accepted','completed')",
 'before update of status on public.booking_requests',
 "p_staff_id,p_allowed_plan_ids,p_allow_joint",
 "has_backoffice_permission('booking.manage')",
 'new.booking_plan_caps is distinct from old.booking_plan_caps',
 'grant execute on function public.get_booking_quota_usage() to anon,authenticated',
]){
 assert.ok(sql.includes(item),'Migration missing secure quota invariant: '+item)
}
assert.ok(hardening.includes('private.set_staff_booking_plan_caps_impl')&&
 hardening.includes('private.get_booking_quota_usage_impl')&&
 hardening.includes("public.get_booking_quota_usage()")&&
 hardening.includes('security invoker set search_path')&&
 hardening.includes('grant execute on function private.get_booking_quota_usage_impl() to anon,authenticated'),
 'Privileged quota reads/writes must live in private functions and public RPCs remain invoker-only')
assert.ok(!sql.includes('delete from public.booking_requests')&&
 !sql.includes('truncate table')&&!sql.includes('update public.booking_requests'),
 'Historical reservations must never be rewritten when enabling caps')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {quotaAvailable}=await vite.ssrLoadModule('/src/lib/bookings.ts')
 const person={id:'s1',bookingPlanCaps:{p1:2}}
 const plan={id:'p1',maxUses:3}
 assert.equal(quotaAvailable(plan,person,{plans:{p1:2},staff:{'s1:p1':1}}),true)
 assert.equal(quotaAvailable(plan,person,{plans:{p1:3},staff:{'s1:p1':1}}),false)
 assert.equal(quotaAvailable(plan,person,{plans:{p1:1},staff:{'s1:p1':2}}),false)
 assert.equal(quotaAvailable({id:'p1',maxUses:null},{id:'s1',bookingPlanCaps:{}},{plans:{p1:999},staff:{'s1:p1':999}}),true)
 assert.equal(quotaAvailable({id:'p1',maxUses:null},{id:'s1',bookingPlanCaps:{p1:0}},{plans:{},staff:{}}),false)
 console.log('PASS: iPhone service image heights, Safari layers, plan and staff limits, atomic server enforcement, and quota UI')
}finally{await vite.close()}
