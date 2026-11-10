import { Link } from 'react-router-dom'
import { asset } from '../lib/paths'
import './admin-layout.css'

// A deliberately separate application frame: no public navigation, carousel,
// animated intro, footer, or mobile bottom navigation.
export default function AdminLayout({children}:{children:React.ReactNode}) {
 return <div className="admin-shell">
  <header className="admin-shell-header">
   <div className="admin-shell-header-inner">
    <Link to="/" className="admin-shell-brand" aria-label="返回狐隱前台首頁" title="返回前台">
     <img src={asset('images/brand/logo-header.webp')} alt="" width="38" height="38" />
     <span><strong>狐隱</strong><small>KOGAKURE</small></span>
    </Link>
    <span className="admin-shell-label">管理後台</span>
   </div>
  </header>
  <main className="admin-shell-main" id="main-content">{children}</main>
 </div>
}
