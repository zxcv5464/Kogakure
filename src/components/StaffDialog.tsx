import { useEffect, useRef, useState } from 'react'
import { X, ArrowUpRight, ArrowDown, Flower2, MoonStar } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Staff } from '../types'
import { safeExternalUrl } from '../lib/url'
import './staff-dialog-scroll.css'
export default function StaffDialog({staff,onClose}:{staff:Staff;onClose:()=>void}){
 const closeRef=useRef<HTMLButtonElement>(null)
 const dialogRef=useRef<HTMLElement>(null)
 const contentRef=useRef<HTMLDivElement>(null)
 const [hasMore,setHasMore]=useState(false)
 const scrollingElement=()=>window.matchMedia('(max-width: 570px)').matches?dialogRef.current:contentRef.current
 useEffect(()=>{
  const check=()=>{
   const area=scrollingElement()
   setHasMore(Boolean(area&&area.scrollHeight-area.scrollTop-area.clientHeight>26))
  }
  const observer=new ResizeObserver(check)
  if(dialogRef.current)observer.observe(dialogRef.current)
  if(contentRef.current)observer.observe(contentRef.current)
  window.addEventListener('resize',check)
  const frame=requestAnimationFrame(check)
  return()=>{observer.disconnect();window.removeEventListener('resize',check);cancelAnimationFrame(frame)}
 },[staff])
 useEffect(()=>{
  closeRef.current?.focus()
  function escape(e:KeyboardEvent){if(e.key==='Escape')onClose()}
  document.addEventListener('keydown',escape)
  const old=document.body.style.overflow; document.body.style.overflow='hidden'
  return ()=>{document.removeEventListener('keydown',escape);document.body.style.overflow=old}
 },[onClose])
 return <div className="dialog-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="dialog-shell">
   <div className="dialog-mobile-header">
    <span className="dialog-mobile-label">狐姬名冊 <small>KOGAKURE</small></span>
    <button className="dialog-close" ref={closeRef} type="button" onClick={onClose} aria-label="關閉介紹"><X size={22}/></button>
   </div>
  <section ref={dialogRef} tabIndex={0} onScroll={()=>{const area=scrollingElement();setHasMore(Boolean(area&&area.scrollHeight-area.scrollTop-area.clientHeight>26))}} className="staff-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-name" style={{'--accent':staff.themeColor} as CSSProperties}>
   <div className="dialog-photo"><img src={staff.imageUrl||staff.thumbnailUrl} alt={staff.name+'的角色照片'}/><span/></div>
   <div ref={contentRef} tabIndex={0} role="region" aria-label="完整員工介紹，可捲動" className="dialog-content" onScroll={()=>{const area=scrollingElement();setHasMore(Boolean(area&&area.scrollHeight-area.scrollTop-area.clientHeight>26))}}>
    <div className="detail-stamp" aria-hidden="true">狐<br/>隱</div>
    <p className="detail-role">{staff.role||'接待者'}</p>
    <h2 id="detail-name">{staff.name}</h2>
    <div className="detail-divider"><span/></div>
    <blockquote>{staff.tagline||'循狐火而來，與狐隱之人相遇。'}</blockquote>
    <h3><MoonStar size={17}/> 關於我</h3>
    <p className="detail-bio">{staff.bio||'尚未填寫個人介紹。'}</p>
    {staff.services.length>0&&<><h3><Flower2 size={17}/> 服務專長</h3><div className="detail-tags">{staff.services.map(tag=><span key={tag}>{tag}</span>)}</div></>}
    {staff.socials.some(s=>safeExternalUrl(s.url))&&<>
      <h3>社群連結</h3>
      <div className="detail-socials">{staff.socials.map(s=>{const href=safeExternalUrl(s.url);return href?<a key={s.id} href={href} target="_blank" rel="noopener noreferrer">{s.label}<ArrowUpRight size={17}/></a>:null})}</div>
     </>}
   </div>
  </section>
   <div className={'dialog-scroll-footer' + (hasMore ? ' has-more' : ' is-complete')}>
    {hasMore ? <button className="dialog-scroll-hint" type="button" onClick={()=>{const area=scrollingElement();area?.scrollBy({top:Math.max(260,area.clientHeight*.58),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}}><span>繼續閱讀</span><ArrowDown size={16}/></button> : <span className="dialog-scroll-end" aria-hidden="true">✦</span>}
   </div>
  </div>
 </div>
}
