import './menu-loading.css'

// Shared by the lazy-route fallback and the Supabase fetch phase.
// Keep the exact same surface on both sides of lazy hydration, so the
// route does not briefly show two different loading screens.
export default function MenuLoading() {
 return <div className="tea-menu-loading" role="status" aria-live="polite" aria-label="茶宴御品載入中">
  <div className="tea-menu-loading-inner">
   <span className="tea-menu-loading-seal" aria-hidden="true">◇</span>
   <p>茶寮正為旅人備妥御品…</p>
  </div>
 </div>
}
