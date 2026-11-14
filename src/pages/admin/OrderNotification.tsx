import {useEffect,useState} from 'react'
import {ShoppingBag} from 'lucide-react'
import {Link} from 'react-router-dom'
import {countPendingTeaOrders,watchTeaOrders} from '../../lib/tea-orders'
import {useAdminEditGuard} from './AdminEditGuard'

/** Exact count; does not download or expose guest names in the sidebar. */
export function usePendingTeaOrders(enabled:boolean){
 const [pendingCount,setPendingCount]=useState<number|null>(null)
 const [failed,setFailed]=useState(false)
 useEffect(()=>{
  if(!enabled){setPendingCount(null);setFailed(false);return}
  let active=true,version=0
  async function refresh(){
   const current=++version
   try{
    const count=await countPendingTeaOrders()
    if(!active||current!==version)return
    setPendingCount(count);setFailed(false)
   }catch{
    if(active&&current===version){setPendingCount(null);setFailed(true)}
   }
  }
  void refresh()
  const unwatch=watchTeaOrders(()=>{void refresh()})
  const poll=window.setInterval(()=>{
   if(document.visibilityState==='visible')void refresh()
  },9000)
  const onFocus=()=>{void refresh()}
  const onVisible=()=>{if(document.visibilityState==='visible')void refresh()}
  window.addEventListener('focus',onFocus)
  document.addEventListener('visibilitychange',onVisible)
  return()=>{
   active=false
   unwatch()
   window.clearInterval(poll)
   window.removeEventListener('focus',onFocus)
   document.removeEventListener('visibilitychange',onVisible)
  }
 },[enabled])
 return {pendingCount,failed}
}

export default function OrderNotification({count}:{count:number|null}){
 const {confirmNavigation}=useAdminEditGuard()
 if(count===null||count===0)return null
 return <div className="admin-booking-notify admin-tea-order-notify" role="status">
  <ShoppingBag size={18}/>
  <span><strong>新茶宴點單 · {count} 筆待接單</strong>
   <small>旅人已送出餐點，請查看訂單並確認製作安排</small>
  </span>
  <Link to="/admin/orders" onClick={confirmNavigation}>查看訂單管理</Link>
 </div>
}
