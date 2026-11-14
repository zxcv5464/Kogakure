import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getBackofficeAccess, permitted } from '../lib/employee-accounts'
import type { BackofficeAccess } from '../lib/employee-accounts'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowRight, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { configured } from '../lib/config'
import { ADMIN_MODULES } from './admin/modules'
import { useAdminEditGuard } from './admin/AdminEditGuard'
import BookingNotification, { usePendingBookings } from './admin/BookingNotification'
import './admin/admin-workspace.css'

const StaffManagement = lazy(() => import('./admin/StaffManagement'))
const MenuManagement = lazy(() => import('./admin/MenuManagement'))
const BookingManagement = lazy(() => import('./admin/BookingManagement'))
const EmployeeAccountsManagement = lazy(() => import('./admin/EmployeeAccountsManagement'))

// Authentication and authorization belong to the shared admin shell, not to
// any individual module. Every module is mounted only after verification.
export default function AdminPage() {
 const [state, setState] = useState<'loading' | 'login' | 'forbidden' | 'ready'>(configured ? 'loading' : 'login')
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [message, setMessage] = useState('')
 const [busy, setBusy] = useState(false)
 const [access, setAccess] = useState<BackofficeAccess | null>(null)
 const client = supabase

 const verify = useCallback(async (id: string) => {
  if (!client) return
  try {
   const authorized = await getBackofficeAccess(id)
   if (!authorized) {setAccess(null);setState('forbidden');return}
   setAccess(authorized)
   setMessage('')
   setState('ready')
  } catch(error) {
   setAccess(null)
   setMessage(error instanceof Error ? error.message : '權限驗證暫時失敗')
   setState('forbidden')
  }
 }, [client])

 useEffect(() => {
  if (!client) return
  let alive = true
  client.auth.getUser().then(({ data, error }) => {
   if (!alive) return
   if (error || !data.user) { setState('login'); return }
   void verify(data.user.id)
  }).catch(() => { if (alive) setState('login') })
  return () => { alive = false }
 }, [client, verify])

 async function login(e: FormEvent) {
  e.preventDefault()
  if (!client) return
  setBusy(true); setMessage('')
  try {
   const { data, error } = await client.auth.signInWithPassword({ email, password })
   setPassword('')
   if (error) { setMessage('登入失敗：' + error.message); return }
   if (data.user) await verify(data.user.id)
  } catch (error) {
   setMessage('登入失敗：' + (error instanceof Error ? error.message : '網路連線異常'))
  } finally { setBusy(false) }
 }

 async function logout() {
  setBusy(true)
  try {
   if (client) await client.auth.signOut()
   setState('login')
   setAccess(null)
   setMessage('')
   setPassword('')
  } finally { setBusy(false) }
 }

 if (!configured) return <section className="admin-gate"><ShieldCheck size={35}/><h1>狐隱管理後台</h1><p>目前尚未設定 Supabase。請依照專案 README 設定專案連線資訊與資料庫權限。</p></section>

 if (state !== 'ready') return <section className="admin-gate">
  <ShieldCheck size={35}/>
  <p className="eyebrow">KOGAKURE ADMINISTRATION</p>
  <h1>狐隱管理後台</h1>
  {state === 'loading'
   ? <p role="status">正在確認登入權限…</p>
   : state === 'forbidden'
    ? <><p>此帳號目前未被授權使用狐隱後台，或員工帳號已停用。請聯繫館方管理者檢查授權設定。</p><button className="action-button" type="button" disabled={busy} onClick={() => void logout()}>登出</button></>
    : <form onSubmit={login} className="login-form">
      <label>管理者／員工 Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/></label>
      <label>密碼<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label>
      <button className="action-button" disabled={busy} type="submit">{busy ? '登入中…' : '登入狐隱後台'}</button>
      <button className="admin-password-help" type="button" disabled={busy||!email.trim()} onClick={async()=>{
       if(!client)return
       setBusy(true)
       try{
        const {error}=await client.auth.resetPasswordForEmail(email.trim(),{
         redirectTo:'https://zxcv5464.github.io/Kogakure/admin/',
        })
        setMessage(error?'無法發送重設郵件，請聯繫館方管理者。':'若此 Email 已註冊，將收到重設密碼郵件。')
       }catch{setMessage('無法發送重設郵件，請稍後重試')}
       finally{setBusy(false)}
      }}>忘記密碼／重設登入密碼</button>
     </form>}
  {message && <p className="admin-message" role="alert">{message}</p>}
 </section>

 return access ? <AdminWorkspace access={access} busy={busy} onLogout={() => void logout()}/> : null
}

