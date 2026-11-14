import {useCallback,useEffect,useMemo,useState} from 'react'
import {Check,Clock3,RefreshCw,ShoppingBag,Timer,TriangleAlert,X} from 'lucide-react'
import {advanceTeaOrder,fetchTeaOrders,formatGil,watchTeaOrders} from '../../lib/tea-orders'
import type {TeaOrder,TeaOrderStatus} from '../../lib/tea-orders'
import './orders-management.css'

const statusName:Record<TeaOrderStatus,string>={
 pending:'待接單',preparing:'製作中',completed:'已完成',cancelled:'已取消',
}
const dateText=(s:string)=>new Intl.DateTimeFormat('zh-TW',{
 timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hour12:false,
}).format(new Date(s))
const errText=(error:unknown)=>error instanceof Error?error.message:'訂單資料暫時無法更新'
type Filter='active'|TeaOrderStatus|'all'

export default function OrdersManagement(){
 const [orders,setOrders]=useState<TeaOrder[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [filter,setFilter]=useState<Filter>('active')
 const [saving,setSaving]=useState<string|null>(null)

 const refresh=useCallback(async()=>{
  const next=await fetchTeaOrders()
  setOrders(next);setError('')
 },[])
 useEffect(()=>{
  let active=true
  async function run(){try{await refresh()}catch(e){if(active)setError(errText(e))}finally{if(active)setLoading(false)}}
  void run()
  const unwatch=watchTeaOrders(()=>{void run()})
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void run()},12000)
  const onFocus=()=>{void run()}
  window.addEventListener('focus',onFocus)
  return()=>{active=false;unwatch();window.clearInterval(interval);window.removeEventListener('focus',onFocus)}
 },[refresh])

 async function advance(order:TeaOrder,to:'preparing'|'completed'|'cancelled'){
  if(saving)return
  if(to==='cancelled'&&!window.confirm('確定取消「'+order.guestName+'」的這筆茶宴訂單嗎？此操作無法復原。'))return
  setSaving(order.id);setNotice('');setError('')
  try{
   await advanceTeaOrder(order.id,to)
   await refresh()
   setNotice('訂單 '+order.id.slice(0,8)+' 已更新為「'+statusName[to]+'」')
  }catch(e){setError(errText(e))}
  finally{setSaving(null)}
 }
 const stats=useMemo(()=>({
  pending:orders.filter(x=>x.status==='pending').length,
  preparing:orders.filter(x=>x.status==='preparing').length,
  completed:orders.filter(x=>x.status==='completed').length,
  cancelled:orders.filter(x=>x.status==='cancelled').length,
 }),[orders])
 const displayed=orders.filter(x=>filter==='all'||(filter==='active'?x.status==='pending'||x.status==='preparing':x.status===filter))
 const tabs: {id:Filter;text:string}[]=[
  {id:'active',text:'待處理'},
  {id:'pending',text:'待接單'},
  {id:'preparing',text:'製作中'},
  {id:'completed',text:'已完成'},
  {id:'cancelled',text:'已取消'},
  {id:'all',text:'全部'},
 ]
 return <section className="tea-order-admin admin-page">
  <header className="tea-order-admin-header">
   <div><p className="eyebrow">KOGAKURE · TEA BANQUET</p>
    <h1>茶宴訂單管理</h1>
    <p>旅人送出的茶宴點單，請確認供應、製作進度與館內收款。</p>
   </div>
   <button type="button" onClick={()=>{void refresh().catch(e=>setError(errText(e)))}} disabled={!!saving}>
    <RefreshCw size={16}/>更新訂單
   </button>
  </header>
  <div className="tea-order-admin-stats" aria-label="訂單狀態統計">
   <div><strong>{stats.pending}</strong><span>待接單</span></div>
   <div><strong>{stats.preparing}</strong><span>製作中</span></div>
   <div><strong>{stats.completed}</strong><span>已完成</span></div>
   <div><strong>{stats.cancelled}</strong><span>已取消</span></div>
  </div>
  {error&&<p className="tea-order-admin-error" role="alert"><TriangleAlert size={17}/>{error}</p>}
  {notice&&<p className="tea-order-admin-notice" role="status"><Check size={17}/>{notice}</p>}
  <nav className="tea-order-admin-filters" aria-label="篩選訂單狀態">
   {tabs.map(tab=><button key={tab.id} type="button"
    className={filter===tab.id?'is-active':''} aria-pressed={filter===tab.id}
    onClick={()=>setFilter(tab.id)}>
    {tab.text} {tab.id==='active'?stats.pending+stats.preparing:tab.id==='all'?orders.length:stats[tab.id]}
   </button>)}
  </nav>
  {loading?<p className="tea-order-admin-empty" role="status">正在讀取茶宴訂單…</p>
   :!displayed.length?<p className="tea-order-admin-empty">此分類目前沒有訂單。</p>:
   <div className="tea-order-admin-list">
    {displayed.map(order=><article className="tea-order-admin-card" key={order.id}>
     <header className="tea-order-admin-card-heading">
      <div><span className="tea-order-admin-date"><Clock3 size={14}/>{dateText(order.createdAt)}</span>
       <h2>{order.guestName}</h2>
       <p>{order.guestWorld} · 單號 {order.id.slice(0,8)}</p>
      </div>
      <span className={'tea-order-admin-status is-'+order.status}>{statusName[order.status]}</span>
     </header>
     <ul className="tea-order-admin-lines">
      {order.lines.map(line=><li key={line.id}>
       <span>{line.name} <small>× {line.quantity}</small></span>
       <strong>{formatGil(line.lineGil)}</strong>
      </li>)}
     </ul>
     <div className="tea-order-admin-total"><span>訂單總額</span><strong>{formatGil(order.totalGil)}</strong></div>
     <div className="tea-order-admin-actions">
      {order.status==='pending'&&<button type="button" className="is-accept"
       disabled={saving!==null} onClick={()=>void advance(order,'preparing')}>
       <ShoppingBag size={16}/>{saving===order.id?'處理中…':'接單 · 開始製作'}
      </button>}
      {order.status==='preparing'&&<button type="button" className="is-finish"
       disabled={saving!==null} onClick={()=>void advance(order,'completed')}>
       <Timer size={16}/>{saving===order.id?'處理中…':'完成訂單'}
      </button>}
      {(order.status==='pending'||order.status==='preparing')&&<button type="button" className="is-cancel"
       disabled={saving!==null} onClick={()=>void advance(order,'cancelled')}>
       <X size={15}/>取消訂單
      </button>}
      {(order.status==='completed'||order.status==='cancelled')&&<span className="tea-order-admin-closed">
       {order.status==='completed'?'已結束製作':'訂單已取消'}
      </span>}
     </div>
    </article>)}
   </div>}
  <p className="tea-order-admin-footnote">顯示最新 200 筆訂單。旅人提供的姓名與伺服器僅供館內確認與服務；網站送單不會自動扣除 Gil。</p>
 </section>
}
