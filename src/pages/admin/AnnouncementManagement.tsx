import {useCallback,useEffect,useMemo,useState} from 'react'
import type {FormEvent} from 'react'
import {Link} from 'react-router-dom'
import {ArrowUpRight,CheckCircle2,FileText,Pin,Plus,RefreshCw,Save,Trash2} from 'lucide-react'
import {deleteAnnouncement,fetchAdminAnnouncements,saveAnnouncement,validateAnnouncement} from '../../lib/announcements'
import type {Announcement,AnnouncementCategory} from '../../lib/announcements'
import {useAdminEditGuard} from './AdminEditGuard'
import './announcement-management.css'

const kinds:Record<AnnouncementCategory,string>={notice:'館內公告',news:'最新消息'}
const empty=():Announcement=>({
 id:'',category:'notice',title:'',content:'',pinned:false,published:false,
 publishedAt:null,createdAt:'',updatedAt:'',
})
const printed=(value:string|null)=>value
 ?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未發布'

/** All mutations go through RLS: only the official site owner can edit the
 * announcements. Drafts never appear on the public homepage. */
export default function AnnouncementManagement(){
 const [rows,setRows]=useState<Announcement[]>([])
 const [draft,setDraft]=useState<Announcement|null>(null)
 const [original,setOriginal]=useState<Announcement|null>(null)
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const {setEditing}=useAdminEditGuard()
 const dirty=useMemo(()=>Boolean(draft&&JSON.stringify(draft)!==JSON.stringify(original)),[draft,original])
 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])
 const load=useCallback(async()=>{
  try{
   const updated=await fetchAdminAnnouncements()
   setRows(updated);setError('')
  }catch(e){setError(e instanceof Error?e.message:'公告列表讀取失敗')}
  finally{setLoading(false)}
 },[])
 useEffect(()=>{void load()},[load])
 function canSwitch(){
  return !busy&&(!dirty||window.confirm('目前有尚未儲存的公告修改。確定放棄嗎？'))
 }
 function choose(row:Announcement){
  if(!canSwitch())return
  setDraft({...row});setOriginal({...row});setNotice('')
 }
 function createNew(){
  if(!canSwitch())return
  const row=empty()
  setDraft(row);setOriginal({...row});setNotice('');setError('')
 }
 function patch<K extends keyof Announcement>(key:K,value:Announcement[K]){
  setDraft(current=>current?{...current,[key]:value}:current)
 }
 async function save(event:FormEvent){
  event.preventDefault()
  if(!draft||busy)return
  const invalid=validateAnnouncement(draft)
  if(invalid){setError(invalid);return}
  setBusy(true);setError('');setNotice('')
  try{
   const result=await saveAnnouncement(draft,draft.id||undefined)
   setDraft(result);setOriginal({...result})
   await load()
   setNotice(result.published?'公告已發布，首頁將自動同步更新。':'草稿已儲存，首頁不會公開顯示。')
  }catch(e){setError(e instanceof Error?e.message:'公告儲存失敗')}
  finally{setBusy(false)}
 }
 async function remove(){
  if(!draft?.id||busy)return
  if(!window.confirm('確定刪除「'+draft.title+'」？此公告將從首頁移除，且無法復原。'))return
  setBusy(true);setError('');setNotice('')
  try{
   await deleteAnnouncement(draft.id)
   setDraft(null);setOriginal(null)
   await load()
   setNotice('公告已刪除，公開首頁將在下次更新時同步移除。')
  }catch(e){setError(e instanceof Error?e.message:'刪除公告失敗')}
  finally{setBusy(false)}
 }
 return <section className="announcement-admin">
  <header className="announcement-admin-heading">
   <div><p className="eyebrow">KOGAKURE · NOTICE MANAGEMENT</p>
    <h1>館內公告・最新消息</h1>
    <p>建立館內資訊、最新消息與置頂公告；發布後直接同步首頁，無須重新部署網站。</p>
   </div>
   <div className="announcement-admin-top-actions">
    <Link to="/" target="_blank" rel="noopener noreferrer">查看首頁 <ArrowUpRight size={16}/></Link>
    <button type="button" disabled={busy||loading} onClick={()=>{setLoading(true);void load()}}><RefreshCw size={16}/>重新整理</button>
    <button type="button" disabled={busy} className="is-add" onClick={createNew}><Plus size={16}/>新增公告</button>
   </div>
  </header>
  {error&&<p role="alert" className="announcement-admin-alert is-error">{error}</p>}
  {notice&&<p role="status" className="announcement-admin-alert"><CheckCircle2 size={16}/>{notice}</p>}
  <div className="announcement-admin-workspace">
   <section className="announcement-admin-roster" aria-label="館內公告清單">
    <header><h2>公告列表</h2><small>共 {rows.length} 筆</small></header>
    {loading?<p className="announcement-admin-empty">正在讀取館內消息…</p>:
     rows.length===0?<p className="announcement-admin-empty">目前沒有公告。點擊「新增公告」開始編輯。</p>:
     <div className="announcement-admin-list">
      {rows.map(item=><button type="button" key={item.id} disabled={busy}
       className={'announcement-admin-item'+(draft?.id===item.id?' is-selected':'')}
       onClick={()=>choose(item)}>
       <span>{kinds[item.category]} · {item.published?'已發布':'草稿'} {item.pinned&&<Pin size={12} aria-label="置頂"/>}</span>
       <strong>{item.title}</strong>
       <small>{printed(item.publishedAt||item.updatedAt)}</small>
      </button>)}
     </div>}
   </section>
   <section className="announcement-admin-editor" aria-label="公告編輯">
    {!draft?<div className="announcement-admin-empty-editor">
     <FileText size={28}/><h2>館內手帖</h2>
     <p>選取公告進行編輯，或建立新的館內消息。</p>
     <button type="button" onClick={createNew}><Plus size={16}/>新增公告</button>
    </div>:<form onSubmit={event=>void save(event)}>
     <div className="announcement-admin-editor-heading">
      <div><p className="eyebrow">{draft.id?'EDIT ANNOUNCEMENT':'NEW ANNOUNCEMENT'}</p>
       <h2>{draft.id?'編輯公告':'新增公告'}</h2></div>
      {draft.id&&<small>發布時間：{printed(draft.publishedAt)}</small>}
     </div>
     <label>公告類別
      <select value={draft.category} disabled={busy}
       onChange={event=>patch('category',event.target.value as AnnouncementCategory)}>
       <option value="notice">館內公告</option>
       <option value="news">最新消息</option>
      </select>
     </label>
     <label>公告標題
      <input type="text" required maxLength={100} disabled={busy}
       value={draft.title} onChange={event=>patch('title',event.target.value)}
       placeholder="例如：狐隱營業日調整公告"/>
     </label>
     <label>公告內容
      <textarea required rows={8} maxLength={3000} disabled={busy}
       value={draft.content} onChange={event=>patch('content',event.target.value)}
       placeholder="請輸入旅人可閱讀的完整公告，支援換行。"/>
      <small>{draft.content.length} / 3000 字</small>
     </label>
     <div className="announcement-admin-switches">
      <label><input type="checkbox" checked={draft.pinned} disabled={busy}
       onChange={event=>patch('pinned',event.target.checked)}/>
       <span>置頂此公告</span></label>
      <label><input type="checkbox" checked={draft.published} disabled={busy}
       onChange={event=>patch('published',event.target.checked)}/>
       <span>對外發布（取消勾選即下架）</span></label>
     </div>
     <p className="announcement-admin-hint">新公告預設為草稿。發布後將出現在首頁相應分類；置頂內容優先顯示，旅人只能閱讀已發布公告。</p>
     <footer className="announcement-admin-editor-actions">
      {draft.id&&<button type="button" disabled={busy} className="is-danger" onClick={()=>void remove()}><Trash2 size={16}/>刪除公告</button>}
      <button type="submit" disabled={busy||!dirty||!!validateAnnouncement(draft)} className="is-save"><Save size={16}/>{busy?'處理中…':draft.published?'儲存並發布':'儲存草稿'}</button>
     </footer>
    </form>}
   </section>
  </div>
 </section>
}
