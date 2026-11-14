import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
const files=[
 'src/types.ts','src/lib/staff.ts','src/pages/admin/StaffManagement.tsx',
 'src/pages/BookingPage.tsx','src/pages/booking-page.css',
 'src/pages/admin/BookingManagement.tsx','src/pages/admin/AdminBookingCreate.tsx',
 'src/lib/bookings.ts','supabase/migrations/20261114_02_booking_cards_admin_crud.sql',
]
const [types,staff,staffAdmin,booking,bookingCss,admin,manual,api,sql]=await Promise.all(files.map(f=>readFile(f,'utf8')))
assert.ok(types.includes('bookingVisible: boolean'))
assert.ok(types.includes('is_booking_visible: boolean'))
assert.ok(staff.includes('bookingVisible:s.is_booking_visible!==false'), 'Old profiles must remain visible after migration')
assert.ok(staff.includes('is_booking_visible:s.bookingVisible'), 'Staff visibility must persist to Supabase')
assert.ok(staffAdmin.includes('在預約頁面顯示並接受指名'))
assert.ok(staffAdmin.includes("patch('bookingVisible'"))
assert.ok(booking.includes('p.published&&p.bookingVisible'), 'Hidden staff must not appear in public booking cards')
assert.ok(!booking.includes("role.includes('狐姬')"), 'Front-end must not restrict booking to a job title')
assert.ok(!manual.includes("role.includes('狐姬')"), 'Back-office booking must not restrict booking to a job title')
assert.ok(booking.includes('getStaff().then(rows=>'), 'Public cards must refresh after back-office visibility changes')
for(const phrase of ['booking-portrait','booking-card-details','booking-card-topline','booking-card-status','booking-card-name','booking-card-description'])
 assert.ok(booking.includes(phrase),'Missing horizontal card area '+phrase)
assert.ok(bookingCss.includes('grid-template-columns:repeat(auto-fit,minmax(min(100%,550px),1fr))'), 'Cards should be wide')
assert.ok(bookingCss.includes('object-fit:contain'), 'Selected portrait must remain fully visible when the card grows')
assert.ok(bookingCss.includes('.booking-profile.has-manual-crop .booking-portrait img'), 'Manual crop must not be auto cropped')
for(const phrase of ['新增預約','永久刪除','removeBooking','setCreatingBooking(true)','<AdminBookingCreate'])
 assert.ok(admin.includes(phrase),'Admin booking action missing '+phrase)
for(const phrase of ['預約者遊戲角色姓名','伺服器','選擇可指名館員','新增待審核申請','createAdminBooking'])
 assert.ok(manual.includes(phrase),'Manual form missing '+phrase)
assert.ok(api.includes("rpc('admin_create_booking_request'"))
assert.ok(api.includes("rpc('admin_delete_booking_request'"))
assert.ok(sql.includes('add column if not exists is_booking_visible boolean not null default true'))
assert.ok(sql.includes('s.is_booking_visible=true'), 'Public RPC must reject hidden profiles')
assert.ok(sql.includes('not s.is_booking_visible'), 'Admin acceptance must reject newly hidden profiles')
for(const phrase of [
 'create or replace function public.admin_create_booking_request',
 'create or replace function public.admin_delete_booking_request',
 'security invoker set search_path',
 'if not public.is_site_admin()',
 'for update',
 'o.busy_until=v_booking.ends_at',
 'delete from public.booking_requests where id=p_booking_id',
 'revoke all on function public.admin_create_booking_request',
 'revoke all on function public.admin_delete_booking_request',
 'grant execute on function public.admin_create_booking_request',
 'grant execute on function public.admin_delete_booking_request'
])assert.ok(sql.includes(phrase),'Admin security constraint missing '+phrase)
assert.ok(!sql.includes('drop table'), 'Never drop a table to add booking admin functions')
assert.ok(!sql.includes('delete from public.staff'), 'Never mutate existing staff data')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {rowToStaff,staffToRow}=await vite.ssrLoadModule('/src/lib/staff.ts')
 const row={id:'a',display_name:'狐姬',role:'狐姬',tagline:'',bio:'',image_url:null,thumbnail_url:null,theme_color:'#8059A3',effect:'none',socials:[],services:[],is_published:true,sort_order:10}
 assert.equal(rowToStaff(row).bookingVisible,true)
 assert.equal(rowToStaff({...row,is_booking_visible:false}).bookingVisible,false)
 assert.equal(staffToRow({...rowToStaff(row),bookingVisible:false}).is_booking_visible,false)
 console.log('PASS: booking visibility, horizontal cards, admin create/delete RPC and legacy staff compatibility')
}finally{await vite.close()}
