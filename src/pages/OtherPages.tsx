import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, CalendarDays, Compass, Coffee, ScrollText, Sparkles, Utensils } from 'lucide-react'
import { asset } from '../lib/paths'
import { prefetchStaffPage } from '../lib/prefetch'
import './home-page.css'
const pages={
 '/about':{title:'館內介紹',desc:'穿過山林的夜色，尋一處可暫時忘憂的所在。',icon:Compass},
 '/services':{title:'服務內容',desc:'湯泉、占卜與茶點，願每段停留都能得到溫柔款待。',icon:Coffee},
 '/shifts':{title:'值班排班',desc:'在此查看每週接待者與當日的值班資訊。',icon:CalendarDays},
 '/menu':{title:'點菜',desc:'選一盞茶、一份點心，陪你慢慢度過今夜。',icon:Utensils},
 '/booking':{title:'預約',desc:'選擇想體驗的服務，在狐火亮起時與我們相見。',icon:ScrollText},
}
export function HomePage(){
 return <div className="home-page"><section className="home-hero"><div className="home-image" aria-hidden="true"/><div className="home-content"><img className="home-logo" src={asset('images/brand/logo-wide.webp')} alt="狐隱 KOGAKURE 狐隱の湯"/><p className="home-verse">世有百鬼，夜有萬境。<br/>循狐而入，借湯忘憂。</p><p className="home-blurb">傳說在月色最深的夜晚，山林裡會出現一盞青色狐火。<br/>循著那盞光，你將抵達隱於結界之中的湯宿。</p><Link className="primary-link" to="/staff" onMouseEnter={prefetchStaffPage} onFocus={prefetchStaffPage} onTouchStart={prefetchStaffPage}>邂逅接待者 <ArrowRight size={18}/></Link><div className="home-note"><Sparkles size={16}/><span>狐隱正在籌備中，其餘內容將逐步開放。</span></div></div></section></div>
}
export function OtherPage(){
 const path=useLocation().pathname
 const page=pages[path as keyof typeof pages]||pages['/about']
 const Icon=page.icon
 return <section className="coming-page"><div className="coming-photo" aria-hidden="true"/><div className="coming-panel"><Icon size={29}/><h1>{page.title}</h1><div className="gold-rule"><span>◇</span></div><p>{page.desc}</p><span className="coming-tag">內容籌備中</span><p className="coming-explain">更多內容，敬請期待。</p><Link to="/staff" className="primary-link" onMouseEnter={prefetchStaffPage} onFocus={prefetchStaffPage} onTouchStart={prefetchStaffPage}>先看看狐隱名帖 <ArrowRight size={18}/></Link></div></section>
}
