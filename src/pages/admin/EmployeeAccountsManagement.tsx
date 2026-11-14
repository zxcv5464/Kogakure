import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, KeyRound, Plus, RefreshCw, Save, Shield, Trash2, UserRound, XCircle } from 'lucide-react'
import {
 EMPLOYEE_PERMISSIONS, STAFF_LOGIN_PATTERN, STAFF_PASSWORD_VALID,
 convertLegacyEmployee, createEmployee, deleteEmployee, listEmployeeAccounts, resetEmployeePassword, updateEmployee,
} from '../../lib/employee-accounts'
import type { EmployeeAccount, EmployeePermission } from '../../lib/employee-accounts'
import { useAdminEditGuard } from './AdminEditGuard'
import './employee-accounts.css'

type Draft={userId?:string;username:string;displayName:string;permissions:EmployeePermission[];active:boolean}
const blank=():Draft=>({username:'',displayName:'',permissions:[],active:true})
const toDraft=(r:EmployeeAccount):Draft=>({
 userId:r.userId,username:r.username,displayName:r.displayName,
 permissions:[...r.permissions],active:r.active,
})
const pretty=(e:unknown)=>e instanceof Error?e.message:'帳號管理暫時無法使用，請重新整理'

export default function EmployeeAccountsManagement(){
 const [accounts,setAccounts]=useState<EmployeeAccount[]>([])
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [draft,setDraft]=useState<Draft|null>(null)
 const [initial,setInitial]=useState<Draft|null>(null)
 const [password,setPassword]=useState('')
 const [passwordConfirm,setPasswordConfirm]=useState('')
 const [resetPassword,setResetPassword]=useState('')
 const [resetConfirm,setResetConfirm]=useState('')
 const [legacyUsername,setLegacyUsername]=useState('')
 const busyRef=useRef(false)
 const {setEditing}=useAdminEditGuard()
 const settingsChanged=useMemo(()=>draft!==null&&(
  !initial||JSON.stringify({...draft,permissions:[...draft.permissions].sort()})
   !==JSON.stringify({...initial,permissions:[...initial.permissions].sort()})
 ),[draft,initial])
 const changed=settingsChanged||!!password||!!passwordConfirm||!!resetPassword||!!resetConfirm||!!legacyUsername
 useEffect(()=>setEditing(changed,busy),[changed,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 const refresh=useCallback(async()=>{
  const rows=await listEmployeeAccounts()
  setAccounts(rows);setError('')
 },[])
 useEffect(()=>{
  let alive=true
  void refresh().catch(e=>{if(alive)setError(pretty(e))})
   .finally(()=>{if(alive)setLoading(false)})
  return()=>{alive=false}
 },[refresh])
 function resetInputs(){
  setPassword('');setPasswordConfirm('');setResetPassword('');setResetConfirm('');setLegacyUsername('')
 }
 function choose(record:EmployeeAccount|null){
  if(busyRef.current)return
  if(changed&&!window.confirm('尚有未儲存的修改，確定放棄？'))return
  const next=record?toDraft(record):blank()
  setDraft(next);setInitial({...next,permissions:[...next.permissions]})
  resetInputs();setError('');setNotice('')
 }
 function toggle(permission:EmployeePermission,enabled:boolean){
  setDraft(old=>old?{
   ...old,permissions:enabled?
    [...old.permissions.filter(x=>x!==permission),permission]:
    old.permissions.filter(x=>x!==permission),
  }:old)
 }
 async function save(){
  if(!draft||busyRef.current|| (!!draft.userId&&!settingsChanged))return
  if(draft.displayName.trim().length<1||draft.displayName.trim().length>70){
   setError('請填寫長度 1～70 字的員工顯示名稱');return
  }
  if(!draft.userId&&!STAFF_LOGIN_PATTERN.test(draft.username.trim().toLowerCase())){
   setError('登入帳號需 3～24 字，英文字母開頭，只能使用英文、數字、底線或連字號');return
  }
  if(!draft.userId&&(!STAFF_PASSWORD_VALID(password)||password!==passwordConfirm)){
   setError('初始密碼需 12～128 字，包含英文與數字，且兩次輸入必須相同');return
  }
  if(!draft.permissions.length&&!window.confirm('此帳號未分配任何後台模組，將無法使用管理功能。確定儲存嗎？'))return
  busyRef.current=true;setBusy(true);setNotice('');setError('')
  try{
   const message=draft.userId
    ? await updateEmployee({
      userId:draft.userId,displayName:draft.displayName.trim(),
      permissions:draft.permissions,active:draft.active,
     })
    : await createEmployee({
      username:draft.username.trim().toLowerCase(),password,
      displayName:draft.displayName.trim(),permissions:draft.permissions,
     })
   resetInputs()
   await refresh()
   setDraft(null);setInitial(null);setNotice(message)
  }catch(e){setError(pretty(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function changePassword(){
  if(!draft?.userId||busyRef.current)return
  const legacy=draft.username.startsWith('legacy_')
  const nextUsername=legacyUsername.trim().toLowerCase()
  if(legacy&&!STAFF_LOGIN_PATTERN.test(nextUsername)){
   setError('請先為舊帳號設定 3～24 字的全新登入名稱');return
  }
  if(!STAFF_PASSWORD_VALID(resetPassword)||resetPassword!==resetConfirm){
   setError('新密碼需 12～128 字，包含英文與數字，且兩次輸入必須相同');return
  }
  if(settingsChanged){
   setError('請先儲存員工顯示名稱及功能權限，再修改登入憑證');return
  }
  if(!window.confirm(legacy?'確定轉換舊員工帳號為「'+nextUsername+'」並設定新密碼嗎？原 Email 登入方式將停止使用。':'確定重設「'+draft.username+'」的登入密碼嗎？原密碼將無法再用於新的登入。'))return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{
   const message=legacy
    ? await convertLegacyEmployee(draft.userId,nextUsername,resetPassword)
    : await resetEmployeePassword(draft.userId,resetPassword)
   resetInputs()
   if(legacy){
    await refresh()
    const next={...draft,username:nextUsername}
    setDraft(next);setInitial({...next,permissions:[...next.permissions]})
   }
   setNotice(message)
  }catch(e){setError(pretty(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function remove(){
  if(!draft?.userId||busyRef.current)return
  const expected=draft.username
  if(window.prompt('這將永久刪除員工登入帳號及權限。請輸入「'+expected+'」確認刪除：')!==expected)return
  if(!window.confirm('確認永久刪除「'+expected+'」的登入帳號？此操作無法還原，員工名帖與歷史預約將保留。'))return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{
   const message=await deleteEmployee(draft.userId)
   resetInputs();setDraft(null);setInitial(null)
   await refresh()
   setNotice(message)
  }catch(e){setError(pretty(e))}
  finally{busyRef.current=false;setBusy(false)}
 }

 return <section className="employee-admin admin-page">
  <header className="employee-admin-heading">
   <div><p className="eyebrow">KOGAKURE · STAFF ACCESS</p>
    <h1>員工帳號與權限</h1>
    <p>由管理員建立登入帳號及密碼，設定後台權限、重設密碼或刪除帳號。</p>
   </div>
   <div className="employee-admin-heading-actions">
    <button type="button" onClick={()=>{void refresh().catch(e=>setError(pretty(e)))}} disabled={busy}><RefreshCw size={16}/>更新</button>
    <button type="button" className="employee-action-primary" onClick={()=>choose(null)} disabled={busy}><Plus size={16}/>新增員工帳號</button>
   </div>
  </header>
  <div className="employee-admin-explainer">
   <Shield size={19}/>
   <p>只有正式管理員能建立、重設密碼與刪除登入帳號；不寄送邀請郵件。
    員工只會取得被授予的後台功能。密碼由 Supabase Auth 安全保存，建立後無法查閱原密碼。</p>
  </div>
  {error&&<p role="alert" className="employee-admin-error">{error}</p>}
  {notice&&<p role="status" className="employee-admin-success"><CheckCircle2 size={18}/>{notice}</p>}
  <div className="employee-admin-layout">
   <div className="employee-admin-list">
    <h2>員工帳號 <span>{accounts.length}</span></h2>
    {loading?<p className="employee-admin-empty">正在取得帳號清單…</p>:!accounts.length?
     <p className="employee-admin-empty">目前沒有員工登入帳號。請使用「新增員工帳號」建立。</p>:
     accounts.map(account=><button key={account.userId} type="button"
      className={'employee-admin-person'+(draft?.userId===account.userId?' is-selected':'')}
      disabled={busy} onClick={()=>choose(account)}>
      <span className="employee-admin-avatar"><UserRound size={19}/></span>
      <span className="employee-admin-person-content"><strong>{account.displayName}</strong>
       <small>{account.username.startsWith('legacy_')?'舊版員工帳號 · 請設定新登入名稱':'登入帳號：'+account.username}</small>
       <em>{account.permissions.map(p=>EMPLOYEE_PERMISSIONS.find(x=>x.id===p)?.label).filter(Boolean).join('、')||'尚未分配模組'}</em>
      </span>
      <span className={'employee-admin-status'+(account.active?' is-active':' is-disabled')}>
       {account.active?'使用中':'已停用'}
      </span>
     </button>)}
   </div>
   <div className="employee-admin-editor">
    {!draft?<div className="employee-admin-placeholder">
     <Shield size={29}/><h2>管理員工登入帳號</h2>
     <p>點選左側員工修改權限、重設密碼或刪除帳號；也可新增登入帳號。</p>
    </div>:<form onSubmit={event=>{event.preventDefault();void save()}}>
     <h2>{draft.userId?'編輯員工帳號':'新增員工登入帳號'}</h2>
     <label>員工顯示名稱
      <input required minLength={1} maxLength={70} autoComplete="off" value={draft.displayName} disabled={busy}
       onChange={e=>setDraft(old=>old?{...old,displayName:e.target.value}:null)}
       placeholder="例如：月迎、狐姬紫宵"/>
     </label>
     <label>員工登入帳號（英文、數字、底線、連字號）
      <input required minLength={3} maxLength={24} pattern="[a-zA-Z][a-zA-Z0-9_-]{2,23}"
       autoComplete="off" value={draft.username} disabled={busy||!!draft.userId}
       onChange={e=>setDraft(old=>old?{...old,username:e.target.value}:null)}
       placeholder="例如：yueying"/>
     </label>
     {!draft.userId&&<>
      <label>初始密碼（至少 12 字，包含英文及數字）
       <input type="password" required minLength={12} maxLength={128} autoComplete="new-password"
        value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} />
      </label>
      <label>再次輸入初始密碼
       <input type="password" required minLength={12} maxLength={128} autoComplete="new-password"
        value={passwordConfirm} disabled={busy} onChange={e=>setPasswordConfirm(e.target.value)} />
      </label>
      <p className="employee-admin-hint">不需要電子郵件。由管理員建立帳號及密碼後，請私下安全地交付給員工；網站不會顯示已儲存的密碼。</p>
     </>}
     <fieldset className="employee-admin-permissions"><legend>後台功能權限</legend>
      {EMPLOYEE_PERMISSIONS.map(permission=><label key={permission.id} className="employee-permission">
       <input type="checkbox" checked={draft.permissions.includes(permission.id)} disabled={busy}
        onChange={e=>toggle(permission.id,e.target.checked)}/>
       <span><strong>{permission.label}</strong><small>{permission.description}</small></span>
      </label>)}
      <p>沒有授權的功能不會顯示，資料庫也會拒絕未授權的讀寫。</p>
     </fieldset>
     {draft.userId&&<label className="employee-admin-active">
      <input type="checkbox" checked={draft.active} disabled={busy}
       onChange={e=>setDraft(old=>old?{...old,active:e.target.checked}:null)}/>
      <span><strong>允許此員工登入後台</strong>
       <small>{draft.active?'停用會即時撤回資料存取權限':'已停用，重新勾選可恢復授權'}</small>
      </span>
     </label>}
     <div className="employee-admin-editor-buttons">
      <button type="button" onClick={()=>{if(!changed||window.confirm('放棄帳號修改？')){setDraft(null);setInitial(null);resetInputs()}}} disabled={busy}>取消</button>
      <button className="employee-action-primary" type="submit" disabled={busy||(!settingsChanged&&!!draft.userId)}>
       <Save size={16}/>{busy?'處理中…':draft.userId?'儲存權限':'建立員工帳號'}
      </button>
     </div>
     {draft.userId&&<>
      <div className="employee-admin-security">
       <h3><KeyRound size={18}/>{draft.username.startsWith('legacy_')?'舊版帳號轉換':'管理員重設密碼'}</h3>
       <p>{draft.username.startsWith('legacy_')
        ? '此員工是舊版登入帳號。請設定新的登入名稱與密碼，原有權限將保留，不會寄送郵件。'
        : '需要更換密碼時，由管理員直接設定新密碼，不寄送電子郵件。'}</p>
       {draft.username.startsWith('legacy_')&&<label>新的員工登入帳號
        <input type="text" maxLength={24} autoComplete="off"
         placeholder="例如：yueying" value={legacyUsername} disabled={busy}
         onChange={e=>setLegacyUsername(e.target.value)} />
       </label>}
       <label>新登入密碼
        <input type="password" maxLength={128} autoComplete="new-password"
         value={resetPassword} disabled={busy} placeholder="至少 12 字，需包含英文及數字"
         onChange={e=>setResetPassword(e.target.value)} />
       </label>
       <label>確認新密碼
        <input type="password" maxLength={128} autoComplete="new-password"
         value={resetConfirm} disabled={busy} onChange={e=>setResetConfirm(e.target.value)}/>
       </label>
       <button type="button" className="employee-admin-reset" disabled={busy||!resetPassword||!resetConfirm}
        onClick={()=>void changePassword()}><KeyRound size={16}/>{draft.username.startsWith('legacy_')?'轉換帳號並設定密碼':'確認重設密碼'}</button>
      </div>
      <div className="employee-admin-delete">
       <h3>刪除登入帳號</h3>
       <p>此操作會永久刪除員工登入身分及權限，不會刪除公開員工名帖、茶宴菜單或歷史預約。刪除後須重新建立才能登入。</p>
       <button type="button" disabled={busy} className="employee-admin-delete-button"
        onClick={()=>void remove()}><Trash2 size={16}/>永久刪除「{draft.username}」帳號</button>
      </div>
      {!draft.active&&<p className="employee-admin-danger"><XCircle size={15}/>此帳號已停用，無法繼續使用後台資料。</p>}
     </>}
    </form>}
   </div>
  </div>
 </section>
}
