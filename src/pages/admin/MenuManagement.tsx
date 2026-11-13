import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
 deleteMenuCategory, deleteMenuItem, fetchMenu,
 saveMenuCategory, saveMenuItem, sortMenu,
} from '../../lib/menu-catalog'
import type { MenuCatalog, MenuCategory, MenuItem } from '../../lib/menu-catalog'
import { useAdminEditGuard } from './AdminEditGuard'
import './menu-management.css'

type Selection =
 | { type:'category'; value: MenuCategory; original: MenuCategory; creating: boolean }
 | { type:'item'; value: MenuItem; original: MenuItem; creating: boolean }
type Notice = {kind:'error'|'success'|'info';text:string}
const initial: MenuCatalog = { categories:[], items:[] }
function describe(error:unknown): string {
 if (error instanceof Error) return error.message
 if (typeof error === 'string' && error.trim()) return error
 if (error && typeof error === 'object') {
  const info = error as Record<string,unknown>
  const message = typeof info.message === 'string' ? info.message : ''
  const code = typeof info.code === 'string' ? info.code : ''
  const details = typeof info.details === 'string' ? info.details : ''
  const hint = typeof info.hint === 'string' ? info.hint : ''
  const result = [code && '['+code+']',message,details,hint && '提示：'+hint].filter(Boolean).join(' · ')
  if (result) return result
 }
 return '無法辨識資料庫錯誤，請重新整理後檢查 Supabase 連線狀態'
}
const ascending = (rows:MenuCatalog) => sortMenu(rows)

