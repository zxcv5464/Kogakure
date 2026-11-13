import { useEffect, useMemo, useState } from 'react'
import { Check, ClipboardList, Minus, Plus, RefreshCcw } from 'lucide-react'
import { configured } from '../lib/config'
import { fetchMenu, initialMenu, sortMenu } from '../lib/menu-catalog'
import type { MenuCatalog } from '../lib/menu-catalog'
import './menu-page.css'

export default function MenuPage() {
 const [catalog,setCatalog] = useState<MenuCatalog>(initialMenu)
 const [mode,setMode] = useState<'loading'|'live'|'preview'>(configured ? 'loading' : 'preview')
 const [error,setError] = useState('')
 const [quantities,setQuantities] = useState<Record<string,number>>({})
 const [copied,setCopied] = useState(false)

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

 const sorted = useMemo(() => sortMenu(catalog),[catalog])
 const categories = sorted.categories.filter(cat => cat.published)
 const items = sorted.items.filter(item => item.published && categories.some(cat => cat.id === item.categoryId))
 const selected = items.filter(item => (quantities[item.id] || 0) > 0 && item.available)
 const total = selected.reduce((sum,item) => sum + item.priceGil * (quantities[item.id] || 0), 0)
 const count = selected.reduce((sum,item) => sum + (quantities[item.id] || 0), 0)

 function changeQuantity(id:string,delta:number) {
  setQuantities(prev => ({ ...prev, [id]: Math.min(99,Math.max(0,(prev[id] || 0)+delta)) }))
  setCopied(false)
 }

 const orderText = [
  '狐隱 · KOGAKURE｜茶宴點單',
  ...selected.map(item => `${item.name} × ${quantities[item.id]}　${(item.priceGil * quantities[item.id]).toLocaleString('en-US')} Gil`),
  '合計：' + total.toLocaleString('en-US') + ' Gil',
 ]
 async function copyOrder() {
  if (!count) return
  try {
   await navigator.clipboard.writeText(orderText.join('\n'))
   setCopied(true)
  } catch {
   // Clipboard access is not guaranteed on every embedded browser.
   setCopied(false)
   window.prompt('請複製以下點單內容',orderText.join('\n'))
  }
 }

 return <div className="tea-menu-page">
  <header className="tea-menu-hero">
   <span className="tea-menu-brand">狐隱 · KOGAKURE</span>
   <span className="tea-menu-seal" aria-hidden="true">◇</span>
   <h1>狐之茶宴</h1>
   <p className="tea-menu-subtitle">御品目錄</p>
   <p className="tea-menu-verse">一盞清茶，一席甘味。願旅人於此，暫忘塵世喧囂。</p>
  </header>
  <div className="tea-menu-content">
   {mode === 'loading' && <p role="status" className="tea-menu-state">正在尋訪茶寮中的御品…</p>}
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
        <button type="button" aria-label={'減少'+item.name} disabled={!(quantities[item.id] > 0)} onClick={()=>changeQuantity(item.id,-1)}><Minus size={15}/></button>
        <output aria-label="數量">{quantities[item.id] || 0}</output>
        <button type="button" aria-label={'增加'+item.name} disabled={quantities[item.id]>=99} onClick={()=>changeQuantity(item.id,1)}><Plus size={15}/></button>
       </div>}
      </article>)}
     </div> : <p className="tea-menu-empty">這一卷御品尚在準備中。</p>}
    </section>
   })}
   <aside className="tea-menu-summary" aria-label="點單清單">
    <div className="tea-menu-summary-heading"><ClipboardList size={19}/><h2>旅人點單</h2><span>{count} 品</span></div>
    {selected.length ? <>
     <ul>{selected.map(item=><li key={item.id}><span>{item.name} × {quantities[item.id]}</span><strong>{(item.priceGil * quantities[item.id]).toLocaleString('en-US')} Gil</strong></li>)}</ul>
     <div className="tea-menu-total"><span>合計</span><strong>{total.toLocaleString('en-US')} Gil</strong></div>
     <div className="tea-menu-summary-actions">
      <button type="button" className="tea-menu-copy" onClick={()=>void copyOrder()}>{copied?<><Check size={17}/> 已複製</>:<><ClipboardList size={17}/> 複製點單</>}</button>
      <button type="button" className="tea-menu-clear" onClick={()=>{setQuantities({});setCopied(false)}}><RefreshCcw size={15}/> 清空</button>
     </div>
    </> : <p className="tea-menu-cart-empty">點選御品旁的 ＋，將喜愛的茶點收入清單。</p>}
    <p className="tea-menu-summary-note">點單僅供整理與複製，尚未送出預約或訂單；請交由館內狐姬確認供應及收款。</p>
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
