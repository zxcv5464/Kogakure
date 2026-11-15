import {useEffect,useRef,useState} from 'react'
import {ImagePlus} from 'lucide-react'
import type {ServiceEntry} from '../lib/service-content'

const slideIntervalMs=5000
type Layer=0|1
type Slides={indices:[number,number];active:Layer}

/** Only two image elements are ever kept, even if an editor adds 12 photos.
 * Offscreen galleries are paused and the next image is decoded BEFORE fading,
 * avoiding extra image decodes and timers during navigation or page scrolling. */
export default function ServicePhotoGallery({service,number}:{service:ServiceEntry;number:string}){
 const photos=service.imageUrls.length?service.imageUrls:(service.imageUrl?[service.imageUrl]:[])
 const photoKey=photos.join('\n')
 const galleryRef=useRef<HTMLDivElement>(null)
 const nextIndexRef=useRef(0)
 const [nearViewport,setNearViewport]=useState(false)
 const [slides,setSlides]=useState<Slides>({indices:[0,0],active:0})

 useEffect(()=>{
  nextIndexRef.current=0
  setSlides({indices:[0,0],active:0})
 },[service.id,photoKey])

 useEffect(()=>{
  if(photos.length<2)return
  const root=galleryRef.current
  if(!root||typeof IntersectionObserver==='undefined'){
   setNearViewport(true)
   return
  }
  const observer=new IntersectionObserver(entries=>{
   setNearViewport(Boolean(entries[0]?.isIntersecting))
  },{rootMargin:'180px 0px'})
  observer.observe(root)
  return()=>observer.disconnect()
 },[service.id,photoKey,photos.length])

 useEffect(()=>{
  if(photos.length<2||!nearViewport)return
  let cancelled=false
  let busy=false
  let preloader:HTMLImageElement|null=null
  let frameOne=0,frameTwo=0
  const timer=window.setInterval(()=>{
   if(document.visibilityState!=='visible'||busy)return
   busy=true
   const next=(nextIndexRef.current+1)%photos.length
   const image=new Image()
   image.decoding='async'
   preloader=image
   const ready=()=>{
    if(cancelled)return
    // Populate the hidden layer first, then switch its opacity on a
    // subsequent painted frame. This retains the original crossfade effect.
    setSlides(previous=>{
     const layer:Layer=previous.active===0?1:0
     const indices:[number,number]=[...previous.indices]
     indices[layer]=next
     return {...previous,indices}
    })
    frameOne=window.requestAnimationFrame(()=>{
     frameTwo=window.requestAnimationFrame(()=>{
      if(cancelled)return
      nextIndexRef.current=next
      setSlides(previous=>({...previous,active:previous.active===0?1:0}))
      busy=false
     })
    })
   }
   image.onload=()=>{
    if(cancelled)return
    if(image.decode)void image.decode().then(ready,ready)
    else ready()
   }
   image.onerror=()=>{busy=false}
   image.src=photos[next]
  },slideIntervalMs)
  return()=>{
   cancelled=true
   window.clearInterval(timer)
   window.cancelAnimationFrame(frameOne)
   window.cancelAnimationFrame(frameTwo)
   if(preloader){preloader.onload=null;preloader.onerror=null}
  }
 },[service.id,photoKey,photos.length,nearViewport])

 const current=slides.indices[slides.active]
 return <div className="services-photo" ref={galleryRef}>
  {photos.length?
   <div className="services-photo-slides" aria-label={service.category+'形象照片輪播'} aria-live="off">
    {slides.indices.map((photoIndex,layer)=><img key={layer} src={photos[photoIndex]}
     alt={(service.photoLabel||service.category+'服務照片')+'，第 '+(photoIndex+1)+' 張'}
     aria-hidden={layer!==slides.active}
     className={'services-photo-slide'+(layer===slides.active?' is-visible':'')}
     loading={number==='01'?'eager':'lazy'} decoding="async"/>)}
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
