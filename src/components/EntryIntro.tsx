import { useEffect, useState } from 'react'
import { asset } from '../lib/paths'
import './entry-intro.css'

type Phase = 'enter' | 'clear' | 'reveal' | 'done'
const INTRO_KEY = 'kogakure-intro-v3'
// Let the emblem and motto linger before the page is uncovered.
const HOLD_MS = 2250
const CLEAR_MS = 200
const REVEAL_MS = 560

function shouldPlay(): boolean {
 if (typeof window === 'undefined') return false
 if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
 if (window.location.pathname.replace(/\/+$/, '').endsWith('/admin')) return false
 // For visual QA; normal visitors see the intro once per browser tab session.
 if (new URLSearchParams(window.location.search).get('intro') === '1') return true
 try { return window.sessionStorage.getItem(INTRO_KEY) !== 'seen' }
 catch { return true }
}

export default function EntryIntro() {
 const [phase, setPhase] = useState<Phase>(() => shouldPlay() ? 'enter' : 'done')

 useEffect(() => {
  if (phase === 'done') return
  const site = document.querySelector<HTMLElement>('.site')
  const previousOverflow = document.body.style.overflow
  const previousAriaHidden = site?.getAttribute('aria-hidden')
  const wasInert = site?.hasAttribute('inert') ?? false

  document.body.style.overflow = 'hidden'
  site?.setAttribute('inert', '')
  site?.setAttribute('aria-hidden', 'true')

  return () => {
   document.body.style.overflow = previousOverflow
   if (!wasInert) site?.removeAttribute('inert')
   if (site && previousAriaHidden === null) site.removeAttribute('aria-hidden')
   else if (site && typeof previousAriaHidden === 'string') site.setAttribute('aria-hidden', previousAriaHidden)
  }
 }, [phase === 'done'])

 useEffect(() => {
  if (phase !== 'enter') return
  try { window.sessionStorage.setItem(INTRO_KEY, 'seen') } catch { /* private browsing may block storage */ }
  const timer = window.setTimeout(() => setPhase('clear'), HOLD_MS)
  return () => window.clearTimeout(timer)
 }, [phase])

 useEffect(() => {
  if (phase !== 'clear') return
  // Fade out the artwork while the solid background still covers the page.
  const timer = window.setTimeout(() => setPhase('reveal'), CLEAR_MS)
  return () => window.clearTimeout(timer)
 }, [phase])

 useEffect(() => {
  if (phase !== 'reveal') return
  const timer = window.setTimeout(() => setPhase('done'), REVEAL_MS + 60)
  return () => window.clearTimeout(timer)
 }, [phase])

 if (phase === 'done') return null

 return <div className={'entry-intro' + (phase === 'clear' ? ' is-clearing' : phase === 'reveal' ? ' is-revealing' : '')} role="status" aria-label="正在進入狐隱" aria-live="off">
  <div className="intro-brand" aria-hidden="true">
   <div className="intro-seal">
    <img src={asset('images/brand/logo-intro.webp')} alt="" width="300" height="300" fetchPriority="high" decoding="async" />
   </div>
   <span className="intro-wordmark">KOGAKURE</span>
   <span className="intro-divider" />
   <span className="intro-motto">循狐而入，借湯忘憂。</span>
  </div>
 </div>
}
