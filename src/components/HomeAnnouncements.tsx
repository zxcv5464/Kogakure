import {useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {ChevronDown,ChevronRight,Pin,X} from 'lucide-react'
import {configured} from '../lib/config'
import {fetchPublicAnnouncements} from '../lib/announcements'
import type {Announcement,AnnouncementCategory} from '../lib/announcements'
import './home-announcements.css'

const categories:Record<AnnouncementCategory,string>={
 notice:'館內公告',news:'最新消息',
}
const publishedDate=(date:string|null)=>
 date?new Date(date).toLocaleDateString('zh-TW',{
  timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',
 }):''

/** Independent, non-blocking public feed. Backoffice publishing needs no
 * GitHub Pages redeploy; active pages revalidate and refresh on focus. */
export default function HomeAnnouncements(){
 const [rows,setRows]=useState<Announcement[]>([])
 const [category,setCategory]=useState<AnnouncementCategory>('notice')
 const [active,setActive]=useState<Announcement|null>(null)
 const [loading,setLoading]=useState(configured)
 const [error,setError]=useState(false)
 const listRef=useRef<HTMLDivElement>(null)
 const dialogRef=useRef<HTMLElement>(null)
 const [canScrollDown,setCanScrollDown]=useState(false)
 const [canScrollDialog,setCanScrollDialog]=useState(false)
 useEffect(()=>{
  if(!configured)return
  let alive=true
  let inFlight=false
  const update=async()=>{
   if(inFlight)return
   inFlight=true
   try{
    const results=await fetchPublicAnnouncements()
    if(alive){setRows(results);setError(false)}
   }catch{
    if(alive)setError(true)
   }finally{
    inFlight=false
    if(alive)setLoading(false)
   }
  }
  void update()
  const onFocus=()=>{if(document.visibilityState==='visible')void update()}
  const timer=window.setInterval(onFocus,45000)
  window.addEventListener('focus',onFocus)
  document.addEventListener('visibilitychange',onFocus)
  return()=>{
   alive=false
   window.clearInterval(timer)
   window.removeEventListener('focus',onFocus)
   document.removeEventListener('visibilitychange',onFocus)
  }
 },[])
 useEffect(()=>{
  if(!active)return
  const dismiss=(event:KeyboardEvent)=>{if(event.key==='Escape')setActive(null)}
  window.addEventListener('keydown',dismiss)
  return()=>window.removeEventListener('keydown',dismiss)
 },[active])
 // The announcement detail is scrollable without a visible scrollbar.
 // Track real overflow so its chevron disappears once fully read.
 useEffect(()=>{
  if(!active){setCanScrollDialog(false);return}
  const panel=dialogRef.current
  if(!panel)return
  panel.scrollTop=0
  const update=()=>setCanScrollDialog(panel.scrollHeight-panel.clientHeight-panel.scrollTop>2)
  update()
  const frame=window.requestAnimationFrame(update)
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update)
  observer?.observe(panel)
  window.addEventListener('resize',update)
  return()=>{
   window.cancelAnimationFrame(frame)
   observer?.disconnect()
   window.removeEventListener('resize',update)
  }
 },[active?.id,active?.content])
 const filtered=useMemo(()=>rows.filter(row=>row.category===category),[rows,category])
 // Show the arrow only when there are actually more entries below the
 // viewport, including after live announcements refresh or resize.
 useEffect(()=>{
  const list=listRef.current
  if(!list)return
  list.scrollTop=0
  const update=()=>setCanScrollDown(list.scrollHeight-list.clientHeight-list.scrollTop>2)
  update()
  const frame=window.requestAnimationFrame(update)
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update)
  observer?.observe(list)
  return()=>{window.cancelAnimationFrame(frame);observer?.disconnect()}
 },[category,filtered,loading,error])
 function scrollToMore(){
  const list=listRef.current
  if(!list)return
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  list.scrollBy({top:Math.max(40,Math.round(list.clientHeight*.85)),behavior:reduceMotion?'auto':'smooth'})
 }
 function scrollDialogToMore(){
  const panel=dialogRef.current
  if(!panel)return
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  panel.scrollBy({top:Math.max(64,Math.round(panel.clientHeight*.76)),behavior:reduceMotion?'auto':'smooth'})
 }
 return <>
  <section className="home-news" aria-label="館內公告及最新消息">
   <header className="home-news-heading">
    <span>狐隱手帖</span><small>KOGAKURE · NOTICE BOARD</small>
   </header>
   <div className="home-news-tabs" role="tablist" aria-label="選擇館內消息類別">
    {(['notice','news'] as const).map(value=>
     <button key={value} type="button" role="tab"
      aria-selected={category===value}
      className={category===value?'is-selected':''}
      onClick={()=>{setCanScrollDown(false);setCategory(value)}}>
      {categories[value]}
     </button>
    )}
   </div>
   <div className="home-news-list" ref={listRef} role="tabpanel" aria-label={categories[category]}
    aria-live="polite" tabIndex={filtered.length?0:-1}
    onScroll={event=>setCanScrollDown(event.currentTarget.scrollHeight-event.currentTarget.clientHeight-event.currentTarget.scrollTop>2)}>
    {loading&&<p className="home-news-empty">正在翻閱館內消息…</p>}
    {!loading&&error&&<p className="home-news-empty">館內消息暫時無法讀取，請稍後再試。</p>}
    {!loading&&!error&&filtered.length===0&&
     <p className="home-news-empty">{category==='notice'?'目前沒有館內公告':'目前沒有最新消息'}</p>}
    {!loading&&!error&&filtered.map(item=>
     <button key={item.id} type="button" className="home-news-entry"
      onClick={()=>setActive(item)} aria-label={'閱讀'+categories[item.category]+'：'+item.title}>
      <time>{publishedDate(item.publishedAt)}</time>
      <strong>{item.title}</strong>
      {item.pinned&&<Pin size={13} aria-label="置頂公告"/>}
      <ChevronRight className="home-news-entry-arrow" size={16} aria-hidden="true"/>
     </button>
    )}
   </div>
   {canScrollDown&&!loading&&!error&&
    <button className="home-news-scroll-cue" type="button"
     onClick={scrollToMore} aria-label="向下捲動查看更多消息"
     title="向下捲動查看更多消息">
     <ChevronDown size={18} strokeWidth={1.65} aria-hidden="true"/>
    </button>}
  </section>
  {active&&typeof document!=='undefined'&&createPortal(<div className="home-news-overlay" role="presentation"
   onMouseDown={event=>{if(event.target===event.currentTarget)setActive(null)}}>
   <div className={'home-news-dialog-shell'+(canScrollDialog?' has-more':'')}
    role="dialog" aria-modal="true" aria-label={active.title}>
    <article className="home-news-dialog" ref={dialogRef} tabIndex={0}
     aria-label="公告內文，可上下捲動"
     onScroll={event=>setCanScrollDialog(event.currentTarget.scrollHeight-event.currentTarget.clientHeight-event.currentTarget.scrollTop>2)}>
     <p className="home-news-dialog-category">{categories[active.category]} · {publishedDate(active.publishedAt)}</p>
     <h2>{active.title}</h2>
     <div className="home-news-dialog-body">{active.content}</div>
     <p className="home-news-dialog-end">狐隱 · KOGAKURE</p>
    </article>
    <button className="home-news-close" type="button" aria-label="關閉公告"
     onClick={()=>setActive(null)}><X size={20}/></button>
    {canScrollDialog&&<button className="home-news-dialog-scroll-cue" type="button"
     aria-label="向下捲動閱讀公告其餘內容" title="向下捲動查看更多內容"
     onClick={scrollDialogToMore}>
     <ChevronDown size={21} strokeWidth={1.65} aria-hidden="true"/>
    </button>}
   </div>
  </div>,document.body)}
 </>
}
