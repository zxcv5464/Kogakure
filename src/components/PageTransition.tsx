import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import SceneBackdrop from './SceneBackdrop'
import { STAFF_PAGE_READY_EVENT, MENU_PAGE_READY_EVENT } from '../lib/route-events'
import './page-transition.css'
import './route-motion.css'

// The route changes only once the background is opaque. This prevents a
// flash of the destination page before the fade-in begins.
const COVER_MS = 650
const REVEAL_MS = 760
const STAFF_READY_TIMEOUT_MS = 8000
const MENU_READY_TIMEOUT_MS = 8000

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

  // Keep the curtain closed while a lazy page bundle and its content load.
  // In particular, the tea menu should never reveal its lazy fallback and
  // immediately replace it with a Supabase loading screen or live items.
  const readyEvent = location.pathname === '/staff' ? STAFF_PAGE_READY_EVENT
   : location.pathname === '/menu' ? MENU_PAGE_READY_EVENT : null
  const readyTimeout = location.pathname === '/menu' ? MENU_READY_TIMEOUT_MS : STAFF_READY_TIMEOUT_MS
  let swapped = false
  let ready = readyEvent === null
  let revealed = false
  let fallback: number | undefined
  let finish: number | undefined
  const reveal = () => {
   if (!swapped || !ready || revealed) return
   revealed = true
   setPhase('reveal')
   finish = window.setTimeout(() => setPhase('idle'), REVEAL_MS + 40)
  }
  const onPageReady = () => {
   ready = true
   if (fallback !== undefined) window.clearTimeout(fallback)
   reveal()
  }
  if (readyEvent) window.addEventListener(readyEvent, onPageReady)

  setPhase('cover')
  const swap = window.setTimeout(() => {
   currentPath.current = location.pathname
   setDisplayed(location)
   resetScroll()
   swapped = true
   if (!ready) fallback = window.setTimeout(onPageReady, readyTimeout)
   reveal()
  }, COVER_MS)

  return () => {
   window.clearTimeout(swap)
   if (fallback !== undefined) window.clearTimeout(fallback)
   if (finish !== undefined) window.clearTimeout(finish)
   if (readyEvent) window.removeEventListener(readyEvent, onPageReady)
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
  <div key={displayed.pathname} className={'route-stage' + (introReady ? '' : ' intro-waiting') + (phase === 'cover' ? ' is-covering' : '')}>
   {children(displayed)}
  </div>
  <div
   aria-hidden="true"
   className={'page-transition-curtain' + (phase === 'cover' ? ' is-covering' : phase === 'reveal' ? ' is-revealing' : '')}
  />
 </>
}
