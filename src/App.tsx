import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import EntryIntro, { shouldPlay } from './components/EntryIntro'
import PageTransition from './components/PageTransition'
import StaffLoading from './components/StaffLoading'
import { HomePage, OtherPage } from './pages/OtherPages'
import AboutPage from './pages/AboutPage'
import ShiftsPage from './pages/ShiftsPage'
import MenuPage from './pages/MenuPage'
import BookingPage from './pages/BookingPage'
import ServicesPage from './pages/ServicesPage'
import {configured} from './lib/config'
import {prefetchBookingPage,prefetchMenuPage} from './lib/prefetch'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))
const MemoriesPage = lazy(() => import('./pages/MemoriesPage'))

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
 const {pathname}=useLocation()
 const [introReady, setIntroReady] = useState(() => !shouldPlay())
 const startMusic=useRef<()=>void>(()=>{})
 const registerBgm=useCallback((start:()=>void)=>{startMusic.current=start},[])
 // Prepare the two data-dependent visitor pages while guests read the homepage,
 // AFTER the logo has finished. This is background work only on the initial
 // public homepage: never compete with the logo, admin, or direct deep links.
 useEffect(()=>{
  if(!introReady||pathname!=='/'||!configured)return
  const network=navigator as Navigator & {connection?:{saveData?:boolean}}
  if(network.connection?.saveData)return
  let cancelled=false
  const idleJobs:number[]=[]
  const schedule=(delay:number,fn:()=>void)=>{
   return window.setTimeout(()=>{
    if(cancelled||document.visibilityState!=='visible')return
    if('requestIdleCallback' in window){
     idleJobs.push(window.requestIdleCallback(()=>{
      if(!cancelled&&document.visibilityState==='visible')fn()
     },{timeout:1400}))
    }else fn()
   },delay)
  }
  const menuTimer=schedule(850,prefetchMenuPage)
  const bookingTimer=schedule(1550,prefetchBookingPage)
  return()=>{
   cancelled=true
   window.clearTimeout(menuTimer)
   window.clearTimeout(bookingTimer)
   if('cancelIdleCallback' in window)idleJobs.forEach(id=>window.cancelIdleCallback(id))
  }
 },[introReady,pathname])
 return <>
  <Layout onRegisterBgm={registerBgm}>
   <PageTransition introReady={introReady}>
    {location => (
     <Suspense fallback={location.pathname === '/staff' ? <StaffLoading /> : <div className="empty-staff">正在載入頁面…</div>}>
      <Routes location={location}>
       <Route path="/" element={<HomePage />} />
       <Route path="/about" element={<AboutPage />} />
       <Route path="/services" element={<ServicesPage />} />
       <Route path="/staff" element={<StaffPage />} />
       <Route path="/menu" element={<MenuPage />} />
       <Route path="/booking" element={<BookingPage />} />
       <Route path="/memories" element={<MemoriesPage />} />
       <Route path="/shifts" element={<ShiftsPage />} />
       <Route path="*" element={<OtherPage />} />
      </Routes>
     </Suspense>
    )}
   </PageTransition>
  </Layout>
  <EntryIntro onEnter={()=>startMusic.current()} onReveal={() => setIntroReady(true)} />
 </>
}
