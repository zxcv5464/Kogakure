import { supabase } from './supabase'

export const EMPLOYEE_PERMISSIONS = [
 { id:'staff.manage',label:'員工名帖',description:'建立／編輯名帖、照片、排序與公開狀態' },
 { id:'menu.manage',label:'茶宴菜單',description:'編輯餐點分類、品項與 Gil 售價' },
 { id:'booking.manage',label:'預約管理',description:'查看旅人預約、接取／婉拒與管理方案' },
] as const

export type EmployeePermission = typeof EMPLOYEE_PERMISSIONS[number]['id']
export type BackofficeAccess = { kind:'owner'; permissions:EmployeePermission[] } |
 { kind:'employee'; permissions:EmployeePermission[]; active:boolean; displayName:string }

export type EmployeeAccount = {
 userId:string; email:string; displayName:string
 permissions:EmployeePermission[]; active:boolean; createdAt:string
}
type EmployeeRow={
 user_id:string; email:string; display_name:string
 permissions:string[]; active:boolean; created_at:string
}
const allIds=EMPLOYEE_PERMISSIONS.map(item=>item.id)
const isPermission=(x:string):x is EmployeePermission => allIds.includes(x as EmployeePermission)
export function permitted(access:BackofficeAccess,permission:EmployeePermission){
 return access.kind==='owner' || (access.active && access.permissions.includes(permission))
}

function client(){if(!supabase)throw new Error('尚未設定 Supabase');return supabase}

export async function getBackofficeAccess(id:string):Promise<BackofficeAccess|null>{
 const [admin,employee]=await Promise.all([
  client().from('admin_users').select('user_id').eq('user_id',id).maybeSingle(),
  client().from('employee_accounts').select('user_id,display_name,active,permissions').eq('user_id',id).maybeSingle(),
 ])
 if(admin.error)throw admin.error
 if(employee.error)throw employee.error
 if(admin.data)return {kind:'owner',permissions:[...allIds]}
 const entry=employee.data
 if(!entry||!entry.active)return null
 const permissions=(Array.isArray(entry.permissions)?entry.permissions:[])
  .filter((v:string)=>isPermission(v))
 return {kind:'employee',permissions,active:true,displayName:String(entry.display_name||'館員')}
}

export async function listEmployeeAccounts():Promise<EmployeeAccount[]>{
 const {data,error}=await client().from('employee_accounts')
  .select('user_id,email,display_name,permissions,active,created_at')
  .order('created_at',{ascending:false})
 if(error)throw error
 return (data as EmployeeRow[]).map(r=>({
  userId:r.user_id,email:r.email,displayName:r.display_name,
  active:r.active,createdAt:r.created_at,
  permissions:(r.permissions||[]).filter(isPermission),
 }))
}

async function invokeAccountAction(body:Record<string,unknown>):Promise<string>{
 const {data,error}=await client().functions.invoke('manage-employee-accounts',{body})
 if(error){
  // For non-2xx responses, functions.invoke places the JSON response in
  // error.context. Prefer the safe message returned by our own Edge Function.
  const context=(error as {context?:unknown}).context
  if(context && typeof context==='object' && 'json' in context &&
    typeof (context as Response).json==='function'){
   try{
    const payload=await (context as Response).json() as {error?:string}
    if(payload.error)throw new Error(payload.error)
   }catch(e){if(e instanceof Error && e.message!== 'Unexpected end of JSON input')throw e}
  }
  throw new Error(error.message||'後台帳號服務無法連線')
 }
 if(data?.error)throw new Error(data.error)
 return typeof data?.message==='string'?data.message:'設定已儲存'
}

export async function inviteEmployee(input:{
 email:string;displayName:string;permissions:EmployeePermission[]
}):Promise<string>{
 return invokeAccountAction({action:'invite',...input})
}
export async function updateEmployee(input:{
 userId:string;displayName:string;permissions:EmployeePermission[];active:boolean
}):Promise<string>{
 return invokeAccountAction({action:'update',...input})
}
