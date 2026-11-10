import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowRight, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { configured } from '../lib/config'
import { ADMIN_MODULES } from './admin/modules'
import './admin/admin-workspace.css'

const StaffManagement = lazy(() => import('./admin/StaffManagement'))

// Authentication and authorization belong to the shared admin shell, not to
// any individual module. Every module is mounted only after verification.
export default function AdminPage() {
 const [state, setState] = useState<'loading' | 'login' | 'forbidden' | 'ready'>(configured ? 'loading' : 'login')
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [message, setMessage] = useState('')
 const [busy, setBusy] = useState(false)
 const client = supabase

 const verify = useCallback(async (id: string) => {
  if (!client) return
  const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', id).maybeSingle()
  if (error) { setMessage(error.message); setState('forbidden'); return }
  if (!data) { setState('forbidden'); return }
  setMessage('')
  setState('ready')
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
    ? <><p>此帳號沒有管理權限。請在 Supabase 中將帳號加入 admin_users。</p><button className="action-button" type="button" disabled={busy} onClick={() => void logout()}>登出</button></>
    : <form onSubmit={login} className="login-form">
      <label>管理者 Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/></label>
      <label>密碼<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label>
      <button className="action-button" disabled={busy} type="submit">{busy ? '登入中…' : '登入管理後台'}</button>
     </form>}
  {message && <p className="admin-message" role="alert">{message}</p>}
 </section>

 return <AdminWorkspace busy={busy} onLogout={() => void logout()}/>
}

function AdminWorkspace({ busy, onLogout }: { busy: boolean; onLogout: () => void }) {
 const { pathname } = useLocation()
 const active = ADMIN_MODULES.find(module => module.path && (pathname === module.path || pathname === module.path + '/'))

 return <div className="admin-workspace">
  <aside className="admin-workspace-nav" aria-label="後台功能選單">
   <p className="admin-workspace-nav-title">管理功能</p>
   <nav className="admin-nav-links">
    <NavLink end to="/admin" className={({ isActive }) => 'admin-nav-link' + (isActive ? ' is-active' : '')}>
     <LayoutDashboard size={18}/> <span>總覽</span>
    </NavLink>
    {ADMIN_MODULES.filter(module => module.status === 'available' && module.path).map(module => {
     const Icon = module.icon
     return <NavLink key={module.id} to={module.path!} className={({ isActive }) => 'admin-nav-link' + (isActive ? ' is-active' : '')}>
      <Icon size={18}/> <span>{module.title}</span>
     </NavLink>
    })}
   </nav>
   <div className="admin-nav-planned" aria-label="規劃中功能">
    <p>規劃中</p>
    {ADMIN_MODULES.filter(module => module.status === 'planned').map(module => {
     const Icon = module.icon
     return <div className="admin-nav-pending" key={module.id}><Icon size={17}/><span>{module.title}</span><small>尚未開放</small></div>
    })}
   </div>
   <button type="button" disabled={busy} className="admin-nav-logout" onClick={onLogout}><LogOut size={17}/> 登出</button>
  </aside>
  <div className="admin-workspace-content" id="admin-workspace-content">
   <Routes>
    <Route path="/admin" element={<AdminOverview/>}/>
    <Route path="/admin/staff" element={<Suspense fallback={<div className="admin-module-loading" role="status">正在開啟員工名帖管理…</div>}><StaffManagement/></Suspense>}/>
    <Route path="*" element={<Navigate to="/admin" replace/>}/>
   </Routes>
   {active && <div className="admin-workspace-module-footer"><Link to="/admin">返回管理總覽</Link></div>}
  </div>
 </div>
}

function AdminOverview() {
 const available = ADMIN_MODULES.filter(module => module.status === 'available')
 const planned = ADMIN_MODULES.filter(module => module.status === 'planned')

 return <section className="admin-overview" aria-labelledby="admin-overview-title">
  <div className="admin-overview-heading">
   <p className="eyebrow">KOGAKURE · ADMIN CONSOLE</p>
   <h1 id="admin-overview-title">管理總覽</h1>
   <p>從這裡選擇要管理的內容。每個功能都有獨立頁面，後續可以逐步新增。</p>
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
  <div className="admin-overview-section-heading is-planned"><h2>後續規劃</h2><span>{planned.length} 個預留模組</span></div>
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
  <p className="admin-overview-note">尚未開發的功能僅顯示規劃方向，不會操作資料庫或產生額外請求。</p>
 </section>
}
