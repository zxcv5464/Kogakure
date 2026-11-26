import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CSSProperties, MouseEvent } from 'react'
import type { Staff } from '../types'
import MysticPhotoGallery from './MysticPhotoGallery'
import { prefetchStaffDetailPhoto } from '../lib/staff-detail-photo'
import './staff-card.css'
type Props={staff:Staff;onOpen:(staff:Staff)=>void;index:number}
export default function StaffCard({staff,onOpen,index}:Props){
 const ref=useRef<HTMLButtonElement>(null)
 const nameRef=useRef<HTMLSpanElement>(null)
 const textRef=useRef<HTMLSpanElement>(null)
 useLayoutEffect(()=>{
  const box=nameRef.current,text=textRef.current
  if(!box||!text)return
  let disposed=false
  const fit=()=>{
   if(disposed||!box.clientWidth)return
   const max=parseFloat(getComputedStyle(box).fontSize)
   const min=Math.min(12,max)
   text.style.whiteSpace='nowrap';text.style.fontSize=max+'px'
   if(text.offsetWidth<=box.clientWidth)return
   text.style.fontSize=min+'px'
   if(text.offsetWidth>box.clientWidth){text.style.whiteSpace='normal';return}
   let lo=min,hi=max
   for(let i=0;i<9;i++){
    const mid=(lo+hi)/2;text.style.fontSize=mid+'px'
    if(text.offsetWidth<=box.clientWidth)lo=mid;else hi=mid
   }
   text.style.fontSize=lo+'px'
  }
  fit()
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit)
  observer?.observe(box)
  window.addEventListener('resize',fit)
  void document.fonts?.ready.then(fit)
  document.fonts?.addEventListener('loadingdone',fit)
  return()=>{disposed=true;observer?.disconnect();window.removeEventListener('resize',fit);document.fonts?.removeEventListener('loadingdone',fit)}
 },[staff.name])
 const [style,setStyle]=useState<CSSProperties>({})
 const accent=staff.themeColor||'#c4ac83'
 function move(e:MouseEvent<HTMLButtonElement>){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches)return
  const rect=ref.current?.getBoundingClientRect();if(!rect)return
  const x=(e.clientX-rect.left)/rect.width;const y=(e.clientY-rect.top)/rect.height
  setStyle({'--rx':String((.5-y)*4)+'deg','--ry':String((x-.5)*5)+'deg','--glow-x':String(x*100)+'%','--glow-y':String(y*100)+'%'} as CSSProperties)
 }
 function leave(){setStyle({'--rx':'0deg','--ry':'0deg'} as CSSProperties)}
 const photos=useMemo(()=>staff.photos?.length?staff.photos.map(photo=>({...photo,preserveCrop:Boolean(photo.thumbnailPath?.endsWith('-crop.webp'))})):
  (staff.imageUrl||staff.thumbnailUrl?[{id:'legacy-'+staff.id,imageUrl:staff.imageUrl||staff.thumbnailUrl,
   thumbnailUrl:staff.thumbnailUrl||staff.imageUrl,imagePath:null,thumbnailPath:null,
   preserveCrop:Boolean((staff.thumbnailUrl||staff.imageUrl).includes('-crop.webp'))}]:[]),
  [staff.photos,staff.id,staff.imageUrl,staff.thumbnailUrl])
 const firstFull=photos[0]?.imageUrl||''
 function warmDetail(){prefetchStaffDetailPhoto(firstFull)}
 useEffect(()=>{
  // Only the first card warms its full portrait proactively; other cards
  // load on actual pointer/focus intent, avoiding a gallery-wide download.
  if(index!==0||!firstFull)return
  const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection
  if(connection?.saveData||connection?.effectiveType?.includes('2g'))return
  const timer=window.setTimeout(()=>prefetchStaffDetailPhoto(firstFull),700)
  return()=>window.clearTimeout(timer)
 },[firstFull,index])
 return <article className={'staff-entry effect-'+staff.effect} style={{'--accent':accent,'--delay':String(index*80)+'ms',...style} as CSSProperties}>
  <button ref={ref} type="button" className="omamori-card"
   onPointerMove={move} onPointerLeave={leave} onPointerEnter={warmDetail} onPointerDown={warmDetail} onFocus={warmDetail} onClick={()=>{warmDetail();onOpen(staff)}}
   aria-label={'查看 '+staff.name+' 的個人介紹'}>
   <span className="omamori-body">
    <span className="omamori-border" aria-hidden="true"/>
    <span className="omamori-art">
     <MysticPhotoGallery photos={photos} mode={staff.photoDisplayMode||'single'} alt={staff.name+'的角色照片'} className="staff-card-gallery" showCounter={false} showPagination={false} loading={index>1?'lazy':'eager'}/>
     <span className="photo-shadow"/>
    </span>
    <span className="effect-particles" aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i}/>)}</span>
    <span className="card-text">
     <span className="card-role">{staff.role||'狐隱接待者'}</span>
     <span className="card-name" ref={nameRef}><span ref={textRef} className="card-name-text">{staff.name}</span></span>
     <span className="card-tagline">{staff.tagline||'願你在此得片刻安寧。'}</span>
     <span className="card-cta">查看名帖 <ChevronRight size={16}/></span>
    </span>
    <span className="card-shine" aria-hidden="true"/>
   </span>
  </button>
 </article>
}
