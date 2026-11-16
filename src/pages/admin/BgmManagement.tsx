import {useCallback,useEffect,useMemo,useState} from 'react'
import type {ChangeEvent,FormEvent} from 'react'
import {CheckCircle2,Headphones,Music2,RefreshCw,Save,Trash2,UploadCloud,Volume2} from 'lucide-react'
import {useAdminEditGuard} from './AdminEditGuard'
import {
 BGM_MAX_BYTES,DEFAULT_BGM,checkBgm,currentAudioUrl,deleteUploadedBgm,
 listUploadedBgm,readAdminBgm,saveBgm,uploadBgm,youtubeVideoId,
} from '../../lib/site-bgm'
import type {BgmSettings,BgmSource,UploadedBgm} from '../../lib/site-bgm'
import './bgm-management.css'

const sourceNames:Record<BgmSource,string>={
 default:'原本背景音樂',upload:'上傳音樂檔',direct:'直接音訊網址',youtube:'YouTube 影片網址',
}
const fileLabel=(file:UploadedBgm)=>file.name+' · '+(file.size/1048576).toFixed(1)+' MB'
const formValue=(config:BgmSettings)=>JSON.stringify({
 enabled:config.enabled,source:config.source,url:config.url,
 title:config.title,volume:config.volume,loop:config.loop,
})

