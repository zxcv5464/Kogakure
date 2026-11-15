import {useEffect,useRef,useState} from 'react'
import {ArrowRight} from 'lucide-react'
import {asset} from '../lib/paths'
import './entry-intro.css'

type Phase='preparing'|'enter'|'ready'|'clear'|'reveal'|'done'
// The logo, wordmark and motto arrive first; let the button finish fading in.
const HOLD_MS=1650
const CLEAR_MS=180
const REVEAL_MS=480
// Cold-cache visitors should see the same sequence as returning visitors.
const LOGO_LOAD_TIMEOUT_MS=3200

export function shouldPlay():boolean{
 if(typeof window==='undefined')return false
 // A fresh document needs an actual music-start gesture each time. Internal
 // SPA navigation never re-renders the logo entrance, only a new visit does.
 return !/^\/admin(?:\/|$)/.test(window.location.pathname.replace(/\/+$/,''))
}

export default function EntryIntro({onEnter,onReveal}:{onEnter?:()=>void;onReveal?:()=>void}){
 const [phase,setPhase]=useState<Phase>(()=>{
  if(!shouldPlay())return 'done'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches?'ready':'preparing'
 })
 const logoImage=useRef<HTMLImageElement>(null)

 // On a cold first visit, CSS animations used to run before logo-intro.webp
 // finished downloading/decoding. Start the whole sequence only after the
 // logo can paint. Two frames commit the hidden initial state first, so CSS
 // animations actually run instead of jumping to their finished appearance.
 useEffect(()=>{
  if(phase!=='preparing')return
  let active=true
  let released=false
  let frameOne=0,frameTwo=0
  const image=logoImage.current
  const release=()=>{
   if(!active||released)return
   released=true
   frameOne=window.requestAnimationFrame(()=>{
    frameTwo=window.requestAnimationFrame(()=>{
     if(active)setPhase('enter')
    })
   })
  }
  const fallback=window.setTimeout(release,LOGO_LOAD_TIMEOUT_MS)
  const settle=()=>{window.clearTimeout(fallback);release()}
  if(image?.decode)void image.decode().then(settle,settle)
  else if(!image||image.complete)settle()
  else{image.addEventListener('load',settle);image.addEventListener('error',settle)}
  return()=>{
   active=false
   window.clearTimeout(fallback)
   window.cancelAnimationFrame(frameOne)
   window.cancelAnimationFrame(frameTwo)
   image?.removeEventListener('load',settle)
   image?.removeEventListener('error',settle)
  }
 },[phase])

 useEffect(()=>{
  if(phase==='done')return
  const site=document.querySelector<HTMLElement>('.site')
  const previousOverflow=document.body.style.overflow
  const previousAriaHidden=site?.getAttribute('aria-hidden')
  const wasInert=site?.hasAttribute('inert')??false
  document.body.style.overflow='hidden'
  site?.setAttribute('inert','')
  site?.setAttribute('aria-hidden','true')
  return()=>{
   document.body.style.overflow=previousOverflow
   if(!wasInert)site?.removeAttribute('inert')
   if(site&&previousAriaHidden===null)site.removeAttribute('aria-hidden')
   else if(site&&typeof previousAriaHidden==='string')site.setAttribute('aria-hidden',previousAriaHidden)
  }
 },[phase==='done'])

 useEffect(()=>{
  if(phase!=='enter')return
  const timer=window.setTimeout(()=>setPhase('ready'),HOLD_MS)
  return()=>window.clearTimeout(timer)
 },[phase])

 useEffect(()=>{
  if(phase!=='clear')return
  const timer=window.setTimeout(()=>{setPhase('reveal');onReveal?.()},CLEAR_MS)
  return()=>window.clearTimeout(timer)
 },[phase])

 useEffect(()=>{
  if(phase!=='reveal')return
  const timer=window.setTimeout(()=>setPhase('done'),REVEAL_MS+60)
  return()=>window.clearTimeout(timer)
 },[phase])

 function enterInn(){
  if(phase!=='ready')return
  // Start sound directly inside this real click/tap activation, before any
  // fade timer or route transition. There is no second BGM gateway.
  onEnter?.()
  setPhase('clear')
 }

 if(phase==='done')return null
 return <div className={'entry-intro'+(phase==='preparing'?' is-preparing':phase==='clear'?' is-clearing':phase==='reveal'?' is-revealing':'')}
  role="dialog" aria-modal="true" aria-labelledby="intro-wordmark" aria-describedby="intro-motto">
  <div className="intro-brand">
   <div className="intro-seal" aria-hidden="true">
    <img ref={logoImage} src={asset('images/brand/logo-intro.webp')} alt="" width="300" height="300" fetchPriority="high" decoding="async"/>
   </div>
   <span id="intro-wordmark" className="intro-wordmark">KOGAKURE</span>
   <span className="intro-divider" aria-hidden="true"/>
   <span id="intro-motto" className="intro-motto">循狐而入，借湯忘憂。</span>
   <button type="button" className="intro-entry-action"
    disabled={phase!=='ready'} onClick={enterInn}>進入狐隱<ArrowRight size={17} strokeWidth={1.7}/></button>
   <small className="intro-music-note">入館後可於頁首隨時關閉或重新播放 BGM</small>
  </div>
 </div>
}
