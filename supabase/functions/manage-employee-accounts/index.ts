// Supabase Edge Function: owner-only employee invitation & permission management.
// A browser NEVER receives the service-role key. RLS has no employee write path.
import { createClient } from 'npm:@supabase/supabase-js@2.86.0'

const siteOrigin = 'https://zxcv5464.github.io'
const loginRedirect = siteOrigin + '/Kogakure/admin/'
const allowedPermissions = new Set(['staff.manage','menu.manage','booking.manage'])
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const service = createClient(supabaseUrl, secretKey, {
 auth: { autoRefreshToken: false, persistSession: false },
})

function cors(req: Request) {
 const origin = req.headers.get('origin') ?? ''
 const allowed = origin === siteOrigin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
 return {
  'Access-Control-Allow-Origin': allowed ? origin : siteOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
 }
}
function reply(req:Request, status:number, value:Record<string,unknown>) {
 return new Response(JSON.stringify(value),{status,headers:cors(req)})
}
function validatedPermissions(value: unknown): string[] | null {
 if (!Array.isArray(value) || value.length>3
   || !value.every(x=>typeof x==='string'&&allowedPermissions.has(x))) return null
 return [...new Set(value)]
}
function validatedName(value:unknown) {
 const name=typeof value==='string'?value.trim():''
 return name.length>=1&&name.length<=70&&!/[\u0000-\u001f]/.test(name)?name:null
}

Deno.serve(async (req: Request) => {
 if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors(req)})
 if (req.method!=='POST') return reply(req,405,{error:'不支援的請求'})
 if (!supabaseUrl || !secretKey) return reply(req,503,{error:'館方帳號管理服務尚未完成設定'})
 const token=(req.headers.get('authorization')??'').replace(/^Bearer\s+/i,'').trim()
 if (!token || token.length>8192) return reply(req,401,{error:'請先使用管理員帳號登入'})
 try {
  // Verify the caller against Supabase Auth, then independently check the
  // original owner-only admin_users membership. No employee can grant roles.
  const {data:{user},error:identityError}=await service.auth.getUser(token)
  if(identityError||!user||user.is_anonymous) return reply(req,401,{error:'管理員登入已失效'})
  const {data:manager,error:managerError}=await service.from('admin_users')
   .select('user_id').eq('user_id',user.id).maybeSingle()
  if(managerError||!manager) return reply(req,403,{error:'只有正式管理員可以管理員工帳號'})
  const raw=await req.text()
  if(raw.length>4096) return reply(req,413,{error:'資料過長'})
  let body:Record<string,unknown>
  try { body=JSON.parse(raw) } catch { return reply(req,400,{error:'請提供有效的設定資料'}) }
  if(!body||typeof body!=='object'||Array.isArray(body))return reply(req,400,{error:'請提供有效資料'})

  if(body.action==='invite'){
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():''
   const displayName=validatedName(body.displayName)
   const permissions=validatedPermissions(body.permissions)
   if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!displayName||!permissions)
    return reply(req,400,{error:'請確認 Email、姓名及授權選項'})
   const {data:existing,error:lookupError}=await service.from('employee_accounts')
    .select('user_id').ilike('email',email).maybeSingle()
   if(lookupError)return reply(req,500,{error:'無法確認員工帳號是否已存在'})
   if(existing)return reply(req,409,{error:'此員工帳號已建立，請直接編輯權限'})
   // Sends the employee an invitation email. The manager never sees or sets
   // the employee's password; password creation happens in the signed-in app.
   const {data:invited,error:inviteError}=await service.auth.admin.inviteUserByEmail(email,{
    redirectTo:loginRedirect,
   })
   if(inviteError||!invited.user) {
    // Do not return raw Auth error strings that might expose user details.
    return reply(req,409,{error:'邀請寄送失敗。若 Email 已註冊，請由館方確認帳號狀態；也請檢查郵件發送與允許的重新導向網址。'})
   }
   const {error:insertError}=await service.from('employee_accounts').insert({
    user_id:invited.user.id,email,display_name:displayName,
    permissions,active:true,created_by:user.id,
   })
   if(insertError){
    console.error('Employee invitation membership insert failed',insertError.code)
    return reply(req,500,{error:'邀請已發出但授權資料儲存失敗，請聯繫管理員確認後再處理，不要重複寄送。'})
   }
   return reply(req,200,{ok:true,message:'已發送員工邀請郵件，並建立指定模組權限'})
  }

  if(body.action==='update'){
   const id=typeof body.userId==='string'?body.userId:''
   const displayName=validatedName(body.displayName)
   const permissions=validatedPermissions(body.permissions)
   const active=body.active
   if(!/^[a-f0-9-]{36}$/i.test(id)||!displayName||!permissions||typeof active!=='boolean')
    return reply(req,400,{error:'員工資料或權限格式不正確'})
   // Only existing employee memberships may be updated. It is impossible to
   // promote an employee into admin_users via this function.
   const {data,error}=await service.from('employee_accounts')
    .update({display_name:displayName,permissions,active})
    .eq('user_id',id).select('user_id').maybeSingle()
   if(error)return reply(req,500,{error:'無法儲存員工權限'})
   if(!data)return reply(req,404,{error:'找不到員工帳號，請更新清單'})
   return reply(req,200,{ok:true,message:active?'員工權限已更新':'員工帳號已停用，後台存取權限立即失效'})
  }
  return reply(req,400,{error:'未知的帳號管理操作'})
 } catch(error) {
  console.error('Employee admin action failed',error instanceof Error?error.name:'Unknown')
  return reply(req,500,{error:'伺服器暫時無法處理帳號設定'})
 }
})
