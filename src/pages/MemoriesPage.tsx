import {useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import {Camera,Download,Feather,KeyRound,MessageCircle,Send,ShieldCheck} from 'lucide-react'
import {fetchPublicFeedback,formatExpiry,lookupKeepsake,submitFeedback} from '../lib/guest-memories'
import type {Feedback,Pickup} from '../lib/guest-memories'
import './memories.css'

export default function MemoriesPage(){
 const [tab,setTab]=useState<'keepsake'|'feedback'>('keepsake')
 const [code,setCode]=useState(()=>{
  const match=window.location.hash.match(/^#code=(.+)$/)
  if(!match)return ''
  try{return decodeURIComponent(match[1])}catch{return ''}
 })
 const [pickup,setPickup]=useState<Pickup|null>(null)
 const [lookupBusy,setLookupBusy]=useState(false)
 const [lookupError,setLookupError]=useState('')
 const [entries,setEntries]=useState<Feedback[]>([])
 const [feedbackError,setFeedbackError]=useState('')
 const [name,setName]=useState('')
 const [anonymous,setAnonymous]=useState(true)
 const [message,setMessage]=useState('')
 const [sent,setSent]=useState(false)
 const [submitting,setSubmitting]=useState(false)
 const [website,setWebsite]=useState('')

 useEffect(()=>{
  const match=window.location.hash.match(/^#code=(.+)$/)
  if(!match)return
  let token=''
  try{token=decodeURIComponent(match[1])}catch{return}
  let live=true
  setLookupBusy(true)
  lookupKeepsake(token).then(result=>{if(live)setPickup(result)})
   .catch(e=>{if(live)setLookupError(e instanceof Error?e.message:'查詢失敗')})
   .finally(()=>{if(live)setLookupBusy(false)})
  return()=>{live=false}
 },[])
 useEffect(()=>{
  let live=true
  fetchPublicFeedback().then(data=>{if(live)setEntries(data)})
   .catch(()=>{if(live)setFeedbackError('目前無法載入留言，請稍後再試')})
  return()=>{live=false}
 },[])

 async function fetchPhotos(event:FormEvent){
  event.preventDefault()
  setLookupBusy(true);setLookupError('');setPickup(null)
  try{setPickup(await lookupKeepsake(code.trim()))}
  catch(error){setLookupError(error instanceof Error?error.message:'領取失敗')}
  finally{setLookupBusy(false)}
 }
 async function post(event:FormEvent){
  event.preventDefault()
  if(submitting)return
  if(website){setSent(true);return}
  setSubmitting(true);setFeedbackError('')
  try{
   await submitFeedback(name,anonymous,message)
   setMessage('');setSent(true)
  }catch(error){setFeedbackError(error instanceof Error?error.message:'目前無法送出留言')}
  finally{setSubmitting(false)}
 }
 return <section className="memories-page">
  <header className="memories-hero">
   <p className="eyebrow">KOGAKURE · TRAVELER'S KEEPSAKES</p>
   <div className="memories-glyph" aria-hidden="true">狐 · 繪 · 卷</div>
   <h1>旅人繪卷</h1>
   <p>有些相逢，值得留下一紙印記；有些心聲，願在狐火盡處悄悄迴響。</p>
   <span className="memories-ornament" aria-hidden="true">◆　—　◆</span>
  </header>
  <div className="memories-tabs" role="tablist" aria-label="旅人繪卷功能">
   <button type="button" role="tab" aria-selected={tab==='keepsake'}
    className={tab==='keepsake'?'active':''} onClick={()=>setTab('keepsake')}>
    <Camera size={18}/>狐影留帖 <small>拍立得交付</small>
   </button>
   <button type="button" role="tab" aria-selected={tab==='feedback'}
    className={tab==='feedback'?'active':''} onClick={()=>setTab('feedback')}>
    <Feather size={18}/>狐語迴音 <small>旅人留言</small>
   </button>
  </div>

  {tab==='keepsake'?<section className="memories-panel" role="tabpanel">
   <div className="memories-section-title"><p className="eyebrow">THE KEEPSAKE ARCHIVE</p><h2>狐影留帖</h2>
    <p>將今夜的月色收進相片。請輸入館方交付的專屬領取碼，取回屬於你的留影。</p></div>
   <form className="memories-claim-form" onSubmit={e=>void fetchPhotos(e)}>
    <label htmlFor="keepsake-claim-code"><KeyRound size={18}/>專屬領取碼</label>
    <input id="keepsake-claim-code" type="text" autoComplete="off"
     value={code} onChange={e=>setCode(e.target.value)} maxLength={40}
     placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" required/>
    <button type="submit" disabled={lookupBusy}>{lookupBusy?'尋找狐影中…':'領取我的留影'}</button>
   </form>
   {lookupError&&<p className="memories-alert" role="alert">{lookupError}</p>}
   {pickup&&<div className="memories-pickup-result">
    <h3>{pickup.guestLabel} · 留影已備妥</h3>
    <p>保存期限至 {formatExpiry(pickup.expiresAt)}（台灣時間）</p>
    {pickup.note&&<p className="memories-pickup-note">{pickup.note}</p>}
    {!pickup.photos.length?<p>館方尚未完成照片上傳，請稍後再領取。</p>:
     <div className="memories-pickup-grid">{pickup.photos.map(photo=>
      <a key={photo.id} href={photo.url} className="memories-download" target="_blank" rel="noopener noreferrer">
       <Download size={19}/><span>{photo.name}</span><strong>下載照片</strong>
      </a>)}</div>}
   </div>}
   <div className="memories-privacy-note"><ShieldCheck size={19}/>
    <p>留影僅憑專屬領取碼開啟，不對外展示。照片自交付單建立起保留七天；到期即停止領取，檔案由系統定時清除。請在期限內下載收藏。</p>
   </div>
  </section>:<section className="memories-panel" role="tabpanel">
   <div className="memories-section-title"><p className="eyebrow">WHISPERS OF THE FOXFIRE</p><h2>狐語迴音</h2>
    <p>旅途中的一聲問候、一句建議，都能化成回到狐隱的微光。</p></div>
   <form className="memories-feedback-form" onSubmit={e=>void post(e)}>
    <label className="memories-check"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/>
     <span>以匿名旅人身分留言</span></label>
    {!anonymous&&<label>旅人稱呼<input value={name} onChange={e=>setName(e.target.value)}
     maxLength={70} placeholder="請留下希望公開顯示的稱呼" required/></label>}
    <label>想留下的心聲<textarea value={message} onChange={e=>{setMessage(e.target.value);setSent(false)}}
     maxLength={1000} minLength={2} rows={5} required placeholder="寫下今晚的故事，或對狐隱的建議…"/></label>
    <input className="memories-honey" aria-hidden="true" tabIndex={-1} autoComplete="off"
     value={website} onChange={e=>setWebsite(e.target.value)} name="website"/>
    <div className="memories-form-foot"><small>{message.length} / 1000 字 · 留言經館方審核後才會公開</small>
     <button type="submit" disabled={submitting}><Send size={17}/>{submitting?'送出中…':'留下迴音'}</button></div>
   </form>
   {sent&&<p className="memories-success" role="status">心聲已送達狐隱，待館方確認後便會出現在留言板。</p>}
   {feedbackError&&<p className="memories-alert" role="alert">{feedbackError}</p>}
   <div className="memories-guestbook">
    <h3><MessageCircle size={19}/>旅人留下的迴音</h3>
    {!entries.length?<p className="memories-empty">狐火尚靜，等待第一位旅人的心聲。</p>:
     <div className="memories-entries">{entries.map(entry=><article key={entry.id} className="memories-entry">
      <div><strong>{entry.is_anonymous?'匿名旅人':entry.guest_name}</strong>
       <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'})}</time></div>
      <p>{entry.message}</p>
      {entry.reply&&<blockquote><strong>狐隱回札</strong><p>{entry.reply}</p></blockquote>}
     </article>)}</div>}
   </div>
  </section>}
 </section>
}
