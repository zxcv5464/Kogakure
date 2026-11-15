// Isolated regression for per-fox-maid accepted plans and double nominations.
// Nothing in this test writes to Supabase.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import ts from 'typescript'

const paths=[
 'src/types.ts','src/lib/staff.ts','src/lib/bookings.ts',
 'src/pages/BookingPage.tsx','src/pages/admin/BookingManagement.tsx',
 'src/pages/admin/AdminBookingCreate.tsx','src/pages/admin/StaffManagement.tsx',
 'src/pages/admin/booking-management.css',
 'supabase/migrations/20261115_29_staff_booking_plan_joint_rules.sql',
]
const [types,staff,bookings,publicPage,admin,manual,staffAdmin,css,sql]=
 await Promise.all(paths.map(path=>readFile(path,'utf8')))
for(const path of paths.filter(p=>/\.tsx?$/.test(p))){
 const ast=ts.createSourceFile(path,await readFile(path,'utf8'),
  ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.equal(ast.parseDiagnostics.length,0,'Syntax error in '+path)
}
for(const field of ['bookingAllowedPlanIds','bookingAllowJoint','booking_allowed_plan_ids','booking_allow_joint']){
 assert.ok(types.includes(field),'Staff models must carry booking rule '+field)
 assert.ok(staff.includes(field),'Staff API must preserve '+field)
}
assert.ok(staff.includes('booking_allowed_plan_ids:_allowedPlans')&&
 staff.includes('booking_allow_joint:_allowJoint')&&
 staff.includes('is_booking_visible:_bookingVisible')&&
 staff.includes('.update(profileRow)'),
 'Ordinary profile changes must not accidentally overwrite concurrent booking rule updates')
assert.ok(staffAdmin.includes('bookingAllowedPlanIds:null,bookingAllowJoint:true'),
 'New staff must default to all plans and allow joint nominations')
for(const item of ['setStaffBookingRules','booking-admin-person-rules','可接受指名方案',
 '接受所有方案（包含日後新增的方案）','僅接受指定方案',
 '開放與其他狐姬同時指名','儲存此狐姬設定',
 'setRuleDrafts','invalidatePublicStaffCache','useAdminEditGuard']){
 assert.ok(admin.includes(item),'Booking management cannot edit per-staff plan and joint rules: '+item)
}
for(const item of ['staffAcceptsPlan(selected,p.id)','staffCanJoinBooking(selected,extraPerson,p.id)',
 'applicablePlans.map','staffCanJoinBooking(selected,p,chosenPlanId)',
 'chosenPlanId','selected.bookingAllowJoint','!applicablePlans.length']){
 assert.ok(publicPage.includes(item),'Guest booking must filter by staff eligibility: '+item)
}
assert.ok(manual.includes('staffAcceptsPlan(p,planId)')&&
 manual.includes('staffCanJoinBooking(selectedPartner,p,planId)')&&
 manual.includes('setStaffIds([])')&&manual.includes('!staffCanJoinBooking(picked[0],picked[1],planId)'),
 'Manual bookings need the same eligibility and double-nomination checks')
assert.ok(css.includes('.booking-admin-person-rules')&&css.includes('.booking-admin-plan-options'),
 'Manager rule selector needs mobile-friendly styling')
for(const item of [
 'add column if not exists booking_allowed_plan_ids uuid[] default null',
 'add column if not exists booking_allow_joint boolean not null default true',
 'public.set_staff_booking_rules',
 "public.has_backoffice_permission('booking.manage')",
 'revoke all on function public.set_staff_booking_rules',
 'grant execute on function public.set_staff_booking_rules',
 'private.validate_staff_booking_rules',
 'booking_staff_rules_on_insert',
 'booking_rules_before_acceptance',
 "new.status='accepted'",
 'after insert or update of staff_id,booking_id',
 's.booking_allowed_plan_ids is not null',
 'and not s.booking_allow_joint',
]){
 assert.ok(sql.includes(item),'Database rule enforcement missing: '+item)
}
assert.ok(!sql.includes('delete from public.booking_requests')&&!sql.includes('drop table public.staff'),
 'Migration must preserve existing reservations and staff')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {rowToStaff,staffToRow}=await vite.ssrLoadModule('/src/lib/staff.ts')
 const {staffAcceptsPlan,staffCanJoinBooking}=await vite.ssrLoadModule('/src/lib/bookings.ts')
 const row={id:'x',display_name:'狐姬',role:'狐姬',tagline:'',bio:'',
  image_url:null,thumbnail_url:null,theme_color:'#8059a3',effect:'none',
  socials:[],services:[],is_published:true,is_booking_visible:true,sort_order:1}
 const legacy=rowToStaff(row)
 assert.equal(legacy.bookingAllowedPlanIds,null)
 assert.equal(legacy.bookingAllowJoint,true)
 assert.equal(staffAcceptsPlan(legacy,'plan-a'),true)
 const limited={...legacy,bookingAllowedPlanIds:['plan-a'],bookingAllowJoint:true}
 const solo={...legacy,bookingAllowedPlanIds:['plan-a'],bookingAllowJoint:false}
 assert.equal(staffAcceptsPlan(limited,'plan-a'),true)
 assert.equal(staffAcceptsPlan(limited,'plan-b'),false)
 assert.equal(staffAcceptsPlan({...limited,bookingAllowedPlanIds:[]},'plan-a'),false)
 assert.equal(staffCanJoinBooking(limited,legacy,'plan-a'),true)
 assert.equal(staffCanJoinBooking(limited,legacy,'plan-b'),false)
 assert.equal(staffCanJoinBooking(limited,solo,'plan-a'),false)
 assert.equal(staffCanJoinBooking(solo,limited,'plan-a'),false)
 const saved=staffToRow(limited)
 assert.deepEqual(saved.booking_allowed_plan_ids,['plan-a'])
 assert.equal(saved.booking_allow_joint,true)
 console.log('PASS: staff-specific plans, optional joint nomination, public/admin screens, and server-side enforcement')
}finally{await vite.close()}
