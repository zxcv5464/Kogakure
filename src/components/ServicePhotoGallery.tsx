import {useEffect,useState} from 'react'
import {ImagePlus} from 'lucide-react'
import type {ServiceEntry} from '../lib/service-content'

const slideIntervalMs=5000

/** Each service runs its own slow crossfade; the first photo shows immediately. */
export default function ServicePhotoGallery({service,number}:{service:ServiceEntry;number:string}){
 const photos=service.imageUrls.length?service.imageUrls:(service.imageUrl?[service.imageUrl]:[])
 const [index,setIndex]=useState(0)
 const photoKey=photos.join('\n')
 useEffect(()=>{
  setIndex(0)
  if(photos.length<2)return
  const timer=window.setInterval(()=>{
   if(document.visibilityState==='visible')setIndex(i=>(i+1)%photos.length)
  },slideIntervalMs)
  return()=>window.clearInterval(timer)
 },[service.id,photoKey,photos.length])
 const current=photos.length?index%photos.length:0
 return <div className="services-photo">
  {photos.length?
   <div className="services-photo-slides" aria-label={service.category+'形象照片輪播'} aria-live="off">
    {photos.map((url,i)=><img key={url+'-'+i} src={url}
     alt={(service.photoLabel||service.category+'服務照片')+'，第 '+(i+1)+' 張'}
     aria-hidden={i!==current}
     className={'services-photo-slide'+(i===current?' is-visible':'')}
     loading={i===0?'eager':'lazy'} decoding="async"/>)}
   </div>
   :<div className="services-photo-placeholder" role="img" aria-label={(service.photoLabel||service.category+'照片')+'，等待上傳'}>
     <span className="services-photo-halo" aria-hidden="true"/>
     <ImagePlus size={38} strokeWidth={1.15} aria-hidden="true"/>
     <strong>等待上傳</strong>
     <span>{service.photoLabel||service.category+'照片'} · 圖片預留區</span>
    </div>
  }
  <span className="services-photo-index" aria-hidden="true">KOGAKURE / {number}</span>
  {photos.length>1&&<span className="services-photo-counter" aria-hidden="true">
   {String(current+1).padStart(2,'0')} / {String(photos.length).padStart(2,'0')}
  </span>}
 </div>
}
