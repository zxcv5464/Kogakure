import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardList, Minus, Plus, RefreshCcw, Send, CircleCheck } from 'lucide-react'
import { configured } from '../lib/config'
import { fetchMenu, initialMenu, sortMenu } from '../lib/menu-catalog'
import type { MenuCatalog } from '../lib/menu-catalog'
import {submitTeaOrder} from '../lib/tea-orders'
import { MENU_PAGE_READY_EVENT } from '../lib/route-events'
import MenuLoading from '../components/MenuLoading'
import './menu-page.css'

export default function MenuPage() {
 const [catalog,setCatalog] = useState<MenuCatalog>(initialMenu)
 const [mode,setMode] = useState<'loading'|'live'|'preview'>(configured ? 'loading' : 'preview')
 const [error,setError] = useState('')
 const [quantities,setQuantities] = useState<Record<string,number>>({})
 const [guestName,setGuestName] = useState('')
 const [guestWorld,setGuestWorld] = useState('')
 const [sending,setSending] = useState(false)
 const [orderError,setOrderError] = useState('')
 const [receipt,setReceipt] = useState<{id:string;name:string;world:string;items:string[];total:number;isAddOn:boolean}|null>(null)
 const [isAdding,setIsAdding] = useState(false)

 useEffect(() => {
  if (!configured) return
  let alive = true
  fetchMenu().then(data => {
   if (!alive) return
   setCatalog(data)
   setError('')
   setMode('live')
  }).catch(e => {
   if (!alive) return
   setMode('preview')
   setError(e instanceof Error ? e.message : '菜單連線異常')
  })
  return () => { alive = false }
 }, [])

 // Announce only when the real catalog or an explicitly labeled preview is ready.
 // The curtain can then reveal the actual menu instead of a transient loader.
 useEffect(() => {
  if (mode !== 'loading') window.dispatchEvent(new Event(MENU_PAGE_READY_EVENT))
 }, [mode])

 const sorted = useMemo(() => sortMenu(catalog),[catalog])
 // Do not flash sample content while the authoritative menu is loading.
 const categories = mode === 'loading' ? [] : sorted.categories.filter(cat => cat.published)
 const items = sorted.items.filter(item => item.published && categories.some(cat => cat.id === item.categoryId))
 const selected = items.filter(item => (quantities[item.id] || 0) > 0 && item.available)
 const total = selected.reduce((sum,item) => sum + item.priceGil * (quantities[item.id] || 0), 0)
 const count = selected.reduce((sum,item) => sum + (quantities[item.id] || 0), 0)

 function changeQuantity(id:string,delta:number) {
  if(receipt)return // A submitted order remains closed until the guest explicitly opens a new add-on order.
  setQuantities(prev => ({ ...prev, [id]: Math.min(99,Math.max(0,(prev[id] || 0)+delta)) }))
  setOrderError('')
 }

 function startAddOn(){
  setReceipt(null)
  setIsAdding(true)
  setQuantities({})
  setOrderError('')
  // Return to the dishes while retaining the game character and world for the next, independent order.
  window.requestAnimationFrame(()=>document.querySelector('.tea-menu-section')?.scrollIntoView({behavior:'smooth',block:'start'}))
 }

 async function sendOrder(e:FormEvent){
  e.preventDefault()
  if(sending)return
  setOrderError('')
  if(mode!=='live'){setOrderError('目前為展示菜單，尚未開放送出訂單');return}
  if(!count){setOrderError('請先選擇至少一份茶宴餐點');return}
  if(selected.length>20||count>100){setOrderError('單次最多 20 種品項、100 份餐點');return}
  setSending(true)
  const snapshot=selected.map(x=>x.name+' × '+quantities[x.id])
  const name=guestName.trim(),world=guestWorld.trim()
  try{
   const id=await submitTeaOrder(name,world,selected.map(x=>({id:x.id,quantity:quantities[x.id]})))
   setReceipt({id,name,world,items:snapshot,total,isAddOn:isAdding})
   setIsAdding(false)
   setQuantities({})
  }catch(error){setOrderError(error instanceof Error?error.message:'訂單未能送出，請稍後重試')}
  finally{setSending(false)}
 }

 if (mode === 'loading') return <MenuLoading />

 return <div className="tea-menu-page">
  <header className="tea-menu-hero">
   <span className="tea-menu-brand">狐隱 · KOGAKURE</span>
   <span className="tea-menu-seal" aria-hidden="true">◇</span>
   <h1>狐之茶宴</h1>
   <p className="tea-menu-subtitle">御品目錄</p>
   <p className="tea-menu-verse">一盞清茶，一席甘味。願旅人於此，暫忘塵世喧囂。</p>
  </header>
  <div className="tea-menu-content">
   {mode === 'preview' && <div className="tea-menu-status" role="status">
    <span>展示菜單</span>
    <p>{error ? '菜單資料庫尚未完成連接，以下為初版展示內容；即時價格及供應狀態請以館方確認為準。' : '目前為初版展示內容。待菜單資料庫設定完成後，將自動切換為館方即時維護的版本。'}</p>
   </div>}
   {mode === 'live' && !categories.length && <p className="tea-menu-state">茶寮菜單正在準備中，敬請期待。</p>}
   {categories.map(cat => {
    const group = items.filter(item => item.categoryId === cat.id)
    return <section key={cat.id} className="tea-menu-section" id={'menu-' + cat.id} aria-labelledby={'menu-heading-'+cat.id}>
     <div className="tea-menu-section-title">
      <span className="tea-menu-ordinal">{cat.ordinalLabel}</span>
      <div>
       <p className="tea-menu-volume">{cat.subtitle}</p>
       <h2 id={'menu-heading-'+cat.id}>{cat.name}</h2>
      </div>
      <span aria-hidden="true" className="tea-menu-flourish">✦</span>
     </div>
     {cat.description && <p className="tea-menu-section-intro">{cat.description}</p>}
     {group.length ? <div className="tea-menu-grid">
      {group.map(item => <article className={'tea-menu-item' + (!item.available ? ' is-sold-out' : '')} key={item.id}>
       <div className="tea-menu-item-head">
        <h3>{item.name}</h3>
        <span className="tea-menu-price">{item.priceGil.toLocaleString('en-US')} <small>Gil</small></span>
       </div>
       <p className="tea-menu-item-desc">{item.description}</p>
       {!item.available ? <span className="tea-menu-unavailable">暫停供應</span> : <div className="tea-menu-qty" aria-label={item.name+'選擇數量'}>
        <button type="button" aria-label={'減少'+item.name} disabled={!!receipt||!(quantities[item.id] > 0)} onClick={()=>changeQuantity(item.id,-1)}><Minus size={15}/></button>
        <output aria-label="數量">{quantities[item.id] || 0}</output>
        <button type="button" aria-label={'增加'+item.name} disabled={!!receipt||quantities[item.id]>=99} onClick={()=>changeQuantity(item.id,1)}><Plus size={15}/></button>
       </div>}
      </article>)}
     </div> : <p className="tea-menu-empty">這一卷御品尚在準備中。</p>}
    </section>
   })}
   <aside className="tea-menu-summary" aria-label="點單清單"> 
    {receipt&&<div className="tea-menu-order-success" role="status">
     <CircleCheck size={23}/>
     <div><h3>{receipt.isAddOn?'茶宴加點已送出，等待館方確認':'茶宴點單已送出，等待館方確認'}</h3>
      <p>旅人：{receipt.name} · {receipt.world}</p>
      <p>訂單編號：<code>{receipt.id}</code></p>
      <ul>{receipt.items.map((line,i)=><li key={i}>{line}</li>)}</ul>
      <strong>合計 {receipt.total.toLocaleString('en-US')} Gil</strong>
      <p>{receipt.isAddOn?'本次加點已建立獨立新訂單，原訂單內容與金額不變。':'這筆訂單已送出，若需追加餐點，請另開一筆加點訂單。'}</p>
      <button className="tea-menu-add-on" type="button" onClick={startAddOn}><Plus size={16}/>加點 · 建立新訂單</button>
     </div>
    </div>}
    {!receipt&&<>
    <div className="tea-menu-summary-heading">
     <ClipboardList size={19}/><h2>{isAdding?'加點選單 · 新訂單':'旅人點單'}</h2><span>{count} 份</span>
     {selected.length>0&&<button type="button" className="tea-menu-clear"
      onClick={()=>{setQuantities({});setOrderError('')}}
      disabled={sending}><RefreshCcw size={14}/>清空選擇</button>}
    </div>
    {selected.length ? <>
     <ul>{selected.map(item=><li key={item.id}><span>{item.name} × {quantities[item.id]}</span><strong>{(item.priceGil * quantities[item.id]).toLocaleString('en-US')} Gil</strong></li>)}</ul>
     <div className="tea-menu-total"><span>合計</span><strong>{total.toLocaleString('en-US')} Gil</strong></div>
     <form id="tea-order-submit" className="tea-menu-order-form" onSubmit={e=>void sendOrder(e)}>
      <h3>{isAdding?'送出加點訂單':'送出茶宴點單'}</h3>
      <p>{isAdding?'此次加點會產生全新訂單編號，與原訂單分開處理。已沿用上次填寫的旅人姓名與伺服器，可自行修改。':'請填寫《FINAL FANTASY XIV》角色姓名與所在伺服器，館方才能辨識您的訂單。'}</p>
      <div className="tea-menu-order-fields">
       <label>旅人角色姓名 <span>必填</span>
        <input required minLength={2} maxLength={48} autoComplete="off"
         value={guestName} onChange={e=>setGuestName(e.target.value)}
         placeholder="請輸入角色姓名" disabled={sending}/>
       </label>
       <label>所在伺服器 <span>必填</span>
        <input required minLength={2} maxLength={48} autoComplete="off"
         value={guestWorld} onChange={e=>setGuestWorld(e.target.value)}
         placeholder="例如：Leviathan" disabled={sending}/>
       </label>
      </div>
      {orderError&&<p className="tea-menu-order-error" role="alert">{orderError}</p>}
      <button className="tea-menu-send" type="submit" disabled={sending||mode!=='live'}>
       <Send size={17}/>{sending?'正在送出點單…':isAdding?'確認送出加點訂單':'確認送出訂單'}
      </button>
      {mode!=='live'&&<p className="tea-menu-order-error">展示菜單無法送出訂單；待正式菜單連線後開放。</p>}
     </form>
    </> : <p className="tea-menu-cart-empty">點選御品旁的 ＋，將喜愛的茶點收入清單。</p>}
    <p className="tea-menu-summary-note">送出後由館方接單確認。餐點及 Gil 金額以送出時資料庫價格為準；送出不代表完成付款，請依館內人員指示結算。加點將另立新單；同名同伺服器 15 秒內不可重複提交。</p>
    </>}
   </aside>
   <footer className="tea-menu-ending">
    <span aria-hidden="true">◇</span>
    <p>茶香未盡，狐影猶存。</p>
    <p>願這場短暫的相逢，成為旅人心中一段溫柔的記憶。</p>
    <small>狐隱 · KOGAKURE</small>
   </footer>
  </div>
 </div>
}
