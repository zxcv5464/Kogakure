import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import SceneBackdrop from './SceneBackdrop'
import { STAFF_PAGE_READY_EVENT } from '../lib/route-events'
import './page-transition.css'
import './route-motion.css'

// The route changes only once the background is opaque. This prevents a
// flash of the destination page before the fade-in begins.
const COVER_MS = 650
const REVEAL_MS = 760
const STAFF_READY_TIMEOUT_MS = 8000

function resetScroll() {
 // The site uses smooth anchor scrolling, but route changes should not scroll
 // slowly behind the transition overlay.
 const root = document.documentElement
 const previous = root.style.scrollBehavior
 root.style.scrollBehavior = 'auto'
 window.scrollTo(0, 0)
 root.style.scrollBehavior = previous
}

export default function PageTransition({
 children,
 introReady,
}: {
 children: (displayedLocation: Location) => React.ReactNode
 introReady: boolean
}) {
 const location = useLocation()
 const [displayed, setDisplayed] = useState(location)
 const [phase, setPhase] = useState<'idle' | 'cover' | 'reveal'>('idle')
 const currentPath = useRef(location.pathname)

 useEffect(() => {
  if (location.pathname === currentPath.current) {
   // Search/hash-only changes need no transition. If someone navigates back
   // during a cover, stop it instead of leaving an opaque curtain on screen.
   setDisplayed(location)
   setPhase('idle')
   return
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
   currentPath.current = location.pathname
   setDisplayed(location)
   setPhase('idle')
   resetScroll()
   return
  }

  // Keep the curtain closed while the first staff route bundle and its
  // directory data load. Otherwise the temporary fallback appears between
  // the old page and the real portrait cards.
  let swapped = false
  let ready = location.pathname !== '/staff'
  let revealed = false
  let fallback: number | undefined
  let finish: number | undefined
  const reveal = () => {
   if (!swapped || !ready || revealed) return
   revealed = true
   setPhase('reveal')
   finish = window.setTimeout(() => setPhase('idle'), REVEAL_MS + 40)
  }
  const onStaffReady = () => {
   ready = true
   if (fallback !== undefined) window.clearTimeout(fallback)
   reveal()
  }
  if (!ready) window.addEventListener(STAFF_PAGE_READY_EVENT, onStaffReady)

  setPhase('cover')
  const swap = window.setTimeout(() => {
   currentPath.current = location.pathname
   setDisplayed(location)
   resetScroll()
   swapped = true
   if (!ready) fallback = window.setTimeout(onStaffReady, STAFF_READY_TIMEOUT_MS)
   reveal()
  }, COVER_MS)

  return () => {
   window.clearTimeout(swap)
   if (fallback !== undefined) window.clearTimeout(fallback)
   if (finish !== undefined) window.clearTimeout(finish)
   window.removeEventListener(STAFF_PAGE_READY_EVENT, onStaffReady)
  }
 }, [location.pathname, location.search, location.hash])

 useEffect(() => {
  if (phase === 'idle') return
  const site = document.querySelector<HTMLElement>('.site')
  const previousOverflow = document.body.style.overflow
  const previousAriaHidden = site?.getAttribute('aria-hidden')
  const alreadyInert = site?.hasAttribute('inert') ?? false
  document.body.style.overflow = 'hidden'
  site?.setAttribute('inert', '')
  site?.setAttribute('aria-hidden', 'true')

  return () => {
   document.body.style.overflow = previousOverflow
   if (!alreadyInert) site?.removeAttribute('inert')
   if (site && previousAriaHidden === null) site.removeAttribute('aria-hidden')
   else if (site && typeof previousAriaHidden === 'string') site.setAttribute('aria-hidden', previousAriaHidden)
  }
 }, [phase !== 'idle'])

 return <>
  <SceneBackdrop introReady={introReady} />
  <div key={`${displayed.pathname}-${introReady}`} className={'route-stage' + (introReady ? '' : ' intro-waiting') + (phase === 'cover' ? ' is-covering' : '')}>
   {children(displayed)}
  </div>
  <div
   aria-hidden="true"
   className={'page-transition-curtain' + (phase === 'cover' ? ' is-covering' : phase === 'reveal' ? ' is-revealing' : '')}
  />
 </>
}
