import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, ExternalLink, GripVertical, ImagePlus, ListOrdered, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Staff, Effect } from '../../types'
import { EFFECTS } from '../../types'
import { deleteStaff, getStaff, saveStaff, saveStaffSortChanges } from '../../lib/staff'
import { planStaffReorder } from '../../lib/staff-order'
import { invalidatePublicStaffCache } from '../../lib/public-staff'
import { safeExternalUrl } from '../../lib/url'
import { removeUploadedStaffImages, uploadStaffCrop, uploadStaffImage, validateStaffImage } from '../../lib/upload'
import StaffPhotoCrop from '../../components/StaffPhotoCrop'
import ScrollCue from '../../components/ScrollCue'
import type { StaffCrop } from '../../lib/staff-crop'
import { useAdminEditGuard } from './AdminEditGuard'
import './staff-management.css'

type Filter = 'all' | 'published' | 'draft'
type Notice = { kind: 'success' | 'error' | 'info'; text: string }

function blankStaff(sortOrder = 1024): Staff {
 return {
  id: crypto.randomUUID(), name: '', role: '接待者', tagline: '', bio: '',
  imageUrl: '', thumbnailUrl: '', photos:[], photoDisplayMode:'single', themeColor: '#82c8bc',
  effect: 'foxfire', socials: [], services: [], published: false, bookingVisible: true,
  bookingAllowedPlanIds:null,bookingAllowJoint:true,bookingPlanCaps:{},sortOrder,
 }
}
function cloneStaff(staff: Staff): Staff {
 return { ...staff, services:[...staff.services], socials:staff.socials.map(s=>({...s})), photos:(staff.photos||[]).map(photo=>({...photo})) }
}
function parseServices(value: string): string[] {
 return [...new Set(value.split(/[，,、\n]/).map(s => s.trim()).filter(Boolean))]
}
function describeError(error: unknown): string {
 if (error instanceof Error) return error.message
 if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
 return '未知錯誤'
}