export default function MenuManagement() {
 const [catalog,setCatalog] = useState<MenuCatalog>(initial)
 const [loading,setLoading] = useState(true)
 const [loadError,setLoadError] = useState('')
 const [busy,setBusy] = useState(false)
 const busyRef = useRef(false)
 const [notice,setNotice] = useState<Notice|null>(null)
 const [selection,setSelection] = useState<Selection|null>(null)
 const [tab,setTab] = useState<'category'|'item'>('item')
 const [query,setQuery] = useState('')
 const editorRef = useRef<HTMLDivElement>(null)
 const {setEditing} = useAdminEditGuard()

 const dirty = Boolean(selection && (selection.creating || JSON.stringify(selection.value) !== JSON.stringify(selection.original)))
 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 const refresh = useCallback(async()=>{
  const result = await fetchMenu(true)
  setCatalog(ascending(result))
  setLoadError('')
  return result
 },[])
 useEffect(()=>{
  let active=true
  fetchMenu(true).then(result=>{if(active)setCatalog(ascending(result))})
   .catch(error=>{if(active)setLoadError(describe(error))})
   .finally(()=>{if(active)setLoading(false)})
  return ()=>{active=false}
 },[])

 const visible = useMemo(()=>{
  const lower=query.trim().toLocaleLowerCase()
  if(tab==='category')return catalog.categories.filter(row=>!lower||[row.name,row.subtitle,row.description].join(' ').toLocaleLowerCase().includes(lower))
  return catalog.items.filter(row=>!lower||[row.name,row.description,catalog.categories.find(cat=>cat.id===row.categoryId)?.name || ''].join(' ').toLocaleLowerCase().includes(lower))
 },[catalog,query,tab])

 function mayDiscard() {
  if(busyRef.current) return false
  return !dirty || window.confirm('菜單有尚未儲存的修改，確定放棄變更？')
 }
 function choose(row:MenuCategory|MenuItem,type:'category'|'item') {
  if(!mayDiscard()) return
  if(type==='category')setSelection({type:'category',value:{...row} as MenuCategory,original:{...row} as MenuCategory,creating:false})
  else setSelection({type:'item',value:{...row} as MenuItem,original:{...row} as MenuItem,creating:false})
  setNotice(null)
  if(window.matchMedia('(max-width:850px)').matches)requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))
 }
 function switchTab(next:'category'|'item') {
  if(tab===next)return
  if(!mayDiscard())return
  setTab(next);setSelection(null);setQuery('');setNotice(null)
 }
 function createNew() {
  if(!mayDiscard())return
  const order=tab==='category'
   ? Math.max(0,...catalog.categories.map(row=>row.sortOrder))+10
   : Math.max(0,...catalog.items.map(row=>row.sortOrder))+10
  if(tab==='category'){
   const value:MenuCategory={id:crypto.randomUUID(),ordinalLabel:'',name:'',subtitle:'',description:'',sortOrder:order,published:false,updatedAt:''}
   setSelection({type:'category',value,original:{...value},creating:true})
  } else {
   const first=catalog.categories[0]
   if(!first){setNotice({kind:'error',text:'請先新增至少一個菜單分類。'});return}
   const value:MenuItem={id:crypto.randomUUID(),categoryId:first.id,name:'',description:'',priceGil:0,sortOrder:order,published:false,available:true,updatedAt:''}
   setSelection({type:'item',value,original:{...value},creating:true})
  }
  setNotice(null)
  if(window.matchMedia('(max-width:850px)').matches)requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))
 }
 function patchCategory<K extends keyof MenuCategory>(field:K,value:MenuCategory[K]){
  setSelection(prev=>prev?.type==='category'?{...prev,value:{...prev.value,[field]:value}}:prev)
 }
 function patchItem<K extends keyof MenuItem>(field:K,value:MenuItem[K]){
  setSelection(prev=>prev?.type==='item'?{...prev,value:{...prev.value,[field]:value}}:prev)
 }

 async function save() {
  if(!selection || busyRef.current)return
  if(!selection.value.name.trim()){setNotice({kind:'error',text:'請填寫名稱'});return}
  if(!Number.isInteger(selection.value.sortOrder)||selection.value.sortOrder<0){setNotice({kind:'error',text:'顯示順序需為非負整數'});return}
  if(selection.type==='item'){
   if(!catalog.categories.some(c=>c.id===selection.value.categoryId)){setNotice({kind:'error',text:'請選擇有效的分類'});return}
   if(!Number.isSafeInteger(selection.value.priceGil)||selection.value.priceGil<0||selection.value.priceGil>999999999){setNotice({kind:'error',text:'Gil 金額需為 0～999,999,999 的整數'});return}
  }
  busyRef.current=true;setBusy(true);setNotice(null)
  try{
   if(selection.type==='category')await saveMenuCategory(selection.value,selection.creating)
   else await saveMenuItem(selection.value,selection.creating)
   const result=await refresh()
   const fresh=selection.type==='category'
    ? result.categories.find(row=>row.id===selection.value.id)
    : result.items.find(row=>row.id===selection.value.id)
   if(fresh){
    if(selection.type==='category')setSelection({type:'category',value:{...fresh} as MenuCategory,original:{...fresh} as MenuCategory,creating:false})
    else setSelection({type:'item',value:{...fresh} as MenuItem,original:{...fresh} as MenuItem,creating:false})
   }else setSelection(null)
   setNotice({kind:'success',text:'菜單已儲存；已公開內容會同步提供給前台，下次重新載入時生效。'})
  }catch(e){setNotice({kind:'error',text:'儲存失敗：'+describe(e)})}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function remove(){
  if(!selection || selection.creating || busyRef.current)return
  if(selection.type==='category' && catalog.items.some(item=>item.categoryId===selection.value.id)){
   setNotice({kind:'error',text:'此分類仍有品項。請先移動或刪除所屬品項，才能刪除此分類。'});return
  }
  if(!window.confirm('確定永久刪除「'+selection.value.name+'」？此操作無法復原。'))return
  busyRef.current=true;setBusy(true);setNotice(null)
  try{
   if(selection.type==='category')await deleteMenuCategory(selection.value)
   else await deleteMenuItem(selection.value)
   await refresh()
   setSelection(null)
   setNotice({kind:'success',text:'已刪除選取的菜單內容。'})
  }catch(e){setNotice({kind:'error',text:'刪除失敗：'+describe(e)})}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function retry(){
  if(busyRef.current)return
  setLoading(true);setNotice(null)
  try{await refresh()}catch(e){setLoadError(describe(e))}
  finally{setLoading(false)}
 }

 return <section className="menu-admin admin-page">
  <header className="menu-admin-header">
   <div><p className="eyebrow">KOGAKURE · MENU CONSOLE</p><h1>茶宴菜單管理</h1><p>修改分類、御品名稱、說明、Gil 金額、供應狀態及公開順序。</p></div>
   <div className="menu-admin-header-actions">
    <button type="button" className="menu-admin-secondary" disabled={busy||loading} onClick={()=>{if(mayDiscard())void retry()}}><RefreshCw size={16}/>重新整理</button>
    <Link className="menu-admin-secondary" target="_blank" rel="noopener noreferrer" to="/menu"><ExternalLink size={16}/>查看前台</Link>
   </div>
  </header>
  {notice && <p role="status" className={'menu-admin-notice is-'+notice.kind}>{notice.kind==='success'?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>} {notice.text}</p>}
  {loadError && <div className="menu-admin-notice is-error" role="alert"><AlertCircle size={20}/><div>菜單資料庫讀取失敗：{loadError}<p>請確認已在 Supabase 執行 <code>supabase/migrations/20261113_01_menu.sql</code>，並驗證管理員權限和 RLS。未連線時不會假裝儲存成功。</p></div></div>}
  {loading ? <p role="status" className="menu-admin-loading">正在讀取茶寮菜單…</p> : !loadError && <div className="menu-admin-layout">
   <aside className="menu-admin-roster" aria-label="菜單項目">
    <div className="menu-admin-tabs">
     <button type="button" className={tab==='item'?'active':''} onClick={()=>switchTab('item')}>御品 {catalog.items.length}</button>
     <button type="button" className={tab==='category'?'active':''} onClick={()=>switchTab('category')}>分類 {catalog.categories.length}</button>
    </div>
    <label className="menu-admin-search"><Search size={16}/><span className="sr-only">搜尋菜單</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋分類或御品…"/></label>
    <button type="button" className="menu-admin-add" onClick={createNew}><Plus size={16}/>新增{tab==='item'?'御品':'分類'}</button>
    <div className="menu-admin-list">
     {visible.map(row=><button key={row.id} type="button" className={'menu-admin-list-item'+(selection?.value.id===row.id?' active':'')} onClick={()=>choose(row,tab)}>
      <span><strong>{row.name}</strong><small>{tab==='item'?(catalog.categories.find(cat=>cat.id===(row as MenuItem).categoryId)?.name || '未分類')+' · '+(row as MenuItem).priceGil.toLocaleString()+' Gil':(row as MenuCategory).subtitle}</small></span>
      <em className={row.published?'published':''}>{row.published?'公開':'草稿'}</em>
     </button>)}
     {visible.length===0&&<p className="menu-admin-no-items">沒有符合的項目。</p>}
    </div>
   </aside>
   <div className="menu-admin-editor" ref={editorRef}>
    {!selection ? <div className="menu-admin-editor-empty">請從左側選擇御品，或建立新的分類與菜單內容。</div> :
     <form onSubmit={e=>{e.preventDefault();void save()}}>
      <div className="menu-admin-editor-top"><div><p className="eyebrow">{selection.type==='category'?'菜單分類':'茶宴御品'}</p><h2>{selection.creating?'新增'+(selection.type==='category'?'分類':'御品'):selection.value.name}</h2></div><button type="button" className="menu-admin-icon" aria-label="取消編輯" onClick={()=>{if(mayDiscard())setSelection(null)}}><X size={20}/></button></div>
      <fieldset disabled={busy} className="menu-admin-fields">
       <label>名稱 <input required maxLength={selection.type==='category'?60:80} value={selection.value.name} onChange={e=>selection.type==='category'?patchCategory('name',e.target.value):patchItem('name',e.target.value)}/></label>
       {selection.type==='category'?<>
        <div className="menu-admin-fields-row">
         <label>章節標示 <input maxLength={16} placeholder="例：壹" value={selection.value.ordinalLabel} onChange={e=>patchCategory('ordinalLabel',e.target.value)}/></label>
         <label>卷名 <input maxLength={80} placeholder="例：茶寮之卷" value={selection.value.subtitle} onChange={e=>patchCategory('subtitle',e.target.value)}/></label>
        </div>
        <label>分類說明 <textarea rows={3} value={selection.value.description} onChange={e=>patchCategory('description',e.target.value)} /></label>
       </>:<>
        <label>所屬分類 <select value={selection.value.categoryId} onChange={e=>patchItem('categoryId',e.target.value)}>{catalog.categories.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
        <label>御品內容說明 <textarea rows={4} value={selection.value.description} onChange={e=>patchItem('description',e.target.value)} /></label>
        <label>價格（Gil） <input type="number" required min={0} max={999999999} step={1} value={selection.value.priceGil} onChange={e=>patchItem('priceGil',Number(e.target.value))}/></label>
       </>}
       <label>顯示排序（數字越小越前面） <input type="number" min={0} step={1} required value={selection.value.sortOrder} onChange={e=>selection.type==='category'?patchCategory('sortOrder',Number(e.target.value)):patchItem('sortOrder',Number(e.target.value))}/></label>
       <label className="menu-admin-check"><input type="checkbox" checked={selection.value.published} onChange={e=>selection.type==='category'?patchCategory('published',e.target.checked):patchItem('published',e.target.checked)}/><span>對訪客公開（取消勾選可先儲存草稿）</span></label>
       {selection.type==='item'&&<label className="menu-admin-check"><input type="checkbox" checked={selection.value.available} onChange={e=>patchItem('available',e.target.checked)}/><span>目前可供應（取消勾選將顯示暫停供應）</span></label>}
      </fieldset>
      <div className="menu-admin-actions">
       {!selection.creating && <button type="button" className="menu-admin-danger" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/>刪除</button>}
       <span className="menu-admin-save-hint">{dirty?'尚未儲存':'資料已同步'}</span>
       <button type="submit" className="menu-admin-save" disabled={busy||!dirty}><Save size={17}/>{busy?'儲存中…':'儲存菜單'}</button>
      </div>
     </form>}
   </div>
  </div>}
 </section>
}
