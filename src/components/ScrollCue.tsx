import {useEffect,useRef,useState} from 'react'
import {ChevronDown,ChevronRight} from 'lucide-react'
import './scroll-cue.css'

type Props={target?:string;direction?:'down'|'right'}

/** A quiet, keyboard-operable scroll hint.
 * With target: render directly AFTER the scroll region in the same parent.
 * Without target: render as the LAST child INSIDE the scroll region; sticky
 * positioning keeps the arrow visible until the visitor reaches the end.
 * The original scroll area remains touch-, wheel- and keyboard-scrollable. */
export default function ScrollCue({target,direction='down'}:Props){
 const button=useRef<HTMLButtonElement>(null)
 const [hasMore,setHasMore]=useState(false)
 const getArea=()=>{
  const element=button.current
  return target
   ?element?.parentElement?.querySelector<HTMLElement>(target)
   :element?.parentElement
 }
 useEffect(()=>{
  const area=getArea()
  if(!area)return
  let frame=0
  const check=()=>{
   const remaining=direction==='down'
    ?area.scrollHeight-area.clientHeight-area.scrollTop
    :area.scrollWidth-area.clientWidth-area.scrollLeft
   const addedSpace=!target&&button.current?.offsetHeight||0
   setHasMore(remaining-addedSpace>5)
  }
  const schedule=()=>{
   if(frame)window.cancelAnimationFrame(frame)
   frame=window.requestAnimationFrame(()=>{frame=0;check()})
  }
  const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null
  resize?.observe(area)
  const changes=typeof MutationObserver!=='undefined'?new MutationObserver(schedule):null
  changes?.observe(area,{subtree:true,childList:true,characterData:true})
  area.addEventListener('scroll',schedule,{passive:true})
  window.addEventListener('resize',schedule)
  schedule()
  return()=>{
   if(frame)window.cancelAnimationFrame(frame)
   resize?.disconnect();changes?.disconnect()
   area.removeEventListener('scroll',schedule)
   window.removeEventListener('resize',schedule)
  }
 },[target,direction])
 const label=direction==='right'?'向右滑動查看更多內容':'向下滑動查看更多內容'
 function advance(){
  const area=getArea()
  if(!area)return
  const distance=direction==='down'
   ?Math.max(70,Math.round(area.clientHeight*.73))
   :Math.max(70,Math.round(area.clientWidth*.73))
  const behavior:ScrollBehavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'
  area.scrollBy(direction==='down'?{top:distance,behavior}:{left:distance,behavior})
 }
 return <button ref={button} type="button" onClick={advance}
  className={'shared-scroll-cue'+(target?' is-below':' is-sticky')+(hasMore?' is-active':'')}
  aria-label={label} title={label} tabIndex={hasMore?0:-1}
  aria-hidden={!hasMore} disabled={!hasMore}>
  {direction==='down'
   ?<ChevronDown size={20} strokeWidth={1.65} aria-hidden="true"/>
   :<ChevronRight size={20} strokeWidth={1.65} aria-hidden="true"/>}
 </button>
}
