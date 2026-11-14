import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, MailPlus, RefreshCw, Save, Shield, UserRound, XCircle } from 'lucide-react'
import {
 EMPLOYEE_PERMISSIONS, inviteEmployee, listEmployeeAccounts, updateEmployee,
} from '../../lib/employee-accounts'
import type { EmployeeAccount, EmployeePermission } from '../../lib/employee-accounts'
import { useAdminEditGuard } from './AdminEditGuard'
import './employee-accounts.css'

type Draft = {userId?:string;email:string;displayName:string;permissions:EmployeePermission[];active:boolean}
const blank=():Draft=>({email:'',displayName:'',permissions:[],active:true})
const toDraft=(r:EmployeeAccount):Draft=>({
 userId:r.userId,email:r.email,displayName:r.displayName,
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
 const busyRef=useRef(false)
 const {setEditing}=useAdminEditGuard()
 const changed=useMemo(()=>draft!==null&&(
  !initial||JSON.stringify({...draft,permissions:[...draft.permissions].sort()})
   !==JSON.stringify({...initial,permissions:[...initial.permissions].sort()})
 ),[draft,initial])
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
 function choose(record:EmployeeAccount|null){
  if(busyRef.current)return
  if(changed&&!window.confirm('尚有未儲存的權限修改，確定放棄？'))return
  const next=record?toDraft(record):blank()
  setDraft(next);setInitial({...next,permissions:[...next.permissions]})
  setError('');setNotice('')
 }
 function toggle(permission:EmployeePermission,enabled:boolean){
  setDraft(old=>old?{
   ...old,
   permissions:enabled?[...old.permissions.filter(x=>x!==permission),permission]:
    old.permissions.filter(x=>x!==permission),
  }:old)
 }
 async function save(){
  if(!draft||busyRef.current)return
  if(draft.displayName.trim().length<1||draft.displayName.trim().length>70){
   setError('請填寫長度 1～70 字的員工顯示名稱');return
  }
  if(!draft.userId && !/^\S+@\S+\.\S+$/.test(draft.email.trim())){
   setError('請填寫有效的員工 Email');return
  }
  if(!draft.permissions.length&&!window.confirm('此帳號未分配任何後台模組，將無法進入管理功能。確定儲存嗎？'))return
  busyRef.current=true;setBusy(true);setNotice('');setError('')
  try{
   const message=draft.userId
    ? await updateEmployee({
      userId:draft.userId,displayName:draft.displayName.trim(),
      permissions:draft.permissions,active:draft.active,
     })
    : await inviteEmployee({
      email:draft.email.trim(),displayName:draft.displayName.trim(),
      permissions:draft.permissions,
     })
   await refresh()
   setDraft(null);setInitial(null);setNotice(message)
  }catch(e){setError(pretty(e))}
  finally{busyRef.current=false;setBusy(false)}
 }
 return <section className="employee-admin admin-page">
  <header className="employee-admin-heading">
   <div><p className="eyebrow">KOGAKURE · STAFF ACCESS</p>
    <h1>員工帳號與權限</h1>
    <p>邀請員工登入、分配可用的後台功能，並可隨時暫停或恢復存取。</p>
   </div>
   <div className="employee-admin-heading-actions">
    <button type="button" onClick={()=>{void refresh().catch(e=>setError(pretty(e)))}} disabled={busy}><RefreshCw size={16}/>更新</button>
    <button type="button" className="employee-action-primary" onClick={()=>choose(null)} disabled={busy}><MailPlus size={16}/>邀請員工</button>
   </div>
  </header>
  <div className="employee-admin-explainer">
   <Shield size={19}/>
   <p>僅正式管理者能建立帳號及變更授權。員工會透過 Email 收到邀請，自行設定登入密碼；不會取得其他模組或「員工帳號管理」權限。停用後資料庫立即拒絕該帳號操作。</p>
  </div>
  {error&&<p role="alert" className="employee-admin-error">{error}</p>}
  {notice&&<p role="status" className="employee-admin-success"><CheckCircle2 size={18}/>{notice}</p>}
  <div className="employee-admin-layout">
   <div className="employee-admin-list">
    <h2>員工帳號 <span>{accounts.length}</span></h2>
    {loading?<p className="employee-admin-empty">正在取得帳號清單…</p>:!accounts.length?
     <p className="employee-admin-empty">目前尚未建立員工登入帳號。可使用「邀請員工」開始新增。</p>:
     accounts.map(account=><button key={account.userId} type="button"
      className={'employee-admin-person'+(draft?.userId===account.userId?' is-selected':'')}
      disabled={busy} onClick={()=>choose(account)}>
      <span className="employee-admin-avatar"><UserRound size={19}/></span>
      <span className="employee-admin-person-content"><strong>{account.displayName}</strong>
       <small>{account.email}</small>
       <em>{account.permissions.map(p=>EMPLOYEE_PERMISSIONS.find(x=>x.id===p)?.label).filter(Boolean).join('、')||'尚未分配模組'}</em>
      </span>
      <span className={'employee-admin-status'+(account.active?' is-active':' is-disabled')}>
       {account.active?'使用中':'已停用'}
      </span>
     </button>)}
   </div>
   <div className="employee-admin-editor">
    {!draft?<div className="employee-admin-placeholder">
     <Shield size={29}/><h2>管理登入與權限</h2>
     <p>點選左側員工以修改可使用的功能，或邀請一位新員工。</p>
    </div>:<form onSubmit={event=>{event.preventDefault();void save()}}>
     <h2>{draft.userId?'編輯員工帳號':'邀請新員工'}</h2>
     <label>員工顯示名稱
      <input required minLength={1} maxLength={70} autoComplete="off" value={draft.displayName} disabled={busy}
       onChange={e=>setDraft(old=>old?{...old,displayName:e.target.value}:null)}
       placeholder="例如：月迎、狐姬紫宵"/>
     </label>
     <label>登入 Email
      <input required type="email" autoComplete="off" value={draft.email} disabled={busy||!!draft.userId}
       onChange={e=>setDraft(old=>old?{...old,email:e.target.value}:null)}
       placeholder="employee@example.com"/>
     </label>
     {!draft.userId&&<p className="employee-admin-hint">系統會寄送一次性邀請連結，員工從邀請郵件登入後自行設定密碼，管理者無須持有員工密碼。</p>}
     <fieldset className="employee-admin-permissions"><legend>後台功能權限</legend>
      {EMPLOYEE_PERMISSIONS.map(permission=><label key={permission.id} className="employee-permission">
       <input type="checkbox" checked={draft.permissions.includes(permission.id)} disabled={busy}
        onChange={e=>toggle(permission.id,e.target.checked)}/>
       <span><strong>{permission.label}</strong><small>{permission.description}</small></span>
      </label>)}
      <p>未勾選的功能不會顯示於員工後台，且資料庫也會拒絕未授權的寫入。</p>
     </fieldset>
     {draft.userId&&<label className="employee-admin-active">
      <input type="checkbox" checked={draft.active} disabled={busy}
       onChange={e=>setDraft(old=>old?{...old,active:e.target.checked}:null)}/>
      <span><strong>允許此員工登入後台</strong>
       <small>{draft.active?'停用可立即阻止後台資料存取':'目前已停用，重新勾選才恢復授權'}</small>
      </span>
     </label>}
     <div className="employee-admin-editor-buttons">
      <button type="button" onClick={()=>{if(!changed||window.confirm('放棄權限修改？')){setDraft(null);setInitial(null)}}} disabled={busy}>取消</button>
      <button className="employee-action-primary" type="submit" disabled={busy||(!changed&&!!draft.userId)}>
       <Save size={16}/>{busy?'處理中…':draft.userId?'儲存權限':'建立並寄送邀請'}
      </button>
     </div>
     {draft.userId&&!draft.active&&<p className="employee-admin-danger"><XCircle size={15}/>停用只會停止登入後台的資料存取，不會刪除員工名帖或歷史預約。</p>}
    </form>}
   </div>
  </div>
 </section>
}
