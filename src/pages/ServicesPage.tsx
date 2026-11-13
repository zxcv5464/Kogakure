import { Link } from 'react-router-dom'
import { ArrowUpRight, Droplets, ImagePlus, MoonStar } from 'lucide-react'
import { asset } from '../lib/paths'
import './services-page.css'

type ServiceFeature = {
 id: string
 number: string
 category: string
 english: string
 title: string
 quote: string
 paragraphs: string[]
 details: string[]
 photoLabel: string
 imageAlt: string
 // 上傳照片到 public/images/services/ 後，將 null 換成
 // 'images/services/照片檔名.webp' 即可；不需要修改版面。
 imagePath: string | null
}

const services: ServiceFeature[] = [
 {
  id: 'bath',
  number: '01',
  category: '湯浴之儀',
  english: 'THE BATHING RITUAL',
  title: '一湯入夢，洗去塵囂',
  quote: '「暖湯氤氳，願旅途的疲憊就此消散。」',
  paragraphs: [
   '循著山林深處的狐火，走進隱於夜色中的湯宿。讓輕柔燈影與氤氳水氣，陪你暫時放下旅途的紛擾。',
   '無論想獨自沉澱，或與同行旅人靜靜相聚，都願這段湯浴時光，成為今夜值得收藏的片刻。',
  ],
  details: ['湯泉休憩', '靜謐相聚', '隱世湯宿'],
  photoLabel: '湯浴形象照片',
  imageAlt: '狐隱湯浴體驗的館內照片',
  imagePath: null,
 },
 {
  id: 'divination',
  number: '02',
  category: '占卜之儀',
  english: 'THE DIVINATION RITUAL',
  title: '循狐火，探尋心中之願',
  quote: '「命運藏於夜色，答案或許就在心念之間。」',
  paragraphs: [
   '於幽燈與狐影交織之處，讓館內的占卜者陪你走進一場帶著神祕色彩的對話，傾聽未說出口的心事。',
   '無須急著尋找唯一的答案。願這一場隱世之儀，能為你的故事添上一點光亮與想像。',
  ],
  details: ['神祕對談', '心願指引', '角色扮演體驗'],
  photoLabel: '占卜形象照片',
  imageAlt: '狐隱占卜體驗的館內照片',
  imagePath: null,
 },
]

export default function ServicesPage() {
 return (
  <div className="services-page">
   <header className="services-hero">
    <p className="services-brand">狐隱 · KOGAKURE</p>
    <span className="services-ornament" aria-hidden="true">◇</span>
    <h1>隱世之儀</h1>
    <p className="services-subtitle">服務內容 · Our Rituals</p>
    <p className="services-intro">一池暖湯，一盞幽燈。<br/>在狐火引路的夜裡，尋一段只屬於你的靜謐時光。</p>
    <nav className="services-shortcuts" aria-label="服務項目導覽">
     <a href="#bath"><Droplets size={17} aria-hidden="true"/>湯浴介紹</a>
     <a href="#divination"><MoonStar size={17} aria-hidden="true"/>占卜介紹</a>
    </nav>
   </header>

   <main className="services-content">
    {services.map(service => {
     const Icon = service.id === 'bath' ? Droplets : MoonStar
     return (
      <section className="services-feature" id={service.id} key={service.id} aria-labelledby={service.id + '-title'}>
       <div className="services-photo">
        {service.imagePath ? (
         <img src={asset(service.imagePath)} alt={service.imageAlt} loading="lazy" decoding="async"/>
        ) : (
         <div className="services-photo-placeholder" role="img" aria-label={service.photoLabel + '，等待上傳'}>
          <span className="services-photo-halo" aria-hidden="true"/>
          <ImagePlus size={38} strokeWidth={1.15} aria-hidden="true"/>
          <strong>等待上傳</strong>
          <span>{service.photoLabel} · 圖片預留區</span>
         </div>
        )}
        <span className="services-photo-index" aria-hidden="true">KOGAKURE / {service.number}</span>
       </div>
       <div className="services-copy">
        <p className="services-eyebrow"><Icon size={19} strokeWidth={1.5} aria-hidden="true"/><span>{service.category}</span><span className="services-separator" aria-hidden="true">·</span><span className="services-english">{service.english}</span></p>
        <h2 id={service.id + '-title'}>{service.title}</h2>
        <p className="services-quote">{service.quote}</p>
        <span className="services-divider" aria-hidden="true"/>
        <div className="services-description">
         {service.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <ul className="services-tags" aria-label={service.category + '特色'}>
         {service.details.map(detail => <li key={detail}>{detail}</li>)}
        </ul>
       </div>
      </section>
     )
    })}

    <footer className="services-ending">
     <span className="services-ornament" aria-hidden="true">◇</span>
     <p>願每位循狐火而來的旅人，都能尋得屬於自己的片刻安寧。</p>
     <small>湯浴及占卜皆為 FFXIV 遊戲內 RP 體驗，實際開放項目、時間與費用以館內公告及服務前說明為準；占卜不代表現實預言或專業建議。</small>
     <Link to="/about">閱讀入館須知 <ArrowUpRight size={16} aria-hidden="true"/></Link>
    </footer>
   </main>
  </div>
 )
}
