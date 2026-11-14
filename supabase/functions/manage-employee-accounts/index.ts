// Owner-only employee account creation, password reset, permission updates and deletion.
// Supabase Auth manages password hashes. Never expose the service credential in the browser.
// Never send invitation email: manager sets employee username and initial password.
import { createClient } from 'npm:@supabase/supabase-js@2.86.0'

const siteOrigin = 'https://zxcv5464.github.io'
const internalDomain = 'staff.kogakure.invalid'
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
  Vary: 'Origin',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
 }
}
function reply(req:Request,status:number,value:Record<string,unknown>){
 return new Response(JSON.stringify(value),{status,headers:cors(req)})
}
function validatedPermissions(value:unknown):string[]|null{
 if(!Array.isArray(value)||value.length>3||
  !value.every(x=>typeof x==='string'&&allowedPermissions.has(x)))return null
 return [...new Set(value)]
}
function validatedName(value:unknown){
 const name=typeof value==='string'?value.trim():''
 return name.length>=1&&name.length<=70&&!/[\u0000-\u001f]/.test(name)?name:null
}
function validatedUsername(value:unknown){
 const username=typeof value==='string'?value.trim().toLowerCase():''
 return /^[a-z][a-z0-9_-]{2,23}$/.test(username)?username:null
}
function validatedPassword(value:unknown):value is string{
 return typeof value==='string'&&value.length>=12&&value.length<=128
  &&/[a-zA-Z]/.test(value)&&/[0-9]/.test(value)
}
function validatedUserId(value:unknown):value is string{
 return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
}
async function findEmployee(id:string){
 const {data,error}=await service.from('employee_accounts')
  .select('user_id,username,email').eq('user_id',id).maybeSingle()
 if(error)throw error
 return data
}
async function isManager(id:string){
 const {data,error}=await service.from('admin_users')
  .select('user_id').eq('user_id',id).maybeSingle()
 if(error)throw error
 return !!data
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
 if(req.method!=='POST')return reply(req,405,{error:'不支援的請求'})
 if(!supabaseUrl||!secretKey)return reply(req,503,{error:'館方帳號服務尚未完成設定'})
 const token=(req.headers.get('authorization')??'').replace(/^Bearer\s+/i,'').trim()
 if(!token||token.length>8192)return reply(req,401,{error:'請先使用管理員帳號登入'})
 try{
  const {data:{user},error:identityError}=await service.auth.getUser(token)
  if(identityError||!user||user.is_anonymous)return reply(req,401,{error:'登入已失效，請重新登入'})
  if(!await isManager(user.id))return reply(req,403,{error:'只有正式管理員可以管理員工帳號'})
  const raw=await req.text()
  if(raw.length>4096)return reply(req,413,{error:'資料過長'})
  let body:Record<string,unknown>
  try{body=JSON.parse(raw)}catch{return reply(req,400,{error:'資料格式不正確'})}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply(req,400,{error:'資料格式不正確'})

  if(body.action==='create'){
   const username=validatedUsername(body.username)
   const displayName=validatedName(body.displayName)
   const permissions=validatedPermissions(body.permissions)
   if(!username||!displayName||!permissions||!validatedPassword(body.password))
    return reply(req,400,{error:'請確認登入帳號、姓名、權限及密碼（12～128 字，需包含英文字母與數字）'})
   const {data:existing,error:lookupError}=await service.from('employee_accounts')
    .select('user_id').eq('username',username).maybeSingle()
   if(lookupError)return reply(req,500,{error:'無法確認帳號是否已存在'})
   if(existing)return reply(req,409,{error:'此登入帳號已有人使用'})
   const email=username+'@'+internalDomain
   // createUser creates a confirmed email/password credential WITHOUT sending
   // invitation, confirmation, or recovery emails. Internal email is reserved.
   const {data:created,error:createError}=await service.auth.admin.createUser({
    email,password:body.password,email_confirm:true,
   })
   if(createError||!created.user)return reply(req,409,{error:'建立帳號失敗。帳號可能已存在，請使用其他登入名稱。'})
   const {error:insertError}=await service.from('employee_accounts').insert({
    user_id:created.user.id,username,email,display_name:displayName,
    permissions,active:true,created_by:user.id,
   })
   if(insertError){
    // Do not leave an orphan Auth credential if the authorization row fails.
    const {error:cleanupError}=await service.auth.admin.deleteUser(created.user.id)
    if(cleanupError)console.error('Employee creation cleanup failed',cleanupError.code)
    console.error('Employee account row insert failed',insertError.code)
    return reply(req,500,{error:'帳號授權儲存失敗，請更新帳號清單後再確認'})
   }
   return reply(req,200,{ok:true,message:'員工帳號已建立。請私下將登入帳號與初始密碼交給本人。'})
  }

  if(body.action==='update'){
   const id=body.userId
   const displayName=validatedName(body.displayName)
   const permissions=validatedPermissions(body.permissions)
   const active=body.active
   if(!validatedUserId(id)||!displayName||!permissions||typeof active!=='boolean')
    return reply(req,400,{error:'員工資料或權限格式不正確'})
   if(!await findEmployee(id)||await isManager(id))
    return reply(req,404,{error:'找不到可管理的員工帳號'})
   const {data,error}=await service.from('employee_accounts')
    .update({display_name:displayName,permissions,active})
    .eq('user_id',id).select('user_id').maybeSingle()
   if(error||!data)return reply(req,500,{error:'無法儲存員工權限'})
   return reply(req,200,{ok:true,message:active?'員工權限已更新':'員工帳號已停用'})
  }

  if(body.action==='reset_password'){
   const id=body.userId
   if(!validatedUserId(id)||!validatedPassword(body.password))
    return reply(req,400,{error:'新密碼需 12～128 字，包含英文字母與數字'})
   if(!await findEmployee(id)||await isManager(id))
    return reply(req,404,{error:'找不到可重設密碼的員工帳號'})
   const {error}=await service.auth.admin.updateUserById(id,{password:body.password})
   if(error)return reply(req,500,{error:'無法重設員工密碼，請稍後再試'})
   return reply(req,200,{ok:true,message:'員工登入密碼已重設，請私下通知本人使用新密碼'})
  }

  if(body.action==='convert_legacy'){
   const id=body.userId
   const username=validatedUsername(body.username)
   if(!validatedUserId(id)||!username||!validatedPassword(body.password))
    return reply(req,400,{error:'新帳號名稱或密碼不符合規則'})
   const employee=await findEmployee(id)
   if(!employee||await isManager(id)||!employee.username.startsWith('legacy_'))
    return reply(req,404,{error:'找不到需要轉換的舊版員工帳號'})
   const {data:duplicate,error:duplicateError}=await service.from('employee_accounts')
    .select('user_id').eq('username',username).maybeSingle()
   if(duplicateError)return reply(req,500,{error:'無法確認新帳號是否可用'})
   if(duplicate&&duplicate.user_id!==id)return reply(req,409,{error:'新登入名稱已被使用'})
   const email=username+'@'+internalDomain
   const {error:rowError}=await service.from('employee_accounts')
    .update({username,email}).eq('user_id',id)
   if(rowError)return reply(req,500,{error:'無法更新員工登入名稱'})
   const {error:authError}=await service.auth.admin.updateUserById(id,{
    email,password:body.password,email_confirm:true,
   })
   if(authError){
    const {error:rollbackError}=await service.from('employee_accounts')
     .update({username:employee.username,email:employee.email}).eq('user_id',id)
    if(rollbackError)console.error('Legacy account conversion rollback failed',rollbackError.code)
    return reply(req,500,{error:'舊帳號轉換失敗，請確認原登入方式仍可使用後再重新操作'})
   }
   return reply(req,200,{ok:true,message:'舊員工帳號已轉換為新登入名稱及管理員設定的密碼，原有權限保留'})
  }

  if(body.action==='delete'){
   const id=body.userId
   if(!validatedUserId(id))return reply(req,400,{error:'員工帳號格式不正確'})
   if(!await findEmployee(id)||await isManager(id))
    return reply(req,404,{error:'找不到可刪除的員工帳號，管理者帳號不可刪除'})
   // auth.users deletion cascades to employee_accounts only. Staff profiles,
   // menu and historical booking tables have no employee-account ownership FK.
   const {error}=await service.auth.admin.deleteUser(id)
   if(error)return reply(req,500,{error:'刪除員工帳號失敗，請先停用帳號並聯繫管理員'})
   return reply(req,200,{ok:true,message:'員工登入帳號與權限已刪除；名帖及預約紀錄保留'})
  }

  return reply(req,400,{error:'未知的帳號操作'})
 }catch(error){
  console.error('Employee account action failed',error instanceof Error?error.name:'Unknown')
  return reply(req,500,{error:'帳號服務暫時無法處理此操作'})
 }
})