function allowed(access:BackofficeAccess,id:string){
 if(id==='accounts')return access.kind==='owner'
 if(id==='staff')return permitted(access,'staff.manage')
 if(id==='menu')return permitted(access,'menu.manage')
 if(id==='booking')return permitted(access,'booking.manage')
 return false
}
function ProtectedModule({access,module,children}:{
 access:BackofficeAccess;module:string;children:React.ReactNode
}){
 return allowed(access,module) ? <>{children}</> : <Navigate to="/admin" replace/>
}
function AdminWorkspace({ access,busy, onLogout }: {
 access:BackofficeAccess;busy: boolean;onLogout: () => void
}) {
 const { pathname } = useLocation()
 const {canLeave, confirmNavigation} = useAdminEditGuard()
 const { pendingCount, unread, failed, dismiss } = usePendingBookings(allowed(access,'booking'))
 const active = ADMIN_MODULES.find(module => module.path && allowed(access,module.id) && (pathname === module.path || pathname === module.path + '/'))

 return <div className="admin-workspace">
  <aside className="admin-workspace-nav" aria-label="後台功能選單">
   <p className="admin-workspace-nav-title">{access.kind==='owner'?'管理功能':'員工功能'}</p>
   <nav className="admin-nav-links">
    <NavLink end to="/admin" onClick={confirmNavigation} className={({ isActive }) => 'admin-nav-link' + (isActive ? ' is-active' : '')}>
     <LayoutDashboard size={18}/> <span>總覽</span>
    </NavLink>
    {ADMIN_MODULES.filter(module => module.status === 'available' && module.path && allowed(access,module.id)).map(module => {
     const Icon = module.icon
     const bookingItem = module.id === 'booking'
     const hasPending = bookingItem && !failed && pendingCount !== null && pendingCount > 0
     return <NavLink key={module.id} to={module.path!} onClick={confirmNavigation}
      aria-label={bookingItem
       ? failed ? '預約管理，待審核數量暫時無法更新'
        : pendingCount !== null ? '預約管理，' + pendingCount + ' 筆待審核預約'
        : '預約管理，正在更新預約數量'
       : undefined}
      className={({ isActive }) => 'admin-nav-link' + (isActive ? ' is-active' : '') + (hasPending ? ' has-booking-pending' : '')}>
      <Icon size={18}/> <span>{module.title}</span>
      {hasPending && <span className="admin-nav-booking-badge" aria-hidden="true" title={pendingCount + ' 筆待審核預約'}>{pendingCount}</span>}
      {bookingItem && failed && <span className="admin-nav-booking-warning" aria-hidden="true" title="預約數量暫時無法更新">!</span>}
     </NavLink>
    })}
   </nav>
   {access.kind==='owner'&&<div className="admin-nav-planned" aria-label="規劃中功能">
    <p>規劃中</p>
    {ADMIN_MODULES.filter(module => module.status === 'planned').map(module => {
     const Icon = module.icon
     return <div className="admin-nav-pending" key={module.id}><Icon size={17}/><span>{module.title}</span><small>尚未開放</small></div>
    })}
   </div>}
   <button type="button" disabled={busy} className="admin-nav-logout" onClick={() => {if (canLeave()) onLogout()}}> <LogOut size={17}/> 登出</button>
  </aside>
  <div className="admin-workspace-content" id="admin-workspace-content">
   {allowed(access,'booking')&&<BookingNotification pendingCount={pendingCount} unread={unread} onDismiss={dismiss} />}
   <Routes>
    <Route path="/admin" element={<AdminOverview access={access}/>}/>
    <Route path="/admin/staff" element={<ProtectedModule access={access} module="staff"><Suspense fallback={<div className="admin-module-loading" role="status">正在開啟員工名帖管理…</div>}><StaffManagement/></Suspense></ProtectedModule>}/>
    <Route path="/admin/menu" element={<ProtectedModule access={access} module="menu"><Suspense fallback={<div className="admin-module-loading" role="status">正在開啟茶宴菜單管理…</div>}><MenuManagement/></Suspense></ProtectedModule>}/>
    <Route path="/admin/booking" element={<ProtectedModule access={access} module="booking"><Suspense fallback={<div className="admin-module-loading" role="status">正在開啟預約管理…</div>}><BookingManagement/></Suspense></ProtectedModule>}/>
    <Route path="/admin/accounts" element={<ProtectedModule access={access} module="accounts"><Suspense fallback={<div className="admin-module-loading" role="status">正在開啟員工帳號管理…</div>}><EmployeeAccountsManagement/></Suspense></ProtectedModule>}/>
    <Route path="*" element={<Navigate to="/admin" replace/>}/>
   </Routes>
   {active && <div className="admin-workspace-module-footer"><Link to="/admin" onClick={confirmNavigation}>返回管理總覽</Link></div>}
  </div>
 </div>
}

