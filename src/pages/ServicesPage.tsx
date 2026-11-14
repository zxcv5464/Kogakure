import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {ArrowUpRight,Camera, Droplets, ImagePlus, MoonStar, Sparkles} from 'lucide-react'
import {configured} from '../lib/config'
import {fetchServiceContents,previewServices} from '../lib/service-content'
import type {ServiceEntry} from '../lib/service-content'
import './services-page.css'

function serviceIcon(service:ServiceEntry){
 if(service.slug==='bath'||service.category.includes('湯'))return Droplets
 if(service.slug==='divination'||service.category.includes('卜'))return MoonStar
 if(service.slug==='polaroid'||service.category.includes('影')||service.category.includes('照'))return Camera
 return Sparkles
}
export default function ServicesPage(){
 const [entries,setEntries]=useState<ServiceEntry[]>(configured?[]:previewServices)
 const [loading,setLoading]=useState(configured)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!configured)return
  let active=true
  fetchServiceContents().then(rows=>{if(active){setEntries(rows);setError('')}})
   .catch(err=>{if(active)setError(err instanceof Error?err.message:'服務內容暫時無法讀取')})
   .finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[])
 return <div className="services-page">
  <header className="services-hero">
   <p className="services-brand">狐隱 · KOGAKURE</p>
   <span className="services-ornament" aria-hidden="true">◇</span>
   <h1>隱世之儀</h1>
   <p className="services-subtitle">服務內容 · Our Rituals</p>
   <p className="services-intro">一池暖湯，一盞幽燈。<br/>在狐火引路的夜裡，尋一段只屬於你的靜謐時光。</p>
   {entries.length>0&&<nav className="services-shortcuts" aria-label="服務項目導覽">
    {entries.map(service=>{
     const Icon=serviceIcon(service)
     return <a key={service.id} href={'#'+service.slug}><Icon size={17} aria-hidden="true"/>{service.category}</a>
    })}
   </nav>}
  </header>
  <div className="services-content">
   {!configured&&<p className="services-state" role="status">展示版服務介紹；正式內容以館內公告為準。</p>}
   {loading&&<p className="services-state" role="status">狐火引路中，正在開啟館內服務卷軸…</p>}
   {error&&<p className="services-state is-error" role="alert">服務內容暫時無法讀取：{error}。請稍後重新整理。</p>}
   {!loading&&!error&&entries.length===0&&<p className="services-state">館內服務介紹仍在籌備中，敬請期待。</p>}
   {!loading&&!error&&entries.map((service,index)=>{
    const Icon=serviceIcon(service)
    const number=String(index+1).padStart(2,'0')
    return <section className="services-feature" id={service.slug} key={service.id} aria-labelledby={service.slug+'-title'}>
     <div className="services-photo">
      {service.imageUrl?(
       <img src={service.imageUrl} alt={service.photoLabel||service.category+'體驗照片'} loading="lazy" decoding="async"/>
      ):(
       <div className="services-photo-placeholder" role="img" aria-label={(service.photoLabel||service.category+'照片')+'，等待上傳'}>
        <span className="services-photo-halo" aria-hidden="true"/>
        <ImagePlus size={38} strokeWidth={1.15} aria-hidden="true"/>
        <strong>等待上傳</strong>
        <span>{service.photoLabel||service.category+'照片'} · 圖片預留區</span>
       </div>
      )}
      <span className="services-photo-index" aria-hidden="true">KOGAKURE / {number}</span>
     </div>
     <div className="services-copy">
      <p className="services-eyebrow"><Icon size={19} strokeWidth={1.5} aria-hidden="true"/><span>{service.category}</span><span className="services-separator" aria-hidden="true">·</span><span className="services-english">{service.english}</span></p>
      <h2 id={service.slug+'-title'}>{service.title}</h2>
      {service.quote&&<p className="services-quote">{service.quote}</p>}
      <span className="services-divider" aria-hidden="true"/>
      <div className="services-description">
       {service.paragraphs.map((paragraph,i)=><p key={i}>{paragraph}</p>)}
      </div>
      {service.details.length>0&&<ul className="services-tags" aria-label={service.category+'特色'}>
       {service.details.map((detail,i)=><li key={i}>{detail}</li>)}
      </ul>}
     </div>
    </section>
   })}
   <footer className="services-ending">
    <span className="services-ornament" aria-hidden="true">◇</span>
    <p>願每位循狐火而來的旅人，都能尋得屬於自己的片刻安寧。</p>
    <small>所有服務皆為 FFXIV 遊戲內 RP 體驗，實際開放項目、時間、費用及留影交付方式，以館內公告與服務前說明為準；占卜不代表現實預言或專業建議。</small>
    <Link to="/about">閱讀入館須知 <ArrowUpRight size={16} aria-hidden="true"/></Link>
   </footer>
  </div>
 </div>
}
