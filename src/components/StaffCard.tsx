import { useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Staff } from '../types'
import './staff-card.css'
type Props={staff:Staff;onOpen:(staff:Staff)=>void;index:number}
export default function StaffCard({staff,onOpen,index}:Props){
 const ref=useRef<HTMLElement>(null)
 const [style,setStyle]=useState<CSSProperties>({})
 const accent=staff.themeColor||'#c4ac83'
 function move(e:React.MouseEvent<HTMLElement>){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches)return
  const rect=ref.current?.getBoundingClientRect();if(!rect)return
  const x=(e.clientX-rect.left)/rect.width;const y=(e.clientY-rect.top)/rect.height
  setStyle({'--rx':String((.5-y)*4)+'deg','--ry':String((x-.5)*5)+'deg','--glow-x':String(x*100)+'%','--glow-y':String(y*100)+'%'} as CSSProperties)
 }
 function leave(){setStyle({'--rx':'0deg','--ry':'0deg'} as CSSProperties)}
 return <article className={'staff-entry effect-'+staff.effect+(staff.thumbnailUrl.includes('-crop.webp')?' has-manual-crop':'')} style={{'--accent':accent,'--delay':String(index*80)+'ms',...style} as CSSProperties}>
  <button ref={ref as React.RefObject<HTMLButtonElement>} type="button" className="omamori-card" onPointerMove={move} onPointerLeave={leave} onClick={()=>onOpen(staff)} aria-label={'查看 '+staff.name+' 的個人介紹'}>
   <span className="omamori-body">
    <span className="omamori-border" aria-hidden="true"/>
    <span className="omamori-art">
     <img src={staff.thumbnailUrl||staff.imageUrl} alt={staff.name+'的角色照片'} loading={index>1?'lazy':'eager'} decoding="async"/>
     <span className="photo-shadow"/>
    </span>
    <span className="effect-particles" aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i}/>)}</span>
    <span className="card-text">
     <span className="card-role">{staff.role||'狐隱接待者'}</span>
     <span className="card-name">{staff.name}</span>
     <span className="card-tagline">{staff.tagline||'願你在此得片刻安寧。'}</span>
     <span className="card-cta">查看名帖 <ChevronRight size={16}/></span>
    </span>
    <span className="card-shine" aria-hidden="true"/>
   </span>
  </button>
 </article>
}