function AdminOverview({access}:{access:BackofficeAccess}) {
 const available = ADMIN_MODULES.filter(module => module.status === 'available'&&allowed(access,module.id))
 const planned = access.kind==='owner'?ADMIN_MODULES.filter(module => module.status === 'planned'):[]

 return <section className="admin-overview" aria-labelledby="admin-overview-title">
  <div className="admin-overview-heading">
   <p className="eyebrow">KOGAKURE · ADMIN CONSOLE</p>
   <h1 id="admin-overview-title">管理總覽</h1>
   <p>{access.kind==='owner'?'從這裡管理館內功能和員工帳號。':'歡迎進入狐隱員工後台。僅會顯示館方授權的管理功能。'}</p>
  </div>
  <div className="admin-overview-section-heading"><h2>目前可使用</h2><span>{available.length} 個功能</span></div>
  <div className="admin-module-grid">
   {available.map(module => {
    const Icon = module.icon
    return <Link key={module.id} to={module.path!} className="admin-module-card is-available">
     <span className="admin-module-icon"><Icon size={23}/></span>
     <span className="admin-module-content"><strong>{module.title}</strong><small>{module.summary}</small></span>
     <ArrowRight size={18} className="admin-module-arrow"/>
    </Link>
   })}
  </div>
  {access.kind==='owner'&&<><div className="admin-overview-section-heading is-planned"><h2>後續規劃</h2><span>{planned.length} 個預留模組</span></div>
  <div className="admin-module-grid">
   {planned.map(module => {
    const Icon = module.icon
    return <div key={module.id} className="admin-module-card is-planned" aria-label={module.title + '，尚未開放'}>
     <span className="admin-module-icon"><Icon size={22}/></span>
     <span className="admin-module-content"><strong>{module.title}</strong><small>{module.summary}</small></span>
     <span className="admin-module-status">規劃中</span>
    </div>
   })}
  </div>
  <p className="admin-overview-note">尚未開發的功能僅顯示規劃方向，不會操作資料庫或產生額外請求。</p></>}
  <AccountSecurity />
 </section>
}

function AccountSecurity(){
 const [password,setPassword]=useState('')
 const [confirm,setConfirm]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 async function save(event:FormEvent){
  event.preventDefault()
  if(password.length<10||password!==confirm){
   setMessage('請輸入至少 10 字且兩次相同的密碼');return
  }
  if(!supabase)return
  setBusy(true);setMessage('')
  try{
   const {error}=await supabase.auth.updateUser({password})
   if(error)throw error
   setPassword('');setConfirm('')
   setMessage('登入密碼已更新，後續可以使用 Email 與新密碼登入')
  }catch{setMessage('密碼更新未成功，請重新登入或使用重設密碼郵件')}
  finally{setBusy(false)}
 }
 return <details className="admin-security-settings">
  <summary>帳號安全 · 設定／更改登入密碼</summary>
  <p>首次接受館方邀請登入的員工，請在這裡設定專屬密碼。管理員與其他員工無法查看你的密碼。</p>
  <form onSubmit={e=>void save(e)}>
   <label>新密碼（至少 10 字）<input type="password" autoComplete="new-password"
    minLength={10} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <label>確認新密碼<input type="password" autoComplete="new-password"
    minLength={10} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
   <button type="submit" className="action-button" disabled={busy}>{busy?'更新中…':'設定登入密碼'}</button>
  </form>
  {message&&<p role="status">{message}</p>}
 </details>
}