export default function StaffManagement() {
 const [notice, setNotice] = useState<Notice | null>(null)
 const [busy, setBusy] = useState(false)
 const busyRef = useRef(false)
 const [rows, setRows] = useState<Staff[]>([])
 const [selected, setSelected] = useState<Staff | null>(null)
 const [baseline, setBaseline] = useState<Staff | null>(null)
 const [isNew, setIsNew] = useState(false)
 const [loading, setLoading] = useState(true)
 const [query, setQuery] = useState('')
 const [filter, setFilter] = useState<Filter>('all')
 const [servicesText, setServicesText] = useState('')
 const [ordering, setOrdering] = useState(false)
 const [draggingId, setDraggingId] = useState<string | null>(null)
 const [dropTargetId, setDropTargetId] = useState<string | null>(null)
 const [pendingPhotos,setPendingPhotos]=useState<{id:string;file:File;url:string}[]>([])
 const [photoCrops,setPhotoCrops]=useState<Record<string,StaffCrop>>({})
 const [cropEditingId,setCropEditingId]=useState<string|null>(null)
 const stagedPhotoUrls=useRef<string[]>([])
 const editorRef = useRef<HTMLDivElement>(null)
 const { setEditing } = useAdminEditGuard()

 const dirty = useMemo(() => Boolean(selected && baseline && (
  JSON.stringify(selected) !== JSON.stringify(baseline)
  || servicesText !== baseline.services.join('、')
  || pendingPhotos.length>0 || Object.keys(photoCrops).length>0 || cropEditingId!==null
 )), [selected,baseline,servicesText,pendingPhotos,photoCrops,cropEditingId])

 useEffect(() => { setEditing(dirty, busy) }, [dirty, busy, setEditing])
 useEffect(() => () => setEditing(false, false), [setEditing])
 useEffect(()=>()=>{stagedPhotoUrls.current.forEach(url=>URL.revokeObjectURL(url))},[])
 function resetPhotoDrafts(){
  stagedPhotoUrls.current.forEach(url=>URL.revokeObjectURL(url))
  stagedPhotoUrls.current=[]
  setPendingPhotos([]);setPhotoCrops({});setCropEditingId(null)
 }

 const refresh = useCallback(async () => {
  const data = await getStaff(true)
  setRows(data)
  return data
 }, [])

 useEffect(() => {
  let active = true
  getStaff(true).then(data => { if (active) setRows(data) })
   .catch(error => { if (active) setNotice({ kind:'error', text:'名帖列表讀取失敗：' + (describeError(error)) }) })
   .finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [])

 const visible = useMemo(() => ordering ? rows : rows.filter(staff => {
  if (filter === 'published' && !staff.published) return false
  if (filter === 'draft' && staff.published) return false
  const term = query.trim().toLocaleLowerCase()
  return !term || [staff.name, staff.role, staff.tagline, ...staff.services].join(' ').toLocaleLowerCase().includes(term)
 }), [rows, query, filter, ordering])
 const publishedCount = rows.filter(staff => staff.published).length

 function confirmDiscard(): boolean {
  if (busyRef.current) return false
  return !dirty || window.confirm('目前有尚未儲存的名帖修改，確定要放棄變更？')
 }
 function selectStaff(person: Staff, creating = false) {
  if (!confirmDiscard()) return
  const draft = cloneStaff(person)
  setSelected(draft)
  setBaseline(cloneStaff(draft))
  setIsNew(creating)
  setServicesText(draft.services.join('、'))
  resetPhotoDrafts()
  setNotice(null)
  setOrdering(false)
  if (window.matchMedia('(max-width: 850px)').matches) {
   requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
 }
 function cancelEdit() {
  if (!confirmDiscard()) return
  setSelected(null)
  setBaseline(null)
  setIsNew(false)
  resetPhotoDrafts()
  setNotice(null)
 }
 function patch<K extends keyof Staff>(field: K, value: Staff[K]) {
  setSelected(current => current ? { ...current, [field]: value } : null)
 }
 function stagePhoto(event:ChangeEvent<HTMLInputElement>){
  const incoming=event.currentTarget.files?Array.from(event.currentTarget.files):[]
  event.currentTarget.value=''
  if(!incoming.length||!selected)return
  if((selected.photos?.length||0)+pendingPhotos.length+incoming.length>12){
   setNotice({kind:'error',text:'每位狐姬最多可設定 12 張名帖照片，請先移除部分照片。'});return
  }
  try{
   incoming.forEach(validateStaffImage)
   const added=incoming.map(file=>{
    const url=URL.createObjectURL(file);stagedPhotoUrls.current.push(url)
    return {id:crypto.randomUUID(),file,url}
   })
   setPendingPhotos(previous=>[...previous,...added])
   setCropEditingId(added[0].id)
   setNotice({kind:'info',text:'已加入 '+added.length+' 張照片，請逐張圈選名帖顯示範圍後儲存。'})
  }catch(error){setNotice({kind:'error',text:describeError(error)})}
 }
 function editPhotoCrop(id:string){
  setPhotoCrops(previous=>{const next={...previous};delete next[id];return next})
  setCropEditingId(id)
 }
 function removePhoto(id:string){
  const pending=pendingPhotos.find(photo=>photo.id===id)
  if(pending){
   URL.revokeObjectURL(pending.url)
   stagedPhotoUrls.current=stagedPhotoUrls.current.filter(url=>url!==pending.url)
   setPendingPhotos(previous=>previous.filter(photo=>photo.id!==id))
  }else if(selected){
   const next=(selected.photos||[]).filter(photo=>photo.id!==id)
   patch('photos',next);patch('imageUrl',next[0]?.imageUrl||'');patch('thumbnailUrl',next[0]?.thumbnailUrl||'')
  }
  setPhotoCrops(previous=>{const next={...previous};delete next[id];return next})
  if(cropEditingId===id)setCropEditingId(null)
 }
 function movePhoto(id:string,direction:-1|1){
  if(!selected)return
  const current=selected.photos||[],index=current.findIndex(photo=>photo.id===id),target=index+direction
  if(index<0||target<0||target>=current.length)return
  const next=[...current];[next[index],next[target]]=[next[target],next[index]]
  patch('photos',next);patch('imageUrl',next[0]?.imageUrl||'');patch('thumbnailUrl',next[0]?.thumbnailUrl||'')
 }

 async function save(){
  if(!selected||busyRef.current||!dirty)return
  if(cropEditingId||pendingPhotos.some(photo=>!photoCrops[photo.id])){
   setNotice({kind:'error',text:'請先逐張完成照片範圍圈選，再儲存名帖。'});return
  }
  const name=selected.name.trim()
  if(!name){setNotice({kind:'error',text:'請填寫員工名稱'});return}
  const color=selected.themeColor.trim()
  if(!/^#[0-9a-fA-F]{6}$/.test(color)){
   setNotice({kind:'error',text:'主題色必須是 #RRGGBB 格式，例如 #82c8bc'});return
  }
  if(selected.socials.some(s=>s.url.trim()&&(!s.label.trim()||!safeExternalUrl(s.url.trim())))){
   setNotice({kind:'error',text:'請為已填網址的社群設定名稱，並檢查網址必須以 http:// 或 https:// 開頭'});return
  }
  const sanitized:Staff={
   ...selected,name,role:selected.role.trim()||'接待者',themeColor:color,
   services:parseServices(servicesText),
   socials:selected.socials.filter(s=>s.url.trim()).map(s=>({...s,label:s.label.trim(),url:s.url.trim()})),
  }
  busyRef.current=true;setBusy(true)
  setNotice({kind:'info',text:pendingPhotos.length?'正在上傳多張原圖與圈選縮圖…':Object.keys(photoCrops).length?'正在更新照片取景範圍…':'正在儲存名帖…'})
  const uploadedPaths:string[]=[]
  const replacedPaths:string[]=[]
  const removedPaths:string[]=[]
  try{
   let nextPhotos=[...(sanitized.photos||[])]
   for(const photo of nextPhotos){
    const crop=photoCrops[photo.id]
    if(!crop)continue
    const updated=await uploadStaffCrop(photo.imageUrl,sanitized.id,crop)
    uploadedPaths.push(...updated.paths)
    if(photo.thumbnailPath)replacedPaths.push(photo.thumbnailPath)
    nextPhotos=nextPhotos.map(item=>item.id===photo.id
     ?{...item,thumbnailUrl:updated.thumb,thumbnailPath:updated.paths[0]}:item)
   }
   for(const pending of pendingPhotos){
    const uploaded=await uploadStaffImage(pending.file,sanitized.id,photoCrops[pending.id])
    uploadedPaths.push(...uploaded.paths)
    nextPhotos.push({id:crypto.randomUUID(),imageUrl:uploaded.full,thumbnailUrl:uploaded.thumb,
     imagePath:uploaded.paths[0],thumbnailPath:uploaded.paths[1]})
   }
   const kept=new Set(nextPhotos.map(photo=>photo.id))
   for(const oldPhoto of baseline?.photos||[]){
    if(!kept.has(oldPhoto.id))
     removedPaths.push(...[oldPhoto.imagePath,oldPhoto.thumbnailPath].filter((value):value is string=>Boolean(value)))
   }
   const first=nextPhotos[0]
   const saving:Staff={
    ...sanitized,photos:nextPhotos,imageUrl:first?.imageUrl||'',thumbnailUrl:first?.thumbnailUrl||'',
    photoDisplayMode:sanitized.photoDisplayMode==='gallery'?'gallery':'single',
   }
   await saveStaff(saving,isNew)
   invalidatePublicStaffCache()
   setSelected(cloneStaff(saving));setBaseline(cloneStaff(saving));setIsNew(false)
   setServicesText(saving.services.join('、'))
   resetPhotoDrafts()
   try{await removeUploadedStaffImages([...replacedPaths,...removedPaths])}
   catch(error){console.warn('舊名帖照片清理失敗：',error)}
   setNotice({kind:'success',text:saving.published?'名帖已儲存並公開。':'名帖已儲存為草稿。'})
   try{await refresh()}
   catch(error){
    setRows(current=>{
     const next=current.filter(staff=>staff.id!==saving.id);next.push(saving)
     return next.sort((a,b)=>a.sortOrder-b.sortOrder)
    })
    setNotice({kind:'info',text:'名帖已儲存成功，但更新左側清單失敗。可以稍後重新整理清單。'})
    console.warn('Staff list refresh failed:',error)
   }
  }catch(error){
   if(uploadedPaths.length){
    try{await removeUploadedStaffImages(uploadedPaths)}
    catch(cleanupError){console.warn('Unable to clean up unused photo uploads:',cleanupError)}
   }
   setNotice({kind:'error',text:'儲存失敗：'+describeError(error)})
  }finally{busyRef.current=false;setBusy(false)}
 }

 async function remove() {
  if (!selected || isNew || busyRef.current) return
  const text = '確定永久刪除「' + selected.name + '」的名帖？' + (dirty ? '\n尚未儲存的編輯也會被放棄。' : '') + '\n此操作無法復原。'
  if (!window.confirm(text)) return
  busyRef.current = true; setBusy(true); setNotice({ kind:'info', text:'正在刪除名帖…' })
  try {
   await deleteStaff(selected.id)
   invalidatePublicStaffCache()
   setRows(current => current.filter(person => person.id !== selected.id))
   setSelected(null)
   setBaseline(null)
   setPhotoFile(null)
   setConfirmedCrop(null)
   setCropEditing(false)
   setNotice({ kind:'success', text:'名帖已刪除。已上傳的圖片暫時保留在 Storage，避免誤刪其他資料。' })
  } catch (error) {
   setNotice({ kind:'error', text:'刪除失敗：' + (describeError(error)) })
  } finally {
   busyRef.current = false
   setBusy(false)
  }
 }

 async function reload() {
  if (!confirmDiscard()) return
  setLoading(true)
  setNotice(null)
  try {
   const next = await refresh()
   setOrdering(false)
   setSelected(null)
   setBaseline(null)
   setPhotoFile(null)
   setConfirmedCrop(null)
   setCropEditing(false)
   setNotice({ kind:'info', text:'清單已更新，共 ' + next.length + ' 位員工。' })
  } catch (error) {
   setNotice({ kind:'error', text:'重新整理失敗：' + (describeError(error)) })
  } finally { setLoading(false) }
 }

 function toggleOrdering() {
  if (busyRef.current || loading) return
  if (!ordering && dirty) {
   setNotice({ kind:'info', text:'請先儲存或關閉目前的編輯內容，再調整名冊順序。' })
   return
  }
  setOrdering(previous => !previous)
  setDraggingId(null)
  setDropTargetId(null)
  setNotice(null)
 }

 async function moveStaff(movedId: string, targetIndex: number) {
  if (!ordering || busyRef.current || dirty) return
  const plan = planStaffReorder(rows, movedId, targetIndex)
  if (plan.changes.length === 0) return
  busyRef.current = true
  setBusy(true)
  setNotice({ kind:'info', text:'正在儲存狐姬的出場順序…' })
  try {
   await saveStaffSortChanges(plan.changes)
   setRows(plan.ordered)
   // A visible editor and its saved baseline must follow the same order
   // without becoming falsely marked as an unsaved profile change.
   const selectedPosition = plan.ordered.find(person => person.id === selected?.id)
   if (selectedPosition) {
    setSelected(current => current ? { ...current, sortOrder:selectedPosition.sortOrder } : current)
    setBaseline(current => current ? { ...current, sortOrder:selectedPosition.sortOrder } : current)
   }
   invalidatePublicStaffCache()
   setNotice({ kind:'success', text:'出場順序已儲存，前台名冊會依新順序顯示。' })
  } catch (error) {
   try {
    const fresh = await refresh()
    const selectedPosition = fresh.find(person => person.id === selected?.id)
    if (selectedPosition) {
     setSelected(current => current ? { ...current, sortOrder:selectedPosition.sortOrder } : current)
     setBaseline(current => current ? { ...current, sortOrder:selectedPosition.sortOrder } : current)
    }
   } catch (reloadError) { console.warn('排序錯誤後更新清單失敗：', reloadError) }
   setNotice({ kind:'error', text:'排序未能完成，已嘗試還原並更新清單：' + describeError(error) })
  } finally {
   busyRef.current = false
   setBusy(false)
   setDraggingId(null)
   setDropTargetId(null)
  }
 }

 return <section className="admin-page admin-staff-module">
  <div className="admin-top staff-admin-heading">
   <div><p className="eyebrow">STAFF · CONTENT MANAGEMENT</p><h1>員工名帖管理</h1><p>管理角色資料與公開狀態。先選擇員工，編輯後再按儲存。</p></div>
   <div className="staff-admin-heading-actions">
    <Link to="/staff" target="_blank" rel="noopener noreferrer" className="staff-admin-secondary"><ExternalLink size={16}/> 查看前台</Link>
    <button className="staff-admin-secondary" type="button" disabled={busy || loading} onClick={() => void reload()}><RefreshCw size={16}/> 更新清單</button>
   </div>
  </div>

  <div className="staff-admin-stats" aria-label="員工統計">
   <span>全部 <strong>{rows.length}</strong></span>
   <span>已公開 <strong>{publishedCount}</strong></span>
   <span>草稿 <strong>{rows.length - publishedCount}</strong></span>
  </div>
  {notice && <p className={'staff-admin-notice is-' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}<span>{notice.text}</span></p>}

  <div className="admin-layout">
   <aside className="admin-roster staff-admin-roster">
    <div className="roster-title">
     <strong>員工清單</strong>
     <div className="staff-roster-actions">
      <button type="button" className={'staff-order-toggle' + (ordering ? ' is-active' : '')} disabled={busy || loading || rows.length < 2} aria-pressed={ordering} onClick={toggleOrdering}><ListOrdered size={16}/>{ordering ? '完成' : '排序'}</button>
      <button type="button" disabled={busy || ordering} onClick={() => {
       const lastOrder = rows.at(-1)?.sortOrder ?? 0
       selectStaff(blankStaff(Math.min(2147483647, lastOrder + 1024)), true)
      }}><Plus size={18}/> 新增</button>
     </div>
    </div>
    {ordering ? <p className="staff-sort-instructions"><GripVertical size={16}/> 拖曳調整順序，手機可用上下箭頭。每次移動都會自動儲存。</p> : <div className="staff-roster-tools">
     <label className="staff-roster-search"><Search size={17}/><input aria-label="搜尋員工" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋姓名、職稱或服務…"/></label>
     <select aria-label="篩選公開狀態" value={filter} onChange={event => setFilter(event.target.value as Filter)}>
      <option value="all">全部狀態</option><option value="published">已公開</option><option value="draft">草稿</option>
     </select>
     <p>{loading ? '正在讀取名帖…' : '顯示 ' + visible.length + ' / ' + rows.length + ' 位'}</p>
    </div>}
    <div className={'staff-roster-list' + (ordering ? ' is-ordering' : '')}>
     {visible.map((person, index) => <div key={person.id}
      className={'staff-roster-line' + (draggingId === person.id ? ' is-dragging' : '') + (dropTargetId === person.id ? ' is-drop-target' : '')}
      draggable={ordering && !busy}
      onDragStart={event => {
       if (!ordering || busy) { event.preventDefault(); return }
       setDraggingId(person.id)
       event.dataTransfer.effectAllowed = 'move'
       event.dataTransfer.setData('text/plain', person.id)
      }}
      onDragOver={event => {
       if (!ordering || !draggingId || busy) return
       event.preventDefault()
       event.dataTransfer.dropEffect = 'move'
       if (dropTargetId !== person.id) setDropTargetId(person.id)
      }}
      onDrop={event => {
       event.preventDefault()
       const id = draggingId || event.dataTransfer.getData('text/plain')
       setDraggingId(null)
       setDropTargetId(null)
       if (id) void moveStaff(id, index)
      }}
      onDragEnd={() => { setDraggingId(null); setDropTargetId(null) }}>
      {ordering && <span className="staff-roster-grip" aria-hidden="true"><GripVertical size={17}/></span>}
      <button disabled={busy} type="button" aria-pressed={selected?.id === person.id} aria-label={ordering ? person.name + '，可拖曳或利用方向按鈕排序' : '編輯 ' + person.name}
       className={'roster-item ' + (selected?.id === person.id ? 'current' : '')} onClick={() => { if (!ordering) selectStaff(person) }}>
       {person.thumbnailUrl ? <img src={person.thumbnailUrl} loading="lazy" alt=""/> : <span className="avatar-placeholder">狐</span>}
       <span className="staff-roster-person"><strong>{person.name}</strong><small>{person.role || '接待者'}</small><em className={person.published ? 'is-published' : 'is-draft'}>{person.published ? '已公開' : '草稿'}</em></span>
      </button>
      {ordering && <div className="staff-roster-move-buttons">
       <button type="button" aria-label={'將 ' + person.name + ' 上移'} title="上移" disabled={busy || index === 0} onClick={() => void moveStaff(person.id, index - 1)}><ArrowUp size={17}/></button>
       <button type="button" aria-label={'將 ' + person.name + ' 下移'} title="下移" disabled={busy || index === rows.length - 1} onClick={() => void moveStaff(person.id, index + 1)}><ArrowDown size={17}/></button>
      </div>}
     </div>)}
     {!loading && rows.length === 0 && <p className="roster-empty">目前沒有員工資料，點擊「新增」建立第一位員工。</p>}
     {!loading && rows.length > 0 && visible.length === 0 && <p className="roster-empty">沒有符合條件的員工，請調整搜尋或篩選。</p>}
     {loading && <p className="roster-empty" role="status">讀取名帖列表…</p>}
    </div>
    <ScrollCue target=".staff-roster-list"/>
   </aside>

   <div ref={editorRef} className={'admin-editor staff-admin-editor' + (busy ? ' is-busy' : '')}>
    {!selected ? <div className="editor-empty"><ImagePlus size={31}/><h2>選擇員工開始編輯</h2><p>也可以點擊左側「新增」，建立新的角色名帖。</p></div> :
    <form onSubmit={event => { event.preventDefault(); void save() }} aria-busy={busy}>
     <div className="editor-title staff-editor-title">
      <div><p className="eyebrow">{isNew ? 'NEW PROFILE' : 'EDIT PROFILE'}</p><h2>{selected.name || '新增員工'}</h2><span className={'staff-edit-status' + (dirty ? ' is-dirty' : '')}>{dirty ? '有未儲存變更' : '沒有待儲存變更'}</span></div>
      <button className="icon-button" type="button" disabled={busy} onClick={cancelEdit} aria-label="關閉編輯"><X size={20}/></button>
     </div>
     <fieldset disabled={busy} className="staff-editor-fields">
      <div className="staff-editor-section-title"><h3>基本資料</h3><small>修改後需要按儲存才會公開</small></div>
      <div className="form-grid">
       <label>姓名 <input value={selected.name} maxLength={60} onChange={event => patch('name', event.target.value)} required placeholder="員工角色名稱"/></label>
       <label>職稱 <input value={selected.role} maxLength={80} onChange={event => patch('role', event.target.value)} placeholder="例如：接待者／占卜師"/></label>
       <label className="span-2">名片短句 <input value={selected.tagline} maxLength={120} onChange={event => patch('tagline', event.target.value)} placeholder="會顯示於人員卡片下方的一句話"/><small className="staff-field-note">{selected.tagline.length} / 120 字 · 卡片上會以一行省略顯示</small></label>
       <label className="span-2">完整自我介紹 <textarea value={selected.bio} rows={7} onChange={event => patch('bio', event.target.value)} placeholder="人物介紹、喜好、聊天風格…"/><small className="staff-field-note">{selected.bio.length} 字 · 前台詳情可完整閱讀</small></label>
      </div>
      <div className="staff-editor-section-title"><h3>展示設定</h3><small>設定服務分類與名帖特效；出場順序可在左側清單調整</small></div>
      <div className="form-grid">
       <label>服務分類 <input value={servicesText} onChange={event => setServicesText(event.target.value)} placeholder="例如：接待、占卜、湯屋"/><small className="staff-field-note">用逗號、頓號分隔，可以連續輸入多項</small></label>
       <label>特效主題 <select value={selected.effect} onChange={event => patch('effect', event.target.value as Effect)}>{Object.entries(EFFECTS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
       <label>主題色 <div className="color-field"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(selected.themeColor) ? selected.themeColor : '#82c8bc'} onChange={event => patch('themeColor', event.target.value)} aria-label="選擇主題色"/><input aria-label="主題色 HEX 色碼" value={selected.themeColor} onChange={event => patch('themeColor', event.target.value)} maxLength={7}/></div></label>
      </div>
      <div className="staff-editor-section-title"><h3>角色照片相簿</h3><small>最多 12 張 · 每張可獨立圈選顯示範圍</small></div>
      <div className="staff-gallery-editor">
       <div className="staff-gallery-toolbar">
        <label className="upload-control"><ImagePlus size={18}/>新增照片（可多選）
         <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif" onChange={stagePhoto}/>
        </label>
        <label className="staff-gallery-mode">前台顯示
         <select value={selected.photoDisplayMode||'single'} onChange={event=>patch('photoDisplayMode',event.target.value as 'single'|'gallery')}>
          <option value="single">單張顯示（只顯示第一張）</option>
          <option value="gallery">多張輪播（含神祕分頁點）</option>
         </select>
        </label>
       </div>
       <div className="staff-gallery-photo-grid">
        {(selected.photos||[]).map((photo,index)=><article key={photo.id} className="staff-gallery-photo">
         <img src={photo.thumbnailUrl||photo.imageUrl} alt={'名帖照片第 '+(index+1)+' 張預覽'} loading="lazy"/>
         <strong>已儲存 · 第 {index+1} 張</strong>
         <div>
          <button type="button" disabled={index===0} onClick={()=>movePhoto(photo.id,-1)} aria-label="照片上移">↑</button>
          <button type="button" onClick={()=>editPhotoCrop(photo.id)}>圈選範圍</button>
          <button type="button" className="is-delete" onClick={()=>removePhoto(photo.id)}>刪除</button>
          <button type="button" disabled={index===(selected.photos||[]).length-1} onClick={()=>movePhoto(photo.id,1)} aria-label="照片下移">↓</button>
         </div>
         {photoCrops[photo.id]&&<small className="staff-crop-applied">已調整範圍，儲存後生效</small>}
        </article>)}
        {pendingPhotos.map((photo,index)=><article key={photo.id} className="staff-gallery-photo is-pending">
         <img src={photo.url} alt={'待新增名帖照片 '+(index+1)} loading="lazy"/>
         <strong>待新增 · {photo.file.name}</strong>
         <div>
          <button type="button" onClick={()=>editPhotoCrop(photo.id)}>圈選範圍</button>
          <button type="button" className="is-delete" onClick={()=>removePhoto(photo.id)}>移除</button>
         </div>
         <small>{photoCrops[photo.id]?'已完成取景':'尚未完成取景'}</small>
        </article>)}
       </div>
       {!selected.photos?.length&&!pendingPhotos.length&&<p className="staff-gallery-empty">尚未上傳照片，前台會顯示預設圖示。</p>}
       <small className="staff-field-note">原始照片會完整保留；名帖卡片使用你圈選的縮圖。多張模式會以神祕揭幕效果自動輪播，也可點選分頁點切換。</small>
      </div>
      {cropEditingId&&(()=>{
       const pending=pendingPhotos.find(photo=>photo.id===cropEditingId)
       const existing=(selected.photos||[]).find(photo=>photo.id===cropEditingId)
       const source=pending?.url||existing?.imageUrl||''
       return source?<StaffPhotoCrop key={cropEditingId+source} source={source} title="名帖照片"
        onConfirm={crop=>{setPhotoCrops(old=>({...old,[cropEditingId]:crop}));setCropEditingId(null);setNotice({kind:'info',text:'照片取景範圍已套用；請按「儲存名帖」同步前台。'})}}
        onCancel={()=>setCropEditingId(null)}/>:null
      })()}
      <div className="editor-block staff-editor-social"><div className="editor-block-header"><h3>社群連結</h3><button type="button" className="text-button" onClick={() => patch('socials', [...selected.socials, { id:crypto.randomUUID(), label:'Threads', url:'' }])}><Plus size={17}/> 新增社群</button></div><p>支援 Threads、X、Instagram 或個人網站，網址須包含 https://。</p>
       {selected.socials.length === 0 && <p className="staff-field-note">目前沒有社群連結。</p>}
       {selected.socials.map((social, index) => <div className="social-edit-row" key={social.id}>
        <input aria-label={'第' + (index + 1) + '項社群名稱'} value={social.label} placeholder="平台名稱" onChange={event => patch('socials', selected.socials.map(item => item.id === social.id ? { ...item, label:event.target.value } : item))}/>
        <input aria-label={'第' + (index + 1) + '項社群網址'} type="url" value={social.url} placeholder="https://…" onChange={event => patch('socials', selected.socials.map(item => item.id === social.id ? { ...item, url:event.target.value } : item))}/>
        <button type="button" className="icon-button" onClick={() => patch('socials', selected.socials.filter(item => item.id !== social.id))} aria-label="移除社群"><Trash2 size={18}/></button>
       </div>)}
      </div>
      <div className="staff-editor-publish">
       <label className="publish-toggle"><input type="checkbox" checked={selected.published} onChange={event => patch('published', event.target.checked)}/><span><strong>公開顯示這張名帖</strong><small>{selected.published ? '儲存後，前台訪客可以看到這位員工。' : '儲存後會保持草稿，只有管理員可查看。'}</small></span></label>
      </div>
      <div className="editor-footer staff-editor-footer">
       <span className="staff-editor-save-hint">{dirty ? '變更尚未儲存' : '已與上次儲存內容同步'}</span>
       <div className="editor-actions">
        {!isNew && <button type="button" className="danger-button" onClick={() => void remove()}><Trash2 size={16}/> 刪除</button>}
        <button type="submit" disabled={!dirty || !selected.name.trim()} className="action-button"><Save size={18}/>{busy ? '處理中…' : isNew ? '建立名帖' : '儲存變更'}</button>
       </div>
      </div>
     </fieldset>
    </form>}
   </div>
  </div>
 </section>
}