export default function BgmManagement(){
 const [draft,setDraft]=useState<BgmSettings>({...DEFAULT_BGM})
 const [original,setOriginal]=useState<BgmSettings>({...DEFAULT_BGM})
 const [files,setFiles]=useState<UploadedBgm[]>([])
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 const [preview,setPreview]=useState(false)
 const {setEditing}=useAdminEditGuard()
 const dirty=useMemo(()=>formValue(draft)!==formValue(original),[draft,original])
 useEffect(()=>setEditing(dirty,busy),[dirty,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])
 const refresh=useCallback(async()=>{
  const [settings,uploads]=await Promise.all([readAdminBgm(),listUploadedBgm()])
  setDraft(settings);setOriginal(settings);setFiles(uploads)
 },[])
 useEffect(()=>{
  let live=true
  void Promise.all([readAdminBgm(),listUploadedBgm()]).then(([settings,uploads])=>{
   if(!live)return
   setDraft(settings);setOriginal(settings);setFiles(uploads)
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:'BGM 讀取失敗')})
   .finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[])
 function patch<K extends keyof BgmSettings>(key:K,value:BgmSettings[K]){
  setDraft(old=>({...old,[key]:value}))
  if(key==='source'||key==='url')setPreview(false)
 }
 function selectSource(next:BgmSource){
  const saved=next===original.source?original.url:''
  const first=files[0]?.url||''
  setDraft(old=>({...old,source:next,url:next==='default'?'':next==='upload'?first:saved,
   title:next==='default'?'みやびごころ':old.title}))
  setPreview(false)
 }
 async function save(event:FormEvent){
  event.preventDefault()
  if(busy||loading)return
  const invalid=checkBgm(draft)
  if(invalid){setError(invalid);return}
  setBusy(true);setError('');setNotice('')
  try{
   const result=await saveBgm(draft)
   setDraft(result);setOriginal(result)
   setNotice('背景音樂設定已發布，前台播放器會同步更新。')
  }catch(e){setError(e instanceof Error?e.message:'背景音樂無法儲存')}
  finally{setBusy(false)}
 }
 async function upload(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0]
  event.target.value=''
  if(!file||busy)return
  if(file.size>BGM_MAX_BYTES){setError('檔案最大 20 MB');return}
  setBusy(true);setError('');setNotice('')
  try{
   const uploaded=await uploadBgm(file)
   setFiles(old=>[uploaded,...old])
   setDraft(old=>({...old,source:'upload',url:uploaded.url,title:file.name.replace(/\.[^.]+$/,'').slice(0,120)||old.title}))
   setNotice('音樂已上傳。請確認設定後按「儲存並發布」，才會改變前台正在播放的曲目。')
  }catch(e){setError(e instanceof Error?e.message:'音樂上傳失敗')}
  finally{setBusy(false)}
 }
 async function remove(file:UploadedBgm){
  if(busy||original.url===file.url)return
  if(!window.confirm('確定刪除已上傳音樂「'+file.name+'」？'))return
  setBusy(true);setError('');setNotice('')
  try{
   await deleteUploadedBgm(file.path)
   setFiles(old=>old.filter(f=>f.path!==file.path))
   setDraft(old=>old.url===file.url?{...old,url:'',source:'upload'}:old)
   setNotice('檔案已刪除。')
  }catch(e){setError(e instanceof Error?e.message:'無法刪除音樂')}
  finally{setBusy(false)}
 }
 const youtubeId=draft.source==='youtube'?youtubeVideoId(draft.url):null
 const audioPreview=draft.source==='youtube'?'':currentAudioUrl(draft)
 const invalid=checkBgm(draft)
 return <section className="bgm-admin">
  <header className="bgm-admin-heading">
   <p className="eyebrow">KOGAKURE · MUSIC MANAGEMENT</p>
   <h1>背景音樂管理</h1>
   <p>統一管理前台現有的音符播放器。不更換右上角開關，也不新增進站播放步驟。</p>
  </header>
  {error&&<p className="bgm-admin-message is-error" role="alert">{error}</p>}
  {notice&&<p className="bgm-admin-message" role="status"><CheckCircle2 size={16}/>{notice}</p>}
  {loading?<p className="bgm-admin-message" role="status">正在讀取館內音樂設定…</p>:
   <form className="bgm-admin-form" onSubmit={event=>void save(event)}>
    <div className="bgm-admin-main">
     <div className="bgm-admin-section">
      <div className="bgm-admin-section-title"><Headphones size={19}/><h2>館內背景音樂</h2></div>
      <label className="bgm-admin-check"><input type="checkbox" checked={draft.enabled} disabled={busy}
       onChange={e=>patch('enabled',e.target.checked)}/><span>開放前台 BGM 播放</span></label>
      <label>播放來源
       <select disabled={busy} value={draft.source} onChange={e=>selectSource(e.target.value as BgmSource)}>
        {Object.entries(sourceNames).map(([id,name])=><option value={id} key={id}>{name}</option>)}
       </select>
      </label>
      {draft.source==='upload'&&<div className="bgm-admin-upload">
       <label className="bgm-admin-upload-button"><UploadCloud size={17}/>上傳音樂檔
        <input type="file" accept=".mp3,.ogg,.wav,.m4a,.aac,.webm,.flac,audio/*" disabled={busy} onChange={e=>void upload(e)}/>
       </label>
       <small>支援 MP3、OGG、WAV、M4A、AAC、WebM、FLAC，單檔最多 20 MB。請確認有公開播放權利。</small>
       <label>選擇已上傳的音樂
        <select value={draft.url} disabled={busy||!files.length} onChange={e=>patch('url',e.target.value)}>
         <option value="">{files.length?'請選擇音樂檔':'尚未上傳音樂'}</option>
         {files.map(file=><option key={file.path} value={file.url}>{fileLabel(file)}</option>)}
        </select>
       </label>
      </div>}
      {draft.source==='direct'&&<label>直接音訊檔網址
       <input type="url" maxLength={2048} placeholder="https://example.com/music.mp3"
        value={draft.url} disabled={busy} onChange={e=>patch('url',e.target.value)}/>
       <small>需為可公開存取的 HTTPS 音訊檔連結；普通網頁或影音網站網址不能直接當音訊檔播放。</small>
      </label>}
      {draft.source==='youtube'&&<label>YouTube 影片網址
       <input type="url" maxLength={2048} placeholder="https://www.youtube.com/watch?v=..."
        value={draft.url} disabled={busy} onChange={e=>patch('url',e.target.value)}/>
       <small>YouTube 以官方可見影片播放器開啟；點擊前台原有音符按鈕即可顯示影片，不會在背景隱藏播放。</small>
      </label>}
      <label>音樂名稱
       <input type="text" maxLength={120} value={draft.title} disabled={busy}
        onChange={e=>patch('title',e.target.value)}/>
      </label>
      <div className="bgm-admin-volume">
       <label><Volume2 size={17}/>音量 <strong>{Math.round(draft.volume*100)}%</strong></label>
       <input type="range" min={0} max={100} step={1} value={Math.round(draft.volume*100)}
        disabled={busy||draft.source==='youtube'}
        onChange={e=>patch('volume',Number(e.target.value)/100)}/>
       {draft.source==='youtube'&&<small>YouTube 音量請於官方嵌入播放器調整。</small>}
      </div>
      <label className="bgm-admin-check"><input type="checkbox" checked={draft.loop} disabled={busy}
       onChange={e=>patch('loop',e.target.checked)}/><span>循環播放目前曲目</span></label>
     </div>
     <div className="bgm-admin-section">
      <div className="bgm-admin-section-title"><Music2 size={19}/><h2>預覽目前選擇</h2></div>
      {draft.source==='youtube'?
       youtubeId?<><button type="button" className="bgm-admin-preview-button"
        onClick={()=>setPreview(p=>!p)}>{preview?'關閉 YouTube 預覽':'開啟 YouTube 預覽'}</button>
        {preview&&<iframe className="bgm-admin-youtube" title="YouTube 音樂預覽"
         src={'https://www.youtube-nocookie.com/embed/'+youtubeId+'?playsinline=1'}
         allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
         referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>}</>:
        <p>填入有效 YouTube 影片網址後可預覽。</p>:
       audioPreview?<audio key={audioPreview} controls preload="none" src={audioPreview}/>:
        <p>請先選擇音樂檔案。</p>}
      <p>此處只是預覽，按下「儲存並發布」後才會更新前台音樂。更改曲目不會強制替正在瀏覽的旅人自動播放。</p>
     </div>
    </div>
    {files.length>0&&<section className="bgm-admin-library">
     <h2>已上傳音樂檔案 <small>共 {files.length} 首</small></h2>
     <div>{files.map(file=><div className="bgm-admin-file" key={file.path}>
      <span>{fileLabel(file)}</span>
      <button type="button" disabled={busy||original.url===file.url}
       title={original.url===file.url?'此曲目前正在前台使用，請先切換':'刪除上傳的音樂'}
       onClick={()=>void remove(file)}><Trash2 size={16}/>刪除</button>
     </div>)}</div>
    </section>}
    <footer className="bgm-admin-actions">
     <button type="button" disabled={busy||!dirty} onClick={()=>{
      if(window.confirm('放棄尚未發布的 BGM 修改？')){setDraft(original);setPreview(false);setError('')}
     }}>取消修改</button>
     <button type="button" disabled={busy} onClick={()=>{
      if(dirty&&!window.confirm('重新整理將放棄未儲存的設定，確定？'))return
      setBusy(true);setError('');void refresh().catch(e=>setError(e instanceof Error?e.message:'讀取失敗')).finally(()=>setBusy(false))
     }}><RefreshCw size={16}/>重新整理</button>
     <button type="submit" disabled={busy||!dirty||!!invalid} className="is-primary">
      <Save size={16}/>{busy?'儲存中…':'儲存並發布'}
     </button>
    </footer>
   </form>}
 </section>
}
