import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, LockKeyhole } from 'lucide-react'
import { changeOwnPassword } from '../../lib/employee-accounts'
import { useAdminEditGuard } from './AdminEditGuard'

/**
 * Each employee can change their *own* password, regardless of which
 * functional modules were assigned. Never exposes manager account actions.
 */
export default function EmployeeSelfPassword(){
 const [current,setCurrent]=useState('')
 const [next,setNext]=useState('')
 const [confirm,setConfirm]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const {setEditing}=useAdminEditGuard()
 const editing=Boolean(current||next||confirm)
 useEffect(()=>setEditing(editing,busy),[editing,busy,setEditing])
 useEffect(()=>()=>setEditing(false,false),[setEditing])

 async function submit(event:FormEvent){
  event.preventDefault()
  if(busy)return
  setError('');setSuccess('');setBusy(true)
  try{
   await changeOwnPassword(current,next,confirm)
   setCurrent('');setNext('');setConfirm('')
   setSuccess('密碼已更新成功，下次登入請使用新密碼。')
  }catch(err){
   setError(err instanceof Error?err.message:'密碼更新未成功，請稍後再試')
  }finally{
   setBusy(false)
  }
 }
 return <section className="admin-security-settings employee-self-password" aria-labelledby="employee-password-title">
  <div className="employee-self-password-heading">
   <span className="employee-self-password-icon"><LockKeyhole size={20}/></span>
   <div>
    <h2 id="employee-password-title">我的帳號安全 · 自行修改密碼</h2>
    <p>首次登入後建議更換管理員提供的初始密碼。只會更改您自己的登入密碼，不影響其他員工帳號或館內權限。</p>
   </div>
  </div>
  <form onSubmit={submit} className="employee-self-password-form">
   <label>目前密碼
    <input type="password" autoComplete="current-password" value={current}
     onChange={e=>setCurrent(e.target.value)} required disabled={busy} placeholder="請輸入目前使用的登入密碼"/>
   </label>
   <label>新密碼（12～128 字，包含英文及數字）
    <input type="password" autoComplete="new-password" value={next}
     onChange={e=>setNext(e.target.value)} required minLength={12} maxLength={128} disabled={busy}
     placeholder="設定新的登入密碼"/>
   </label>
   <label>再次輸入新密碼
    <input type="password" autoComplete="new-password" value={confirm}
     onChange={e=>setConfirm(e.target.value)} required minLength={12} maxLength={128} disabled={busy}
     placeholder="再次確認新的登入密碼"/>
   </label>
   <button className="action-button" type="submit" disabled={busy||!current||!next||!confirm}>
    <KeyRound size={16}/>{busy?'驗證並更新中…':'確認修改自己的密碼'}
   </button>
  </form>
  {error&&<p role="alert" className="employee-self-password-error">{error}</p>}
  {success&&<p role="status" className="employee-self-password-success">{success}</p>}
  <p className="employee-self-password-hint">如果忘記目前的密碼，請聯繫館方管理員協助重設，不需要電子郵件驗證。</p>
 </section>
}
