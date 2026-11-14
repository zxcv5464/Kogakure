import { lazy, Suspense, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import EntryIntro, { shouldPlay } from './components/EntryIntro'
import PageTransition from './components/PageTransition'
import StaffLoading from './components/StaffLoading'
import MenuLoading from './components/MenuLoading'
import BookingLoading from './components/BookingLoading'
import { HomePage, OtherPage } from './pages/OtherPages'
import AboutPage from './pages/AboutPage'
import ServicesPage from './pages/ServicesPage'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))
const MenuPage = lazy(() => import('./pages/MenuPage'))
const BookingPage = lazy(() => import('./pages/BookingPage'))

// The administration route is deliberately separate from the public shell.
// This keeps its interface and loading state independent of public animations.
export default function App() {
 const { pathname } = useLocation()
 if (/^\/admin(?:\/|$)/.test(pathname)) return <AdminLayout>
  <Suspense fallback={<div className="admin-shell-loading" role="status">正在開啟管理後台…</div>}>
   <AdminPage />
  </Suspense>
 </AdminLayout>
 return <PublicApp />
}

function PublicApp() {
 const [introReady, setIntroReady] = useState(() => !shouldPlay())
 return <>
  <Layout>
   <PageTransition introReady={introReady}>
    {location => (
     <Suspense fallback={location.pathname === '/staff' ? <StaffLoading /> : location.pathname === '/menu' ? <MenuLoading /> : location.pathname === '/booking' ? <BookingLoading /> : <div className="empty-staff">正在載入頁面…</div>}>
      <Routes location={location}>
       <Route path="/" element={<HomePage />} />
       <Route path="/about" element={<AboutPage />} />
       <Route path="/services" element={<ServicesPage />} />
       <Route path="/staff" element={<StaffPage />} />
       <Route path="/menu" element={<MenuPage />} />
       <Route path="/booking" element={<BookingPage />} />
       <Route path="*" element={<OtherPage />} />
      </Routes>
     </Suspense>
    )}
   </PageTransition>
  </Layout>
  <EntryIntro onReveal={() => setIntroReady(true)} />
 </>
}
