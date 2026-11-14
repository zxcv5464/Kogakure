import {configured} from './config'
import {supabase} from './supabase'

export type TeaOrderStatus = 'pending'|'preparing'|'completed'|'cancelled'
export type TeaOrderLine = {
 id:string;menuItemId:string|null;name:string;unitGil:number;quantity:number;lineGil:number
}
export type TeaOrder = {
 id:string;guestName:string;guestWorld:string;status:TeaOrderStatus
 totalGil:number;createdAt:string;updatedAt:string;lines:TeaOrderLine[]
}
export type TeaOrderSelection = {id:string;quantity:number}

const client=()=>{if(!configured||!supabase)throw new Error('茶宴訂單服務暫時無法使用');return supabase}
const message=(e:unknown)=>e instanceof Error?e.message:'服務連線發生異常'

export async function submitTeaOrder(guestName:string,guestWorld:string,items:TeaOrderSelection[]):Promise<string>{
 const name=guestName.trim(),world=guestWorld.trim()
 if(name.length<2||name.length>48||world.length<2||world.length>48)
  throw new Error('請填寫 2～48 字的旅人姓名與伺服器')
 if(items.length<1||items.length>20||items.some(x=>!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>99))
  throw new Error('請選擇可供應的茶宴品項及正確數量')
 if(items.reduce((sum,x)=>sum+x.quantity,0)>100)
  throw new Error('單次點單最多 100 份餐點')
 const {data,error}=await client().rpc('submit_tea_order',{
  p_guest_name:name,p_guest_world:world,
  p_items:items.map(x=>({id:x.id,quantity:x.quantity})),
 })
 if(error)throw new Error(error.message||'點單未能送出')
 if(typeof data!=='string'||!data)throw new Error('送出結果不明，請先聯絡館方確認，避免重複點單')
 return data
}
type TeaOrderRow={
 id:string;guest_name:string;guest_world:string;status:TeaOrderStatus;
 total_gil:number;created_at:string;updated_at:string;
 tea_order_items:{id:string;menu_item_id:string|null;item_name:string;unit_gil:number;quantity:number;line_gil:number}[]
}
export async function fetchTeaOrders():Promise<TeaOrder[]>{
 const {data,error}=await client().from('tea_orders')
  .select('id,guest_name,guest_world,status,total_gil,created_at,updated_at,tea_order_items(id,menu_item_id,item_name,unit_gil,quantity,line_gil)')
  .order('created_at',{ascending:false}).limit(200)
 if(error)throw new Error(error.message||'無法讀取茶宴訂單')
 return (data as TeaOrderRow[]).map(r=>({
  id:r.id,guestName:r.guest_name,guestWorld:r.guest_world,status:r.status,
  totalGil:r.total_gil,createdAt:r.created_at,updatedAt:r.updated_at,
  lines:(r.tea_order_items||[]).map(x=>({
   id:x.id,menuItemId:x.menu_item_id,name:x.item_name,
   unitGil:x.unit_gil,quantity:x.quantity,lineGil:x.line_gil,
  })),
 }))
}
export async function advanceTeaOrder(id:string,status:'preparing'|'completed'|'cancelled'){
 const {error}=await client().rpc('advance_tea_order',{p_order_id:id,p_next_status:status})
 if(error)throw new Error(error.message||'無法更新訂單狀態')
}
/** Permanently removes exactly one order and its line items, after backend role validation. */
export async function deleteTeaOrder(id:string):Promise<void>{
 const {error}=await client().rpc('delete_tea_order',{p_order_id:id})
 if(error)throw new Error(error.message||'無法刪除這筆訂單')
}

export async function countPendingTeaOrders():Promise<number>{
 const {count,error}=await client().from('tea_orders')
  .select('id',{count:'exact',head:true}).eq('status','pending')
 if(error||count===null)throw new Error(error?.message||'暫時無法讀取待處理訂單')
 return count
}
export function watchTeaOrders(change:()=>void):()=>void{
 if(!supabase)return ()=>undefined
 const channel=supabase.channel('tea-orders-'+Math.random().toString(36).slice(2))
 .on('postgres_changes',{event:'*',schema:'public',table:'tea_orders'},()=>change())
 .subscribe()
 return ()=>{void supabase?.removeChannel(channel)}
}
export const formatGil=(value:number)=>value.toLocaleString('en-US')+' Gil'
export const teaOrderError=message
