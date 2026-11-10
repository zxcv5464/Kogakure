import { useCallback, useEffect, useState } from 'react'
import { ImagePlus, Plus, Save, Trash2, X } from 'lucide-react'
import type { Staff, Effect } from '../../types'
import { EFFECTS } from '../../types'
import { deleteStaff, getStaff, saveStaff } from '../../lib/staff'
import { invalidatePublicStaffCache } from '../../lib/public-staff'
import { safeExternalUrl } from '../../lib/url'
import { uploadStaffImage } from '../../lib/upload'

// The staff editor is independent of the dashboard and the shared auth gate.
// Only mounted after the parent verifies the user's admin_users membership.
function blankStaff(): Staff {
 return {
  id: crypto.randomUUID(), name: '', role: '接待者', tagline: '', bio: '',
  imageUrl: '', thumbnailUrl: '', themeColor: '#82c8bc',
  effect: 'foxfire', socials: [], services: [], published: false, sortOrder: 100,
 }
}

export default function StaffManagement() {
 const [message, setMessage] = useState('')
 const [busy, setBusy] = useState(false)
 const [rows, setRows] = useState<Staff[]>([])
 const [selected, setSelected] = useState<Staff | null>(null)
 const [isNew, setIsNew] = useState(false)
 const [loading, setLoading] = useState(true)

 const refresh = useCallback(async () => {
  const list = await getStaff(true)
  setRows(list)
 }, [])

 useEffect(() => {
  let alive = true
  getStaff(true).then(list => { if (alive) setRows(list) })
   .catch(e => { if (alive) setMessage('讀取失敗：' + (e instanceof Error ? e.message : '未知錯誤')) })
   .finally(() => { if (alive) setLoading(false) })
  return () => { alive = false }
 }, [])

 async function save() {
  if (!selected) return
  if (!selected.name.trim()) { setMessage('請先輸入姓名'); return }
  const invalid = selected.socials.find(s => s.url.trim() && !safeExternalUrl(s.url))
  if (invalid) { setMessage('請檢查社群網址：' + invalid.label); return }
  setBusy(true); setMessage('')
  try {
   await saveStaff({ ...selected, name: selected.name.trim() })
   invalidatePublicStaffCache()
   await refresh()
   setIsNew(false)
   setMessage('名帖已儲存。')
  } catch (e) { setMessage('儲存失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  finally { setBusy(false) }
 }

 async function remove() {
  if (!selected || isNew) return
  if (!window.confirm('確定要永久刪除「' + selected.name + '」的名帖？')) return
  setBusy(true); setMessage('')
  try {
   await deleteStaff(selected.id)
   invalidatePublicStaffCache()
   await refresh()
   setSelected(null)
   setMessage('名帖已刪除。')
  } catch (e) { setMessage('刪除失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  finally { setBusy(false) }
 }

 async function upload(file: File) {
  if (!selected) return
  setBusy(true); setMessage('正在最佳化圖片並上傳…')
  try {
   const urls = await uploadStaffImage(file, selected.id)
   setSelected(prev => prev ? { ...prev, imageUrl: urls.full, thumbnailUrl: urls.thumb } : prev)
   setMessage('圖片已上傳；請再按「儲存名帖」完成更新。')
  } catch (e) { setMessage('圖片處理失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  finally { setBusy(false) }
 }

 function patch<K extends keyof Staff>(field: K, value: Staff[K]) {
  setSelected(s => s ? { ...s, [field]: value } : s)
 }

 return <section className="admin-page admin-staff-module">
  <div className="admin-top">
   <div>
    <p className="eyebrow">STAFF · CONTENT MANAGEMENT</p>
    <h1>員工名帖管理</h1>
    <p>{loading ? '讀取員工資料中…' : `共 ${rows.length} 位員工`} · 管理公開資訊、個人特效及社群連結</p>
   </div>
  </div>
  {message && <p className="admin-message" role="status">{message}</p>}
  <div className="admin-layout">
   <aside className="admin-roster">
    <div className="roster-title"><strong>名帖列表</strong><button type="button" disabled={busy} onClick={() => { setSelected(blankStaff()); setIsNew(true); setMessage('') }}><Plus size={18}/> 新增</button></div>
    {rows.map(person => <button key={person.id} type="button" className={'roster-item ' + (selected?.id === person.id ? 'current' : '')} onClick={() => { setSelected({ ...person }); setIsNew(false); setMessage('') }}>
     {person.thumbnailUrl ? <img src={person.thumbnailUrl} alt=""/> : <span className="avatar-placeholder">狐</span>}
     <span><strong>{person.name}</strong><small>{person.role} · {person.published ? '已公開' : '草稿'}</small></span>
    </button>)}
    {!loading && rows.length === 0 && <p className="roster-empty">尚未建立正式人員資料。按「新增」建立第一張名帖。</p>}
    {loading && <p className="roster-empty" role="status">讀取名帖列表…</p>}
   </aside>
   <div className="admin-editor">
    {!selected ? <div className="editor-empty"><ImagePlus size={32}/><h2>選取名帖開始編輯</h2><p>可以修改角色資訊、照片、專屬動態效果與社群連結。</p></div> :
    <form onSubmit={e => { e.preventDefault(); void save() }}>
     <div className="editor-title"><div><p className="eyebrow">{isNew ? 'NEW PROFILE' : 'EDIT PROFILE'}</p><h2>{selected.name || '新增接待者'}</h2></div><button className="icon-button" type="button" onClick={() => setSelected(null)} aria-label="關閉編輯"><X/></button></div>
     <div className="form-grid">
      <label>姓名 <input value={selected.name} maxLength={60} onChange={e => patch('name', e.target.value)} required placeholder="員工角色名稱"/></label>
      <label>職稱 <input value={selected.role} maxLength={80} onChange={e => patch('role', e.target.value)} placeholder="如：接待者／占卜師"/></label>
      <label className="span-2">名片短句 <input value={selected.tagline} maxLength={120} onChange={e => patch('tagline', e.target.value)} placeholder="一兩句能代表角色的文字"/></label>
      <label className="span-2">完整自我介紹 <textarea value={selected.bio} rows={5} onChange={e => patch('bio', e.target.value)} placeholder="人物介紹、喜好、聊天風格…"/></label>
      <label>特效主題 <select value={selected.effect} onChange={e => patch('effect', e.target.value as Effect)}>{Object.entries(EFFECTS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>主題色 <div className="color-field"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(selected.themeColor) ? selected.themeColor : '#82c8bc'} onChange={e => patch('themeColor', e.target.value)} aria-label="選擇主題色"/><input value={selected.themeColor} onChange={e => patch('themeColor', e.target.value)} maxLength={7}/></div></label>
      <label>服務分類（以逗號分隔） <input value={selected.services.join('、')} onChange={e => patch('services', e.target.value.split(/[，,、]/).map(x => x.trim()).filter(Boolean))} placeholder="接待、占卜、湯屋"/></label>
      <label>顯示順序 <input type="number" value={selected.sortOrder} onChange={e => patch('sortOrder', Number(e.target.value))}/></label>
     </div>
     <div className="editor-block"><h3>角色照片</h3><p>自動產生高品質 WebP 大圖與列表縮圖，原始圖檔不會改動。</p><div className="upload-row">{selected.imageUrl && <img className="upload-preview" src={selected.thumbnailUrl || selected.imageUrl} alt="員工預覽"/>}<label className="upload-control"><ImagePlus size={20}/> 選擇並上傳照片<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = '' }}/></label></div></div>
     <div className="editor-block"><div className="editor-block-header"><h3>社群連結</h3><button type="button" className="text-button" onClick={() => patch('socials', [...selected.socials, { id: crypto.randomUUID(), label: 'Threads', url: '' }])}><Plus size={17}/> 新增社群</button></div><p>可自由設定 Threads、X、Instagram、個人網站等連結，不使用預約按鈕。</p>
      {selected.socials.map((social, i) => <div className="social-edit-row" key={social.id}><input aria-label={'第' + (i + 1) + '項社群名稱'} value={social.label} placeholder="平台名稱" onChange={e => patch('socials', selected.socials.map(s => s.id === social.id ? { ...s, label: e.target.value } : s))}/><input aria-label={'第' + (i + 1) + '項社群網址'} type="url" value={social.url} placeholder="https://..." onChange={e => patch('socials', selected.socials.map(s => s.id === social.id ? { ...s, url: e.target.value } : s))}/><button type="button" className="icon-button" onClick={() => patch('socials', selected.socials.filter(s => s.id !== social.id))} aria-label="移除社群"><Trash2 size={18}/></button></div>)}
     </div>
     <div className="editor-footer"><label className="publish-toggle"><input type="checkbox" checked={selected.published} onChange={e => patch('published', e.target.checked)}/> 對訪客公開名帖</label><div className="editor-actions">{!isNew && <button type="button" className="danger-button" onClick={() => void remove()} disabled={busy}><Trash2 size={17}/> 刪除</button>}<button type="submit" disabled={busy} className="action-button"><Save size={18}/>{busy ? '處理中…' : '儲存名帖'}</button></div></div>
    </form>}
   </div>
  </div>
 </section>
}
