import {useCallback,useEffect,useState} from 'react'
import {Camera,Check,ClipboardCopy,Eye,RefreshCw,Save,Trash2,UploadCloud} from 'lucide-react'
import {adminPreviewUrl,createKeepsake,deleteFeedback,deleteKeepsake,deleteKeepsakePhoto,
 fetchAdminFeedback,fetchAdminKeepsakes,formatExpiry,isExpired,keepsakeShareLink,moderateFeedback,uploadKeepsakePhoto} from '../../lib/guest-memories'
import type {Feedback,KeepsakeClaim,KeepsakePhoto} from '../../lib/guest-memories'
import '../memories.css'

export default function MemoriesManagement({section}:{section:'keepsakes'|'feedback'}){
 const [claims,setClaims]=useState<KeepsakeClaim[]>([])
 const [feedback,setFeedback]=useState<Feedback[]>([])
 const [replyDrafts,setReplyDrafts]=useState<Record<string,string>>({})
 const [guest,setGuest]=useState('')
 const [note,setNote]=useState('')
 const [files,setFiles]=useState<File[]>([])
 const [newCode,setNewCode]=useState('')
 const [newLink,setNewLink]=useState('')
 const [busy,setBusy]=useState(false)
 const [busyItem,setBusyItem]=useState('')
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [filter,setFilter]=useState<'all'|Feedback['status']>('all')
 const [preview,setPreview]=useState<{name:string;url:string}|null>(null)
 const refresh=useCallback(async()=>{
  if(section==='keepsakes')setClaims(await fetchAdminKeepsakes())
  else{
   const items=await fetchAdminFeedback()
   setFeedback(items)
   setReplyDrafts(old=>Object.fromEntries(items.map(item=>[item.id,old[item.id]??item.reply])))
  }
 },[section])
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'資料載入失敗'))},[refresh])
 const feedbackList=feedback.filter(item=>filter==='all'||item.status===filter)

 async function create(event:React.FormEvent){
  event.preventDefault()
  if(busy)return
  if(!files.length){setError('請先選擇至少一張拍立得照片');return}
  setBusy(true);setError('');setNotice('');setNewCode('');setNewLink('')
  try{
   const result=await createKeepsake(guest,note)
   setNewCode(result.code)
   setNewLink(keepsakeShareLink(result.code))
   let saved=0
   const failures:string[]=[]
   for(const file of files){
    try{await uploadKeepsakePhoto(result.claim.id,file);saved++}
    catch(e){failures.push(file.name+'：'+(e instanceof Error?e.message:'上傳失敗'))}
   }
   setNotice(saved+' 張照片已交付。領取碼僅顯示這一次，請立即複製並傳給旅人。')
   if(failures.length)setError('部分照片未能上傳：'+failures.join('；'))
   setGuest('');setNote('');setFiles([])
   const picker=document.getElementById('keepsake-upload-picker') as HTMLInputElement|null
   if(picker)picker.value=''
   await refresh()
  }catch(e){setError(e instanceof Error?e.message:'建立交付單失敗')}
  finally{setBusy(false)}
 }
 async function addPhotos(claim:KeepsakeClaim,selected:FileList|null){
  if(!selected?.length)return
  setBusyItem(claim.id);setError('');setNotice('')
  try{
   for(const file of Array.from(selected))await uploadKeepsakePhoto(claim.id,file)
   setNotice('已新增 '+selected.length+' 張照片，保留期限仍以原交付時間計算。')
   await refresh()
  }catch(e){setError(e instanceof Error?e.message:'新增照片失敗');await refresh().catch(()=>undefined)}
  finally{setBusyItem('')}
 }
 async function removeClaim(claim:KeepsakeClaim){
  if(!window.confirm('確定永久刪除「'+claim.guest_label+'」的整份交付照片嗎？'))return
  setBusyItem(claim.id);setError('')
  try{await deleteKeepsake(claim);await refresh();setNotice('交付單與照片已刪除')}
  catch(e){setError(e instanceof Error?e.message:'刪除失敗')}
  finally{setBusyItem('')}
 }
 async function removePhoto(photo:KeepsakePhoto){
  if(!window.confirm('確定刪除這張照片？'))return
  setBusyItem(photo.id);setError('')
  try{await deleteKeepsakePhoto(photo);await refresh();setNotice('照片已刪除')}
  catch(e){setError(e instanceof Error?e.message:'刪除失敗')}
  finally{setBusyItem('')}
 }
 async function showPreview(photo:KeepsakePhoto){
  setBusyItem(photo.id);setError('')
  try{setPreview({name:photo.original_name,url:await adminPreviewUrl(photo.storage_path)})}
  catch(e){setError(e instanceof Error?e.message:'無法預覽照片')}
  finally{setBusyItem('')}
 }
 async function updateFeedback(item:Feedback,status:Feedback['status']){
  setBusyItem(item.id);setError('');setNotice('')
  try{await moderateFeedback(item.id,status,replyDrafts[item.id]||'');await refresh();setNotice('留言狀態及回覆已儲存')}
  catch(e){setError(e instanceof Error?e.message:'儲存失敗')}
  finally{setBusyItem('')}
 }
 async function removeFeedback(item:Feedback){
  if(!window.confirm('確定永久刪除此則旅人留言？'))return
  setBusyItem(item.id);setError('')
  try{await deleteFeedback(item.id);await refresh();setNotice('留言已刪除')}
  catch(e){setError(e instanceof Error?e.message:'刪除失敗')}
  finally{setBusyItem('')}
 }
 async function copy(text:string){
  try{await navigator.clipboard.writeText(text);setNotice('已複製至剪貼簿')}
  catch{setError('複製失敗，請長按文字自行複製')}
 }
 return <section className="memories-admin admin-page">
  <header className="memories-admin-heading">
   <div><p className="eyebrow">KOGAKURE · TRAVELER'S ARCHIVE</p>
    <h1>{section==='keepsakes'?'狐影留帖 · 拍立得交付':'狐語迴音 · 留言管理'}</h1>
    <p>{section==='keepsakes'?'上傳照片並分享專屬領取碼；七天後自動停止領取並清除。':'審核旅人留言，決定是否公開，並回覆館方心聲。'}</p>
   </div>
   <button type="button" className="memories-admin-refresh" disabled={busy||!!busyItem}
    onClick={()=>void refresh().catch(e=>setError(e instanceof Error?e.message:'更新失敗'))}>
    <RefreshCw size={16}/>更新
   </button>
  </header>
  {error&&<p className="memories-alert" role="alert">{error}</p>}
  {notice&&<p className="memories-success" role="status">{notice}</p>}
  {section==='keepsakes'?<>
   <form className="memories-admin-card memories-admin-upload" onSubmit={e=>void create(e)}>
    <h2><UploadCloud size={20}/>新增拍立得交付單</h2>
    <div className="memories-admin-fields">
     <label>旅人稱呼<input value={guest} onChange={e=>setGuest(e.target.value)} maxLength={100} required placeholder="用於辨識交付單"/></label>
     <label>交付備註（可選填）<input value={note} onChange={e=>setNote(e.target.value)} maxLength={400} placeholder="例如：今夜拍攝的雙人留影"/></label>
    </div>
    <label>選擇交付照片（可多張）
     <input id="keepsake-upload-picker" type="file" accept="image/jpeg,image/png,image/webp" multiple
      onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
    </label>
    <small>每張最多 15 MB，支援 JPG／PNG／WebP。交付期限從建立單據起算七天。</small>
    <button type="submit" className="memories-admin-primary" disabled={busy}><Camera size={18}/>{busy?'正在建立並上傳…':'建立交付並產生領取碼'}</button>
   </form>
   {newCode&&<div className="memories-admin-card memories-new-code">
    <h2><Check size={19}/>領取碼已產生</h2>
    <p>請立即轉交旅人。為維護隱私，系統只保存領取碼的雜湊值，離開頁面後無法重新查詢原始碼。</p>
    <div className="memories-share-row"><code>{newCode}</code><button type="button" onClick={()=>void copy(newCode)}><ClipboardCopy size={17}/>複製碼</button></div>
    <div className="memories-share-row"><input readOnly value={newLink} aria-label="專屬領取網址"/><button type="button" onClick={()=>void copy(newLink)}><ClipboardCopy size={17}/>複製連結</button></div>
   </div>}
   <div className="memories-admin-list-head"><h2>交付紀錄</h2><span>{claims.length} 份</span></div>
   {!claims.length?<p className="memories-admin-empty">目前還沒有拍立得交付紀錄。</p>:
    <div className="memories-admin-list">{claims.map(claim=><article className="memories-admin-card" key={claim.id}>
     <div className="memories-admin-item-top"><div><h3>{claim.guest_label}</h3><small>上傳時間：{formatExpiry(claim.created_at)}</small></div>
      <span className={isExpired(claim.expires_at)?'memories-status is-expired':'memories-status'}>
       {isExpired(claim.expires_at)?'已過期':'領取中'}</span></div>
     {claim.note&&<p>{claim.note}</p>}
     <p className="memories-admin-expiry">保留期限：{formatExpiry(claim.expires_at)} · {claim.keepsake_photos.length} 張</p>
     <div className="memories-admin-photo-list">{claim.keepsake_photos.map(photo=><div key={photo.id}>
      <span>{photo.original_name}</span>
      <button type="button" aria-label={'預覽 '+photo.original_name} disabled={!!busyItem} onClick={()=>void showPreview(photo)}><Eye size={16}/></button>
      <button type="button" className="is-danger" aria-label={'刪除 '+photo.original_name} disabled={!!busyItem} onClick={()=>void removePhoto(photo)}><Trash2 size={16}/></button>
     </div>)}</div>
     <div className="memories-admin-actions">
      {!isExpired(claim.expires_at)&&<label className="memories-admin-add-files"><UploadCloud size={15}/>補傳照片
       <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busyItem}
        onChange={e=>{void addPhotos(claim,e.target.files);e.target.value=''}}/></label>}
      <button type="button" className="is-danger" disabled={!!busyItem} onClick={()=>void removeClaim(claim)}><Trash2 size={16}/>刪除整份交付</button>
     </div>
    </article>)}</div>}
   {preview&&<div className="memories-preview-backdrop" role="presentation" onClick={()=>setPreview(null)}>
    <div role="dialog" aria-modal="true" aria-label={'預覽 '+preview.name} onClick={e=>e.stopPropagation()}>
     <button type="button" onClick={()=>setPreview(null)}>關閉預覽</button>
     <img src={preview.url} alt={preview.name}/>
    </div>
   </div>}
  </>:<>
   <div className="memories-admin-filter"><label>留言狀態
    <select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
     <option value="all">全部留言</option><option value="pending">待審核</option>
     <option value="published">已公開</option><option value="hidden">已隱藏</option>
    </select>
   </label><span>目前 {feedbackList.length} 則</span></div>
   {!feedbackList.length?<p className="memories-admin-empty">此狀態目前沒有留言。</p>:
    <div className="memories-admin-list">{feedbackList.map(item=><article className="memories-admin-card" key={item.id}>
     <div className="memories-admin-item-top"><div><h3>{item.is_anonymous?'匿名旅人':item.guest_name}</h3>
      <small>{formatExpiry(item.created_at)} · {item.is_anonymous?'匿名':'署名'}</small></div>
      <span className="memories-status">{item.status==='pending'?'待審核':item.status==='published'?'已公開':'已隱藏'}</span>
     </div>
     <p className="memories-admin-message">{item.message}</p>
     <label>館方回覆<textarea rows={3} maxLength={1000} value={replyDrafts[item.id]??item.reply}
      onChange={e=>setReplyDrafts(old=>({...old,[item.id]:e.target.value}))} placeholder="可選填，公開後會隨留言顯示"/></label>
     <div className="memories-admin-actions">
      <button type="button" disabled={!!busyItem} onClick={()=>void updateFeedback(item,'published')}><Check size={16}/>公開／儲存回覆</button>
      <button type="button" disabled={!!busyItem} onClick={()=>void updateFeedback(item,'hidden')}><Save size={16}/>隱藏留言</button>
      <button type="button" className="is-danger" disabled={!!busyItem} onClick={()=>void removeFeedback(item)}><Trash2 size={16}/>刪除</button>
     </div>
    </article>)}</div>}
  </>}
 </section>
}
