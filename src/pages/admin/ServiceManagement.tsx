import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {AlertCircle,ArrowDown,ArrowUp,CheckCircle2,ExternalLink,ImagePlus,Plus,RefreshCw,Save,Search,Trash2,X} from 'lucide-react'
import {
 deleteServiceContent,fetchServiceContents,removeUnusedServicePhoto,
 saveServiceContent,uploadServicePhoto,validateServicePhoto,
} from '../../lib/service-content'
import type {ServiceEntry} from '../../lib/service-content'
import {useAdminEditGuard} from './AdminEditGuard'
import './service-management.css'

type Notice={kind:'success'|'error';message:string}
type PhotoSlot={id:string;url:string;file?:File}
const maxServicePhotos=12
const blank=(sortOrder:number):ServiceEntry=>({
 id:crypto.randomUUID(),slug:'service-'+crypto.randomUUID(),category:'',
 english:'',title:'',quote:'',paragraphs:[],details:[],photoLabel:'服務形象照片',
 imageUrl:null,imageUrls:[],sortOrder,published:false,updatedAt:'',
})
const paragraphsOf=(value:string)=>value.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean)
const detailsOf=(value:string)=>value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)

export default function ServiceManagement(){
 const [rows,setRows]=useState<ServiceEntry[]>([])
 const [loading,setLoading]=useState(true)
 const [loadError,setLoadError]=useState('')
 const [busy,setBusy]=useState(false)
 const busyRef=useRef(false)
 const [notice,setNotice]=useState<Notice|null>(null)
 const [query,setQuery]=useState('')
 const [draft,setDraft]=useState<ServiceEntry|null>(null)
 const [original,setOriginal]=useState<ServiceEntry|null>(null)
 const [creating,setCreating]=useState(false)
 const [paragraphText,setParagraphText]=useState('')
 const [detailsText,setDetailsText]=useState('')
 const [photoSlots,setPhotoSlots]=useState<PhotoSlot[]>([])
 const stagedUrls=useRef<string[]>([])
 const editor=useRef<HTMLDivElement>(null)
 const {setEditing}=useAdminEditGuard()

 useEffect(()=>()=>{stagedUrls.current.forEach(url=>URL.revokeObjectURL(url))},[])
 function resetPhotos(record:ServiceEntry|null){
  stagedUrls.current.forEach(url=>URL.revokeObjectURL(url))
  stagedUrls.current=[]
  const urls=record?(record.imageUrls.length?record.imageUrls:(record.imageUrl?[record.imageUrl]:[])):[]
  setPhotoSlots(urls.map(url=>({id:crypto.randomUUID(),url})))
 }
 const dirty=Boolean(draft&&(creating||
  JSON.stringify(draft)!==JSON.stringify(original)||
  paragraphText!==original?.paragraphs.join('\n\n')||
  detailsText!==original?.details.join('\n')||
  JSON.stringify(photoSlots.map(photo=>photo.file?photo.id:photo.url))!==JSON.stringify(original?.imageUrls||[])))
 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 const refresh=useCallback(async()=>{
  const updated=await fetchServiceContents(true)
  setRows(updated)
  setLoadError('')
  return updated
 },[])
 useEffect(()=>{
  let active=true
  fetchServiceContents(true).then(data=>{if(active)setRows(data)})
   .catch(e=>{if(active)setLoadError(e instanceof Error?e.message:'無法載入服務資料')})
   .finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[])
 const filtered=useMemo(()=>{
  const term=query.trim().toLocaleLowerCase()
  return rows.filter(row=>!term||[row.title,row.category,row.english,row.quote].join(' ').toLocaleLowerCase().includes(term))
 },[rows,query])

 function mayDiscard(){
  if(busyRef.current)return false
  return !dirty||window.confirm('服務介紹尚有未儲存的修改，確定要放棄？')
 }
 function focusEditor(){
  if(window.matchMedia('(max-width:850px)').matches)
   window.requestAnimationFrame(()=>editor.current?.scrollIntoView({behavior:'smooth',block:'start'}))
 }
 function select(row:ServiceEntry){
  if(!mayDiscard())return
  const snapshot={...row,paragraphs:[...row.paragraphs],details:[...row.details]}
  setDraft(snapshot);setOriginal(snapshot);setCreating(false)
  setParagraphText(row.paragraphs.join('\n\n'))
  setDetailsText(row.details.join('\n'))
  resetPhotos(row);setNotice(null)
  focusEditor()
 }
 function createNew(){
  if(!mayDiscard())return
  const row=blank(Math.max(0,...rows.map(x=>x.sortOrder))+10)
  setDraft(row);setOriginal(row);setCreating(true)
  setParagraphText('');setDetailsText('')
  resetPhotos(null);setNotice(null)
  focusEditor()
 }
 function patch<K extends keyof ServiceEntry>(key:K,value:ServiceEntry[K]){
  setDraft(prev=>prev?{...prev,[key]:value}:prev)
 }
 function choosePhotos(files:FileList|null){
  const incoming=files?Array.from(files):[]
  if(!incoming.length)return
  if(photoSlots.length+incoming.length>maxServicePhotos){
   setNotice({kind:'error',message:'每項服務最多 '+maxServicePhotos+' 張照片，請先移除其他照片再上傳。'});return
  }
  for(const file of incoming){
   const problem=validateServicePhoto(file)
   if(problem){setNotice({kind:'error',message:file.name+'：'+problem});return}
  }
  const added=incoming.map(file=>{
   const url=URL.createObjectURL(file)
   stagedUrls.current.push(url)
   return {id:crypto.randomUUID(),url,file}
  })
  setPhotoSlots(prev=>[...prev,...added])
  setNotice(null)
 }
 function movePhoto(index:number,delta:number){
  setPhotoSlots(prev=>{
   const target=index+delta
   if(index<0||target<0||target>=prev.length)return prev
   const next=[...prev]
   ;[next[index],next[target]]=[next[target],next[index]]
   return next
  })
 }
 function removePhoto(id:string){
  const photo=photoSlots.find(item=>item.id===id)
  if(!photo)return
  if(photo.file){
   URL.revokeObjectURL(photo.url)
   stagedUrls.current=stagedUrls.current.filter(url=>url!==photo.url)
  }
  setPhotoSlots(prev=>prev.filter(item=>item.id!==id))
  setNotice(null)
 }
 async function save(){
  if(!draft||busyRef.current)return
  const paragraphs=paragraphsOf(paragraphText)
  const details=detailsOf(detailsText)
  if(!draft.category.trim()||!draft.title.trim()){
   setNotice({kind:'error',message:'服務分類與主標題都必須填寫'});return
  }
  if(draft.category.trim().length>60||draft.title.trim().length>100||draft.english.length>110
   ||draft.quote.length>300||draft.photoLabel.length>100){
   setNotice({kind:'error',message:'標題、分類或短句超過欄位長度上限'});return
  }
  if(paragraphs.length>8||details.length>12||paragraphs.some(x=>x.length>1500)||details.some(x=>x.length>80)){
   setNotice({kind:'error',message:'介紹最多 8 段（每段 1500 字），特色標籤最多 12 個（每個 80 字）'});return
  }
  if(!Number.isInteger(draft.sortOrder)||draft.sortOrder<0||draft.sortOrder>1000000){
   setNotice({kind:'error',message:'排序請填入 0～1,000,000 的整數'});return
  }
  if(photoSlots.some(photo=>!photo.file&&!/^https:\/\/\S+$/.test(photo.url))){
   setNotice({kind:'error',message:'照片網址必須使用 HTTPS'});return
  }
  busyRef.current=true;setBusy(true);setNotice(null)
  const uploadedPaths:string[]=[]
  let savedToDatabase=false
  try{
   const imageUrls:string[]=[]
   // Upload new files in the exact order chosen by the manager.
   for(const photo of photoSlots){
    if(photo.file){
     const upload=await uploadServicePhoto(photo.file,draft.id)
     uploadedPaths.push(upload.path)
     imageUrls.push(upload.url)
    }else imageUrls.push(photo.url)
   }
   const record={...draft,paragraphs,details,imageUrls,imageUrl:imageUrls[0]||null}
   await saveServiceContent(record,creating)
   savedToDatabase=true
   const updated=await refresh()
   const saved=updated.find(x=>x.id===draft.id)
   if(saved){
    setDraft({...saved});setOriginal({...saved});setCreating(false)
    setParagraphText(saved.paragraphs.join('\n\n'));setDetailsText(saved.details.join('\n'))
    resetPhotos(saved)
   }else{setDraft(null);setOriginal(null);resetPhotos(null)}
   setNotice({kind:'success',message:'服務內容已儲存。公開項目重新載入前台即可查看；草稿不會顯示給旅人。'})
  }catch(e){
   if(savedToDatabase){
    // Never retry an already-created UUID or remove its uploaded photo.
    // A failed list refresh does not undo the successful database write.
    setDraft(null);setOriginal(null);setCreating(false);resetPhotos(null)
    setNotice({kind:'error',message:'服務已儲存，但清單重新讀取失敗。請按「更新清單」確認後再編輯。'})
   }else{
    for(const path of uploadedPaths){
     try{await removeUnusedServicePhoto(path)}catch{ /* Keep the original error visible. */ }
    }
    setNotice({kind:'error',message:'儲存失敗：'+(e instanceof Error?e.message:'請檢查資料庫連線')})
   }
  }finally{busyRef.current=false;setBusy(false)}
 }
 async function remove(){
  if(!draft||creating||busyRef.current)return
  if(!window.confirm('確定要永久刪除服務「'+draft.category+' · '+draft.title+'」？\n訪客頁面將不再顯示，內容無法復原。'))return
  busyRef.current=true;setBusy(true);setNotice(null)
  try{
   await deleteServiceContent(draft)
   await refresh()
   setDraft(null);setOriginal(null);resetPhotos(null)
   setNotice({kind:'success',message:'服務已刪除，其他服務與訂單資料均不受影響。'})
  }catch(e){setNotice({kind:'error',message:e instanceof Error?e.message:'刪除服務失敗'})}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function retry(){
  if(busyRef.current||!mayDiscard())return
  setLoading(true);setNotice(null)
  try{await refresh()}catch(e){setLoadError(e instanceof Error?e.message:'無法載入資料')}
  finally{setLoading(false)}
 }

 return <section className="service-admin admin-page">
  <header className="service-admin-head">
   <div><p className="eyebrow">KOGAKURE · RITUAL EDITOR</p>
    <h1>服務內容管理</h1>
    <p>新增隱世服務、調整介紹與圖片、排序及公開狀態。所有改動以儲存後的資料為準。</p></div>
   <div className="service-admin-top-actions">
    <Link to="/services" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>查看服務頁</Link>
    <button type="button" disabled={busy||loading} onClick={()=>void retry()}><RefreshCw size={16}/>更新清單</button>
   </div>
  </header>
  {loadError&&<p className="service-admin-message is-error" role="alert"><AlertCircle size={18}/>{loadError}</p>}
  {notice&&<p className={'service-admin-message is-'+notice.kind} role={notice.kind==='error'?'alert':'status'}>
   {notice.kind==='success'?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}<span>{notice.message}</span></p>}
  <div className="service-admin-layout">
   <aside className="service-admin-roster">
    <div className="service-admin-roster-head"><h2>服務列表 <small>{rows.length} 項</small></h2>
     <button type="button" disabled={busy||loading} onClick={createNew}><Plus size={16}/>新增服務</button>
    </div>
    <label className="service-admin-search"><Search size={16}/>
     <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋服務名稱或分類" aria-label="搜尋服務"/></label>
    {loading?<p className="service-admin-empty" role="status">正在讀取服務資料…</p>:
     !filtered.length?<p className="service-admin-empty">目前沒有符合條件的服務項目。</p>:
     <div className="service-admin-list">{filtered.map((item,index)=>
      <button type="button" key={item.id} onClick={()=>select(item)}
       className={'service-admin-list-item'+(draft?.id===item.id?' is-active':'')}
       disabled={busy}>
       <span className="service-admin-list-index">{String(index+1).padStart(2,'0')}</span>
       <span className="service-admin-list-text"><strong>{item.category}</strong><small>{item.title}</small></span>
       <span className={'service-admin-visibility'+(item.published?'':' is-draft')}>{item.published?'公開':'草稿'}</span>
      </button>
     )}</div>}
   </aside>
   <div className="service-admin-editor" ref={editor}>
    {!draft?<div className="service-admin-empty-editor"><ImagePlus size={33}/>
     <h2>編輯隱世之儀</h2><p>從左側選擇服務項目，或新增一篇獨立的服務介紹。</p>
    </div>:<form onSubmit={e=>{e.preventDefault();void save()}}>
     <div className="service-admin-editor-head">
      <div><p className="eyebrow">{creating?'NEW RITUAL':'EDIT RITUAL'}</p>
       <h2>{creating?'新增服務':'編輯服務內容'}</h2>
      </div>
      <button type="button" aria-label="關閉編輯" disabled={busy} onClick={()=>{if(mayDiscard()){setDraft(null);setOriginal(null);resetPhotos(null)}}}><X size={19}/></button>
     </div>
     <div className="service-admin-fields two">
      <label>服務分類 <span>必填</span><input required maxLength={60} value={draft.category} onChange={e=>patch('category',e.target.value)} placeholder="例：留影之儀" disabled={busy}/></label>
      <label>英文副標 <input maxLength={110} value={draft.english} onChange={e=>patch('english',e.target.value)} placeholder="THE FOXFIRE KEEPSAKE" disabled={busy}/></label>
     </div>
     <label>主標題 <span>必填</span><input required maxLength={100} value={draft.title} onChange={e=>patch('title',e.target.value)} placeholder="一瞬狐影，留住今宵" disabled={busy}/></label>
     <label>短句／引言 <input maxLength={300} value={draft.quote} onChange={e=>patch('quote',e.target.value)} placeholder="「若此夜終將散去……」" disabled={busy}/></label>
     <label>完整服務介紹 <small>以空白行分隔每一段；最多 8 段</small>
      <textarea rows={7} value={paragraphText} onChange={e=>setParagraphText(e.target.value)} placeholder="第一段介紹&#10;&#10;第二段介紹" disabled={busy}/></label>
     <label>特色標籤 <small>每行一個，最多 12 個</small>
      <textarea rows={4} value={detailsText} onChange={e=>setDetailsText(e.target.value)} placeholder={'狐姬合影\n拍立得風格\n旅途紀念'} disabled={busy}/></label>
     <div className="service-admin-photo-block">
      <h3>服務形象照片</h3>
      <div className="service-admin-photo-content">
       <div className="service-admin-preview">
        {previewUrl||draft.imageUrl?<img src={previewUrl||draft.imageUrl||''} alt={draft.photoLabel||draft.category+'照片預覽'}/>:<div><ImagePlus size={30}/><span>等待上傳</span></div>}
       </div>
       <div className="service-admin-photo-actions">
        <label>圖片預留文字 <input maxLength={100} value={draft.photoLabel} onChange={e=>patch('photoLabel',e.target.value)} disabled={busy}/></label>
        <label className="service-admin-upload"><ImagePlus size={17}/>{photoFile?'重新選擇照片':'選擇／替換照片'}
         <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={e=>{choosePhoto(e.target.files?.[0]);e.target.value=''}}/></label>
        <small>支援 JPG、PNG、WebP，最多 6 MB。儲存時才會上傳；未上傳時前台保留原本的神祕風格預留區。</small>
        {(photoFile||draft.imageUrl)&&<button type="button" disabled={busy} className="service-admin-remove-image"
         onClick={()=>{setPhotoFile(null);patch('imageUrl',null)}}>移除目前照片</button>}
       </div>
      </div>
     </div>
     <div className="service-admin-fields two">
      <label>顯示順序 <small>數字越小越前面</small>
       <input type="number" min={0} max={1000000} step={1} required
        value={draft.sortOrder} onChange={e=>patch('sortOrder',Number(e.target.value))} disabled={busy}/></label>
      <label className="service-admin-publish">
       <input type="checkbox" checked={draft.published} onChange={e=>patch('published',e.target.checked)} disabled={busy}/>
       <span>對訪客公開服務</span><small>取消勾選可保存草稿，或暫時隱藏服務。</small>
      </label>
     </div>
     <div className="service-admin-actions">
      {!creating&&<button type="button" className="is-delete" disabled={busy} onClick={()=>void remove()}><Trash2 size={17}/>永久刪除</button>}
      <span className="service-admin-dirty">{dirty?'尚未儲存':'已同步'}</span>
      <button className="is-save" type="submit" disabled={!dirty||busy}><Save size={17}/>{busy?'儲存中…':'儲存服務'}</button>
     </div>
    </form>}
   </div>
  </div>
 </section>
}
