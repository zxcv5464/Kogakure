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
import type { StaffCrop } from '../../lib/staff-crop'
import { useAdminEditGuard } from './AdminEditGuard'
import './staff-management.css'

type Filter = 'all' | 'published' | 'draft'
type Notice = { kind: 'success' | 'error' | 'info'; text: string }

function blankStaff(sortOrder = 1024): Staff {
 return {
  id: crypto.randomUUID(), name: '', role: '接待者', tagline: '', bio: '',
  imageUrl: '', thumbnailUrl: '', themeColor: '#82c8bc',
  effect: 'foxfire', socials: [], services: [], published: false, sortOrder,
 }
}
function cloneStaff(staff: Staff): Staff {
 return { ...staff, services: [...staff.services], socials: staff.socials.map(s => ({ ...s })) }
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
 const [photoFile, setPhotoFile] = useState<File | null>(null)
 const [confirmedCrop, setConfirmedCrop] = useState<StaffCrop | null>(null)
 const [cropEditing, setCropEditing] = useState(false)
 const [previewUrl, setPreviewUrl] = useState('')
 const editorRef = useRef<HTMLDivElement>(null)
 const { setEditing } = useAdminEditGuard()

 const dirty = useMemo(() => Boolean(selected && baseline && (
  JSON.stringify(selected) !== JSON.stringify(baseline)
  || servicesText !== baseline.services.join('、')
  || photoFile || confirmedCrop || cropEditing
 )), [selected, baseline, servicesText, photoFile, confirmedCrop, cropEditing])

 useEffect(() => { setEditing(dirty, busy) }, [dirty, busy, setEditing])
 useEffect(() => () => setEditing(false, false), [setEditing])
 useEffect(() => {
  if (!photoFile) { setPreviewUrl(''); return }
  const url = URL.createObjectURL(photoFile)
  setPreviewUrl(url)
  return () => URL.revokeObjectURL(url)
 }, [photoFile])

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
  setPhotoFile(null)
  setConfirmedCrop(null)
  setCropEditing(false)
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
  setPhotoFile(null)
  setConfirmedCrop(null)
  setCropEditing(false)
  setNotice(null)
 }
 function patch<K extends keyof Staff>(field: K, value: Staff[K]) {
  setSelected(current => current ? { ...current, [field]: value } : null)
 }
 function stagePhoto(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0]
  event.currentTarget.value = ''
  if (!file) return
  try {
   validateStaffImage(file)
   setPhotoFile(file)
   setConfirmedCrop(null)
   setCropEditing(true)
   setNotice({ kind:'info', text:'請先拖曳圈選要顯示的照片範圍，套用後再儲存。' })
  } catch (error) {
   setNotice({ kind:'error', text:describeError(error) })
  }
 }

 async function save() {
  if (!selected || busyRef.current || !dirty) return
  if (cropEditing || (photoFile && !confirmedCrop)) {
   setNotice({ kind:'error', text:'請先在照片圈選工具按「套用這個範圍」，再儲存名帖。' }); return
  }
  const name = selected.name.trim()
  if (!name) { setNotice({ kind:'error', text:'請填寫員工名稱' }); return }
  const color = selected.themeColor.trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) { setNotice({ kind:'error', text:'主題色必須是 #RRGGBB 格式，例如 #82c8bc' }); return }
  if (selected.socials.some(s => s.url.trim() && (!s.label.trim() || !safeExternalUrl(s.url.trim())))) {
   setNotice({ kind:'error', text:'請為已填網址的社群設定名稱，並檢查網址必須以 http:// 或 https:// 開頭' }); return
  }
  const sanitized: Staff = {
   ...selected, name, role: selected.role.trim() || '接待者', themeColor: color,
   services: parseServices(servicesText),
   socials: selected.socials.filter(s => s.url.trim()).map(s => ({ ...s, label: s.label.trim(), url: s.url.trim() })),
  }
  busyRef.current = true
  setBusy(true)
  setNotice({ kind:'info', text:photoFile ? '正在上傳原圖與手動圈選縮圖…' : confirmedCrop ? '正在儲存新的圈選縮圖…' : '正在儲存名帖…' })
  let uploaded: { paths: string[] } | undefined
  try {
   let saving = sanitized
   if (photoFile && confirmedCrop) {
    const photos = await uploadStaffImage(photoFile, sanitized.id, confirmedCrop)
    uploaded = photos
    saving = { ...sanitized, imageUrl: photos.full, thumbnailUrl: photos.thumb }
   } else if (confirmedCrop) {
    const photo = await uploadStaffCrop(sanitized.imageUrl || sanitized.thumbnailUrl, sanitized.id, confirmedCrop)
    uploaded = photo
    saving = { ...sanitized, thumbnailUrl: photo.thumb }
   }
   await saveStaff(saving, isNew)
   invalidatePublicStaffCache()
   // Commit the successful local state first; a refresh failure must not
   // misreport an already-written record as a failed save.
   setSelected(cloneStaff(saving))
   setBaseline(cloneStaff(saving))
   setIsNew(false)
   setServicesText(saving.services.join('、'))
   setPhotoFile(null)
   setConfirmedCrop(null)
   setCropEditing(false)
   setNotice({ kind:'success', text:saving.published ? '名帖已儲存並公開。' : '名帖已儲存為草稿。' })
   try {
    await refresh()
   } catch (error) {
    setRows(current => {
     const next = current.filter(staff => staff.id !== saving.id)
     next.push(saving)
     return next.sort((a, b) => a.sortOrder - b.sortOrder)
    })
    setNotice({ kind:'info', text:'名帖已儲存成功，但更新左側清單失敗。可以稍後重新整理清單。' })
    console.warn('Staff list refresh failed:', error)
   }
  } catch (error) {
   if (uploaded) {
    try { await removeUploadedStaffImages(uploaded.paths) }
    catch (cleanupError) { console.warn('Unable to clean up unused photo upload:', cleanupError) }
   }
   setNotice({ kind:'error', text:'儲存失敗：' + (describeError(error)) })
  } finally {
   busyRef.current = false
   setBusy(false)
  }
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
      <div className="staff-editor-section-title"><h3>角色照片</h3><small>自行圈選名冊範圍，原圖會保留</small></div>
      <div className="staff-editor-photo">
       <div className="staff-editor-photo-preview">
        {previewUrl || selected.thumbnailUrl || selected.imageUrl ? <img src={previewUrl || selected.thumbnailUrl || selected.imageUrl} alt="員工照片預覽"/> : <ImagePlus size={36}/>}
       </div>
       <div className="staff-editor-photo-actions">
        <p>{photoFile ? '已選取：' + photoFile.name : selected.imageUrl ? '目前使用的員工照片' : '尚未設定照片'}</p>
        <small>{photoFile ? '新照片尚未上傳。請先套用名冊顯示範圍，儲存才會上傳。' : '原始照片完整保留；可重新圈選名冊卡片範圍，不影響詳情大圖。'}</small>
        <label className="upload-control"><ImagePlus size={19}/> {photoFile ? '重新選擇照片' : '選擇照片'}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={stagePhoto}/></label>
        {photoFile && <button className="staff-admin-secondary" type="button" onClick={() => {setPhotoFile(null);setConfirmedCrop(null);setCropEditing(false)}}>取消這次照片變更</button>}
        {!photoFile && (selected.imageUrl || selected.thumbnailUrl) && <button className="staff-admin-secondary" type="button" onClick={() => {setConfirmedCrop(null);setCropEditing(true)}}>重新圈選名冊照片範圍</button>}
        {confirmedCrop && !cropEditing && <small className="staff-crop-applied" role="status">✓ 已套用自訂範圍，儲存後前台立即使用此構圖</small>}
       </div>
      </div>
      {cropEditing && (previewUrl || selected.imageUrl || selected.thumbnailUrl) && <StaffPhotoCrop
       key={(previewUrl || selected.imageUrl || selected.thumbnailUrl) + selected.id}
       source={previewUrl || selected.imageUrl || selected.thumbnailUrl}
       onConfirm={crop => {setConfirmedCrop(crop);setCropEditing(false);setNotice({kind:'info',text:'名冊構圖已選定；請按「儲存名帖」將自訂縮圖同步到前台。'})}}
       onCancel={() => {setCropEditing(false);if(photoFile){setPhotoFile(null);setConfirmedCrop(null)}}}
      />}
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
