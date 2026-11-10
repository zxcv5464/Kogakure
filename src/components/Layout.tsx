import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Home, UsersRound, CalendarDays, UtensilsCrossed, Grid2X2, X, AtSign, ArrowUpRight, Compass, Sparkles, CalendarCheck2 } from 'lucide-react'
import { asset } from '../lib/paths'
import { prefetchStaffPage } from '../lib/prefetch'

const links = [
 {to:'/',label:'首頁'},
 {to:'/about',label:'館內介紹'},
 {to:'/services',label:'服務內容'},
 {to:'/staff',label:'狐姬名冊'},
 {to:'/shifts',label:'值班排班'},
 {to:'/menu',label:'點菜'},
 {to:'/booking',label:'預約'},
]

const mobileMain = [
 {to:'/',label:'首頁',icon:Home},
 {to:'/staff',label:'狐姬',icon:UsersRound},
 {to:'/shifts',label:'值班',icon:CalendarDays},
 {to:'/menu',label:'點菜',icon:UtensilsCrossed},
]

const mobileExtra = [
 {to:'/about',label:'館內介紹',icon:Compass},
 {to:'/services',label:'服務內容',icon:Sparkles},
 {to:'/booking',label:'預約',icon:CalendarCheck2},
]

const pageTitles: Record<string, string> = {
 '/': '首頁',
 '/about': '館內介紹',
 '/services': '服務內容',
 '/staff': '狐姬名冊',
 '/shifts': '值班排班',
 '/menu': '點菜',
 '/booking': '預約',
 '/admin': '後台管理',
}

export default function Layout({children}:{children:React.ReactNode}){
 const [moreOpen,setMoreOpen]=useState(false)
 const location=useLocation()
 const firstExtra=useRef<HTMLAnchorElement>(null)
 const moreButton=useRef<HTMLButtonElement>(null)
 const desktopNav=useRef<HTMLElement>(null)
 const [indicator,setIndicator]=useState({left:0,width:0,ready:false})
 const openedByKeyboard=useRef(false)
 const extraActive=mobileExtra.some(link=>location.pathname===link.to)

 useEffect(()=>{setMoreOpen(false)},[location.pathname])
 useEffect(()=>{
  document.title = '狐隱 KOGAKURE｜' + (pageTitles[location.pathname] ?? '狐隱')
 },[location.pathname])

 useEffect(()=>{
  const nav=desktopNav.current
  if(!nav)return
  const update=()=>{
   const active=nav.querySelector<HTMLElement>('a.active')
   if(active)setIndicator({left:active.offsetLeft+active.offsetWidth*.2,width:active.offsetWidth*.6,ready:true})
  }
  update()
  const observer=new ResizeObserver(update)
  observer.observe(nav)
  return()=>observer.disconnect()
 },[location.pathname])

 useEffect(()=>{
  if(!moreOpen)return
  const previous=document.body.style.overflow
  document.body.style.overflow='hidden'
  if(openedByKeyboard.current)firstExtra.current?.focus()
  function handleEscape(event:KeyboardEvent){
   if(event.key==='Escape'){
    setMoreOpen(false)
    moreButton.current?.focus()
   }
  }
  document.addEventListener('keydown',handleEscape)
  return()=>{
   document.removeEventListener('keydown',handleEscape)
   document.body.style.overflow=previous
  }
 },[moreOpen])

 return <div className="site">
  <header className="site-header">
   <div className="header-inner">
    <Link to="/" className="brand" onClick={()=>setMoreOpen(false)} aria-label="狐隱首頁">
     <img src={asset('images/brand/logo-header.webp')} alt="" width="44" height="44"/>
     <span><strong>狐隱</strong><small>KOGAKURE</small></span>
    </Link>
    <nav ref={desktopNav} className="desktop-nav" aria-label="主要導覽">{links.map(({to,label})=><NavLink key={to} to={to} end={to==='/'} onMouseEnter={to==='/staff'?prefetchStaffPage:undefined} onFocus={to==='/staff'?prefetchStaffPage:undefined} onTouchStart={to==='/staff'?prefetchStaffPage:undefined} className={({isActive})=>isActive?'active':''}>{label}</NavLink>)}<span className={'nav-slider'+(indicator.ready?' is-ready':'')} style={{left:indicator.left,width:indicator.width}} aria-hidden="true"/></nav>
    <a className="social-header" target="_blank" rel="noopener noreferrer" href="https://www.threads.com/@kogakure_ffxiv" aria-label="狐隱 Threads"><AtSign size={19}/></a>
   </div>
  </header>
  <main>{children}</main>
  <footer className="site-footer">
   <div className="footer-inner">
    <div><div className="footer-brand">狐隱 <span>KOGAKURE</span></div><p>世有百鬼，夜有萬境。循狐而入，借湯忘憂。</p></div>
    <div className="footer-side"><span>FFXIV · 利維坦 · 白銀鄉 6-7</span><a href="https://www.threads.com/@kogakure_ffxiv" target="_blank" rel="noopener noreferrer">官方 Threads <ArrowUpRight size={15}/></a></div>
   </div>
   <div className="copyright">本網站為 Final Fantasy XIV 玩家 RP 店鋪非官方網站。</div>
  </footer>

  {moreOpen&&<>
   <div className="mobile-more-backdrop" onClick={()=>setMoreOpen(false)} aria-hidden="true"/>
   <nav id="mobile-more-menu" className="mobile-more-panel" aria-label="其他頁面">
    <div className="mobile-more-heading"><strong>更多頁面</strong><button type="button" aria-label="關閉更多選單" onClick={()=>{setMoreOpen(false);moreButton.current?.focus()}}><X size={21}/></button></div>
    {mobileExtra.map(({to,label,icon:Icon},index)=><NavLink key={to} to={to} ref={index===0?firstExtra:undefined} className={({isActive})=>'mobile-extra-link'+(isActive?' active':'')} onClick={()=>setMoreOpen(false)}><Icon size={21} strokeWidth={1.8}/><span>{label}</span><ArrowUpRight size={16}/></NavLink>)}
    <a className="mobile-extra-link mobile-social-link" href="https://www.threads.com/@kogakure_ffxiv" target="_blank" rel="noopener noreferrer" onClick={()=>setMoreOpen(false)}><AtSign size={21} strokeWidth={1.8}/><span>官方 Threads</span><ArrowUpRight size={16}/></a>
   </nav>
  </>}
  <nav className="mobile-bottom-nav" aria-label="手機主要導覽">
   {mobileMain.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end={to==='/'} onMouseEnter={to==='/staff'?prefetchStaffPage:undefined} onFocus={to==='/staff'?prefetchStaffPage:undefined} onTouchStart={to==='/staff'?prefetchStaffPage:undefined} className={({isActive})=>'mobile-bottom-item'+(isActive?' active':'')} onClick={()=>setMoreOpen(false)}><Icon size={22} strokeWidth={1.8}/><span>{label}</span></NavLink>)}
   <button ref={moreButton} type="button" className={'mobile-bottom-item'+(extraActive?' active':moreOpen?' expanded':'')} aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={event=>{openedByKeyboard.current=event.detail===0;setMoreOpen(value=>!value)}}>
    <Grid2X2 size={22} strokeWidth={1.8}/><span>更多</span>
   </button>
  </nav>
 </div>
}
