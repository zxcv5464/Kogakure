import { lazy, Suspense, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import EntryIntro, { shouldPlay } from './components/EntryIntro'
import PageTransition from './components/PageTransition'
import StaffLoading from './components/StaffLoading'
import { HomePage, OtherPage } from './pages/OtherPages'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))

export default function App() {
 const [introReady, setIntroReady] = useState(() => !shouldPlay())
 return <>
  <Layout>
   <PageTransition introReady={introReady}>
    {location => (
     <Suspense fallback={location.pathname==='/staff'?<StaffLoading/>:<div className="empty-staff">正在載入頁面…</div>}>
      <Routes location={location}>
       <Route path="/" element={<HomePage />} />
       <Route path="/staff" element={<StaffPage />} />
       <Route path="/admin" element={<AdminPage />} />
       <Route path="*" element={<OtherPage />} />
      </Routes>
     </Suspense>
    )}
   </PageTransition>
  </Layout>
  <EntryIntro onReveal={() => setIntroReady(true)} />
 </>
}
