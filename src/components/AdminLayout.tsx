import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { asset } from '../lib/paths'
import { AdminEditGuardProvider, useAdminEditGuard } from '../pages/admin/AdminEditGuard'
import './admin-layout.css'

// A deliberately separate application frame: no public navigation, carousel,
// animated intro, footer, or mobile bottom navigation.
export default function AdminLayout({children}:{children:React.ReactNode}) {
 return <AdminEditGuardProvider><AdminLayoutFrame>{children}</AdminLayoutFrame></AdminEditGuardProvider>
}

function AdminLayoutFrame({children}:{children:React.ReactNode}) {
 const {confirmNavigation} = useAdminEditGuard()
 const { pathname } = useLocation()
 useEffect(() => {
  document.title = '狐隱 KOGAKURE｜' + (pathname.replace(/\/+$/, '') === '/admin/accounts' ? '員工帳號與權限' : pathname.replace(/\/+$/, '') === '/admin/booking' ? '預約管理' : pathname.replace(/\/+$/, '') === '/admin/orders' ? '茶宴訂單管理' : pathname.replace(/\/+$/, '') === '/admin/menu' ? '菜單管理' : pathname.replace(/\/+$/, '') === '/admin/staff' ? '員工名帖管理' : '管理後台')
 }, [pathname])
 return <div className="admin-shell">
  <header className="admin-shell-header">
   <div className="admin-shell-header-inner">
    <Link to="/" onClick={confirmNavigation} className="admin-shell-brand" aria-label="返回狐隱前台首頁" title="返回前台">
     <img src={asset('images/brand/logo-header.webp')} alt="" width="38" height="38" />
     <span><strong>狐隱</strong><small>KOGAKURE</small></span>
    </Link>
    <span className="admin-shell-label">管理後台</span>
   </div>
  </header>
  <main className="admin-shell-main" id="main-content">{children}</main>
 </div>
}
