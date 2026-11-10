import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ImagePlus, LogOut, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import type { Staff, Effect } from '../types'
import { EFFECTS } from '../types'
import { supabase } from '../lib/supabase'
import { configured } from '../lib/config'
import { deleteStaff, getStaff, saveStaff } from '../lib/staff'
import { invalidatePublicStaffCache } from '../lib/public-staff'
import { safeExternalUrl } from '../lib/url'
import { uploadStaffImage } from '../lib/upload'
function blankStaff():Staff {
 return {id:crypto.randomUUID(),name:'',role:'接待者',tagline:'',bio:'',imageUrl:'',thumbnailUrl:'',themeColor:'#82c8bc',effect:'foxfire',socials:[],services:[],published:false,sortOrder:100}
}
export default function AdminPage(){
 const [state,setState]=useState<'loading'|'login'|'forbidden'|'ready'>(configured?'loading':'login')
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [message,setMessage]=useState('')
 const [busy,setBusy]=useState(false)
 const [rows,setRows]=useState<Staff[]>([])
 const [selected,setSelected]=useState<Staff|null>(null)
 const [isNew,setIsNew]=useState(false)
 const client=supabase
 const refresh=useCallback(async()=>{
  const list=await getStaff(true)
  setRows(list)
 },[])
 const verify=useCallback(async(id:string)=>{
  if(!client)return
  const {data,error}=await client.from('admin_users').select('user_id').eq('user_id',id).maybeSingle()
  if(error){setMessage(error.message);setState('forbidden');return}
  if(!data){setState('forbidden');return}
  setState('ready')
  try{await refresh()}catch(e){setMessage(e instanceof Error?e.message:'讀取失敗')}
 },[client,refresh])
 useEffect(()=>{if(!client)return;let alive=true;client.auth.getUser().then(({data})=>{
  if(!alive)return
  if(data.user)void verify(data.user.id);else setState('login')
 }).catch(()=>{if(alive)setState('login')})
 return()=>{alive=false}
 },[client,verify])
 async function login(e:FormEvent){
  e.preventDefault();if(!client)return
  setBusy(true);setMessage('')
  const {data,error}=await client.auth.signInWithPassword({email,password})
  setBusy(false);setPassword('')
  if(error){setMessage('登入失敗：'+error.message);return}
  if(data.user)void verify(data.user.id)
 }
 async function logout(){if(client)await client.auth.signOut();setSelected(null);setState('login');setRows([])}
 async function save(){
  if(!selected||!client)return
  if(!selected.name.trim()){setMessage('請先輸入姓名');return}
  const invalid=selected.socials.find(s=>s.url.trim()&&!safeExternalUrl(s.url))
  if(invalid){setMessage('請檢查社群網址：'+invalid.label);return}
  setBusy(true);setMessage('')
  try{await saveStaff({...selected,name:selected.name.trim()});invalidatePublicStaffCache();await refresh();setIsNew(false);setMessage('名帖已儲存。');}
  catch(e){setMessage('儲存失敗：'+(e instanceof Error?e.message:'未知錯誤'))}
  finally{setBusy(false)}
 }
 async function remove(){
  if(!selected||!client||isNew)return
  if(!window.confirm('確定要永久刪除「'+selected.name+'」的名帖？'))return
  setBusy(true)
  try{await deleteStaff(selected.id);invalidatePublicStaffCache();await refresh();setSelected(null);setMessage('名帖已刪除。')}
  catch(e){setMessage('刪除失敗：'+(e instanceof Error?e.message:'未知錯誤'))}
  finally{setBusy(false)}
 }
 async function upload(file:File){
  if(!selected)return
  setBusy(true);setMessage('正在最佳化圖片並上傳…')
  try{
   const urls=await uploadStaffImage(file,selected.id)
   setSelected(prev=>prev?{...prev,imageUrl:urls.full,thumbnailUrl:urls.thumb}:prev)
   setMessage('圖片已上傳；請再按「儲存名帖」完成更新。')
  }catch(e){setMessage('圖片處理失敗：'+(e instanceof Error?e.message:'未知錯誤'))}
  finally{setBusy(false)}
 }
 function patch<K extends keyof Staff>(field:K,value:Staff[K]){
  setSelected(s=>s?{...s,[field]:value}:s)
 }
 if(!configured)return <section className="admin-gate container"><ShieldCheck size={36}/><h1>狐隱管理後台</h1><p>目前尚未設定 Supabase。請依照專案 README 設定專案連線資訊與資料庫權限。</p></section>
 if(state!=='ready')return <section className="admin-gate container"><ShieldCheck size={35}/><p className="eyebrow">KOGAKURE ADMINISTRATION</p><h1>狐隱管理後台</h1>
  {state==='loading'?<p>正在確認登入權限…</p>:state==='forbidden'?<><p>此帳號沒有管理權限。請在 Supabase 中將帳號加入 admin_users。</p><button className="action-button" onClick={logout}>登出</button></>:<form onSubmit={login} className="login-form"><label>管理者 Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>密碼<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="action-button" disabled={busy} type="submit">登入管理後台</button></form>}
  {message&&<p className="admin-message" role="alert">{message}</p>}
</section>
 return <section className="admin-page container">
  <div className="admin-top"><div><p className="eyebrow">KOGAKURE · CONTENT MANAGEMENT</p><h1>人員名帖管理</h1><p>共 {rows.length} 位員工 · 管理公開資料、個人特效與社群連結</p></div><button className="text-button" onClick={logout}><LogOut size={17}/> 登出</button></div>
  {message&&<p className="admin-message" role="status">{message}</p>}
  <div className="admin-layout">
   <aside className="admin-roster"><div className="roster-title"><strong>名帖列表</strong><button type="button" onClick={()=>{setSelected(blankStaff());setIsNew(true);setMessage('')}}><Plus size={18}/> 新增</button></div>
    {rows.map(person=><button key={person.id} type="button" className={'roster-item '+(selected?.id===person.id?'current':'')} onClick={()=>{setSelected({...person});setIsNew(false);setMessage('')}}>
     {person.thumbnailUrl?<img src={person.thumbnailUrl} alt=""/>:<span className="avatar-placeholder">狐</span>}
     <span><strong>{person.name}</strong><small>{person.role} · {person.published?'已公開':'草稿'}</small></span>
    </button>)}
    {rows.length===0&&<p className="roster-empty">尚未建立正式人員資料。按「新增」建立第一張名帖。</p>}
   </aside>
   <div className="admin-editor">
    {!selected?<div className="editor-empty"><ImagePlus size={32}/><h2>選取名帖開始編輯</h2><p>可以修改角色資訊、照片、專屬動態效果與社群連結。</p></div>:
    <form onSubmit={e=>{e.preventDefault();void save()}}>
     <div className="editor-title"><div><p className="eyebrow">{isNew?'NEW PROFILE':'EDIT PROFILE'}</p><h2>{selected.name||'新增接待者'}</h2></div><button className="icon-button" type="button" onClick={()=>setSelected(null)} aria-label="關閉編輯"><X/></button></div>
     <div className="form-grid">
      <label>姓名 <input value={selected.name} maxLength={60} onChange={e=>patch('name',e.target.value)} required placeholder="員工角色名稱"/></label>
      <label>職稱 <input value={selected.role} maxLength={80} onChange={e=>patch('role',e.target.value)} placeholder="如：接待者／占卜師"/></label>
      <label className="span-2">名片短句 <input value={selected.tagline} maxLength={120} onChange={e=>patch('tagline',e.target.value)} placeholder="一兩句能代表角色的文字"/></label>
      <label className="span-2">完整自我介紹 <textarea value={selected.bio} rows={5} onChange={e=>patch('bio',e.target.value)} placeholder="人物介紹、喜好、聊天風格…"/></label>
      <label>特效主題 <select value={selected.effect} onChange={e=>patch('effect',e.target.value as Effect)}>{Object.entries(EFFECTS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
      <label>主題色 <div className="color-field"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(selected.themeColor)?selected.themeColor:'#82c8bc'} onChange={e=>patch('themeColor',e.target.value)} aria-label="選擇主題色"/><input value={selected.themeColor} onChange={e=>patch('themeColor',e.target.value)} maxLength={7}/></div></label>
      <label>服務分類（以逗號分隔） <input value={selected.services.join('、')} onChange={e=>patch('services',e.target.value.split(/[，,、]/).map(x=>x.trim()).filter(Boolean))} placeholder="接待、占卜、湯屋"/></label>
      <label>顯示順序 <input type="number" value={selected.sortOrder} onChange={e=>patch('sortOrder',Number(e.target.value))}/></label>
     </div>
     <div className="editor-block"><h3>角色照片</h3><p>自動產生高品質 WebP 大圖與列表縮圖，原始圖檔不會改動。</p><div className="upload-row">{selected.imageUrl&&<img className="upload-preview" src={selected.thumbnailUrl||selected.imageUrl} alt="員工預覽"/>}<label className="upload-control"><ImagePlus size={20}/> 選擇並上傳照片<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.currentTarget.value=''}}/></label></div></div>
     <div className="editor-block"><div className="editor-block-header"><h3>社群連結</h3><button type="button" className="text-button" onClick={()=>patch('socials',[...selected.socials,{id:crypto.randomUUID(),label:'Threads',url:''}])}><Plus size={17}/> 新增社群</button></div><p>可自由設定 Threads、X、Instagram、個人網站等連結，不使用預約按鈕。</p>
      {selected.socials.map((social,i)=><div className="social-edit-row" key={social.id}><input aria-label={'第'+(i+1)+'項社群名稱'} value={social.label} placeholder="平台名稱" onChange={e=>patch('socials',selected.socials.map(x=>x.id===social.id?{...x,label:e.target.value}:x))}/><input aria-label={'第'+(i+1)+'項社群網址'} type="url" value={social.url} placeholder="https://..." onChange={e=>patch('socials',selected.socials.map(x=>x.id===social.id?{...x,url:e.target.value}:x))}/><button type="button" className="icon-button" onClick={()=>patch('socials',selected.socials.filter(x=>x.id!==social.id))} aria-label="移除社群"><Trash2 size={18}/></button></div>)}
     </div>
     <div className="editor-footer"><label className="publish-toggle"><input type="checkbox" checked={selected.published} onChange={e=>patch('published',e.target.checked)}/> 對訪客公開名帖</label><div className="editor-actions">{!isNew&&<button type="button" className="danger-button" onClick={()=>void remove()} disabled={busy}><Trash2 size={17}/> 刪除</button>}<button type="submit" disabled={busy} className="action-button"><Save size={18}/>{busy?'處理中…':'儲存名帖'}</button></div></div>
    </form>}
   </div>
  </div>
 </section>
}
