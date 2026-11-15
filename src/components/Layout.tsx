import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Home, UsersRound, CalendarDays, UtensilsCrossed, Grid2X2, X, AtSign, ArrowUpRight, Compass, Sparkles, CalendarCheck2 } from 'lucide-react'
import { asset } from '../lib/paths'
import { prefetchStaffPage, prefetchShiftsPage } from '../lib/prefetch'
import SiteBgm from './SiteBgm'

const DISCORD_INVITE='https://discord.gg/f34DSnUgGV'

/** Discord's monochrome mark inherits the same gold as the Threads entry. */
function DiscordMark({size=19}:{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.249.077.077 0 0 0-.078-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.321 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.029.079.079 0 0 0 .084-.028c.463-.63.875-1.295 1.226-1.994a.076.076 0 0 0-.042-.105 13.11 13.11 0 0 1-1.872-.893.078.078 0 0 1-.007-.129c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.011c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.01c.12.099.246.198.373.292a.077.077 0 0 1-.007.129 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.359.698.77 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.029.077.077 0 0 0 .031-.055c.504-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.029ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.955 2.419-2.157 2.419Zm7.975 0c-1.184 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.947 2.419-2.157 2.419Z"/></svg>
}

const links = [
 {to:'/',label:'首頁'},
 {to:'/about',label:'入館須知'},
 {to:'/services',label:'服務內容'},
 {to:'/staff',label:'狐姬名冊'},
 {to:'/shifts',label:'值班排班'},
 {to:'/menu',label:'茶宴'},
 {to:'/booking',label:'預約'},
]

const mobileMain = [
 {to:'/',label:'首頁',icon:Home},
 {to:'/staff',label:'狐姬',icon:UsersRound},
 {to:'/shifts',label:'值班',icon:CalendarDays},
 {to:'/menu',label:'茶宴',icon:UtensilsCrossed},
]

const mobileExtra = [
 {to:'/about',label:'入館須知',icon:Compass},
 {to:'/services',label:'服務內容',icon:Sparkles},
 {to:'/booking',label:'預約',icon:CalendarCheck2},
]

const pageTitles: Record<string, string> = {
 '/': '首頁',
 '/about': '入館須知',
 '/services': '服務內容',
 '/staff': '狐姬名冊',
 '/shifts': '值班排班',
 '/menu': '茶宴',
 '/booking': '預約',
 '/admin': '後台管理',
}

export default function Layout({children,onRegisterBgm}:{children:React.ReactNode;onRegisterBgm?:(start:()=>void)=>void}){
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
    <nav ref={desktopNav} className="desktop-nav" aria-label="主要導覽">{links.map(({to,label})=><NavLink key={to} to={to} end={to==='/'} onMouseEnter={to==='/staff'?prefetchStaffPage:to==='/shifts'?prefetchShiftsPage:undefined} onFocus={to==='/staff'?prefetchStaffPage:to==='/shifts'?prefetchShiftsPage:undefined} onTouchStart={to==='/staff'?prefetchStaffPage:to==='/shifts'?prefetchShiftsPage:undefined} onPointerDown={to==='/shifts'?prefetchShiftsPage:undefined} className={({isActive})=>isActive?'active':''}>{label}</NavLink>)}<span className={'nav-slider'+(indicator.ready?' is-ready':'')} style={{left:indicator.left,width:indicator.width}} aria-hidden="true"/></nav>
    <div className="header-socials" aria-label="狐隱社群入口">
     <a className="social-header" target="_blank" rel="noopener noreferrer" href="https://www.threads.com/@kogakure_ffxiv" aria-label="狐隱 Threads" title="官方 Threads"><AtSign size={19}/></a>
     <a className="social-header" target="_blank" rel="noopener noreferrer" href={DISCORD_INVITE} aria-label="狐隱 Discord" title="加入狐隱 Discord"><DiscordMark/></a>
    </div>
    <SiteBgm onRegisterStart={onRegisterBgm}/>
   </div>
  </header>
  <main>{children}</main>
  <footer className="site-footer">
   <div className="footer-inner">
    <div><div className="footer-brand">狐隱 <span>KOGAKURE</span></div><p>世有百鬼，夜有萬境。循狐而入，借湯忘憂。</p></div>
    <div className="footer-side"><span>FFXIV · 利維坦 · 白銀鄉 6-7</span><a href="https://www.threads.com/@kogakure_ffxiv" target="_blank" rel="noopener noreferrer">官方 Threads <ArrowUpRight size={15}/></a><a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">官方 Discord <ArrowUpRight size={15}/></a></div>
   </div>
   <div className="copyright">本網站為 Final Fantasy XIV 玩家 RP 店鋪非官方網站。<span className="site-bgm-credit">背景音樂：<a href="https://bgmer.net/music/456" target="_blank" rel="noopener noreferrer">みやびごころ · BGMer</a></span></div>
  </footer>

  {moreOpen&&<>
   <div className="mobile-more-backdrop" onClick={()=>setMoreOpen(false)} aria-hidden="true"/>
   <nav id="mobile-more-menu" className="mobile-more-panel" aria-label="其他頁面">
    <div className="mobile-more-heading"><strong>更多頁面</strong><button type="button" aria-label="關閉更多選單" onClick={()=>{setMoreOpen(false);moreButton.current?.focus()}}><X size={21}/></button></div>
    {mobileExtra.map(({to,label,icon:Icon},index)=><NavLink key={to} to={to} ref={index===0?firstExtra:undefined} className={({isActive})=>'mobile-extra-link'+(isActive?' active':'')} onClick={()=>setMoreOpen(false)}><Icon size={21} strokeWidth={1.8}/><span>{label}</span><ArrowUpRight size={16}/></NavLink>)}
    <a className="mobile-extra-link mobile-social-link" href="https://www.threads.com/@kogakure_ffxiv" target="_blank" rel="noopener noreferrer" onClick={()=>setMoreOpen(false)}><AtSign size={21} strokeWidth={1.8}/><span>官方 Threads</span><ArrowUpRight size={16}/></a>
    <a className="mobile-extra-link mobile-social-link" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={()=>setMoreOpen(false)}><DiscordMark size={21}/><span>官方 Discord</span><ArrowUpRight size={16}/></a>
   </nav>
  </>}
  <nav className="mobile-bottom-nav" aria-label="手機主要導覽">
   {mobileMain.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end={to==='/'} onMouseEnter={to==='/staff'?prefetchStaffPage:to==='/shifts'?prefetchShiftsPage:undefined} onFocus={to==='/staff'?prefetchStaffPage:to==='/shifts'?prefetchShiftsPage:undefined} onTouchStart={to==='/staff'?prefetchStaffPage:to==='/shifts'?prefetchShiftsPage:undefined} onPointerDown={to==='/shifts'?prefetchShiftsPage:undefined} className={({isActive})=>'mobile-bottom-item'+(isActive?' active':'')} onClick={()=>setMoreOpen(false)}><Icon size={22} strokeWidth={1.8}/><span>{label}</span></NavLink>)}
   <button ref={moreButton} type="button" className={'mobile-bottom-item'+(extraActive?' active':moreOpen?' expanded':'')} aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={event=>{openedByKeyboard.current=event.detail===0;setMoreOpen(value=>!value)}}>
    <Grid2X2 size={22} strokeWidth={1.8}/><span>更多</span>
   </button>
  </nav>
 </div>
}
