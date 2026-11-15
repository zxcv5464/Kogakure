import {useEffect,useRef,useState} from 'react'
import {ImagePlus} from 'lucide-react'
import type {ServiceEntry} from '../lib/service-content'
import {normalizeServiceCrops,servicePhotoFrameStyle} from '../lib/service-photo-crop'

const slideIntervalMs=5000
const revealDurationMs=1450
type Layer=0|1
type Slides={indices:[number,number];active:Layer;previous:Layer|null;revealing:boolean}

/** Only two image elements are kept, even with 12 photos.
 * The next image is fully decoded before a center-opening shoji reveal.
 * The previous photo remains fully visible UNDER the opening layer, so
 * neither half of the frame flashes dark during the transition. */
export default function ServicePhotoGallery({service,number}:{service:ServiceEntry;number:string}){
 const photos=service.imageUrls.length?service.imageUrls:(service.imageUrl?[service.imageUrl]:[])
 const photoCrops=normalizeServiceCrops(service.imageCrops,photos.length)
 const photoKey=photos.join('\n')
 const galleryRef=useRef<HTMLDivElement>(null)
 const nextIndexRef=useRef(0)
 const [nearViewport,setNearViewport]=useState(false)
 const [slides,setSlides]=useState<Slides>({indices:[0,0],active:0,previous:null,revealing:false})

 useEffect(()=>{
  nextIndexRef.current=0
  setSlides({indices:[0,0],active:0,previous:null,revealing:false})
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
  let frameOne=0,frameTwo=0,transitionTimer=0
  const timer=window.setInterval(()=>{
   if(document.visibilityState!=='visible'||busy)return
   busy=true
   const next=(nextIndexRef.current+1)%photos.length
   const image=new Image()
   image.decoding='async'
   preloader=image
   const ready=()=>{
    if(cancelled)return
    // Populate the concealed layer first and let the browser paint it before
    // sliding open its center seam. Keep the outgoing photo as a full backdrop.
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
      const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setSlides(previous=>{
       const layer:Layer=previous.active===0?1:0
       return {...previous,active:layer,previous:reducedMotion?null:previous.active,revealing:!reducedMotion}
      })
      if(reducedMotion){busy=false;return}
      transitionTimer=window.setTimeout(()=>{
       if(cancelled)return
       setSlides(previous=>({...previous,previous:null,revealing:false}))
       busy=false
      },revealDurationMs)
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
   window.clearTimeout(transitionTimer)
   if(preloader){preloader.onload=null;preloader.onerror=null}
  }
 },[service.id,photoKey,photos.length,nearViewport])

 const current=slides.indices[slides.active]
 return <div className="services-photo" ref={galleryRef}>
  {photos.length?
   <div className={'services-photo-slides'+(slides.revealing?' is-opening':'')} aria-label={service.category+'形象照片輪播'} aria-live="off">
    {slides.indices.map((photoIndex,layer)=><img key={layer} src={photos[photoIndex]}
     style={servicePhotoFrameStyle(photoCrops[photoIndex])}
     alt={(service.photoLabel||service.category+'服務照片')+'，第 '+(photoIndex+1)+' 張'}
     aria-hidden={layer!==slides.active}
     className={'services-photo-slide'+(layer===slides.active?' is-visible'+(slides.revealing?' is-revealing':''):layer===slides.previous?' is-previous':'')}
     loading={number==='01'?'eager':'lazy'} decoding="async"/>)}
    {slides.revealing&&<span className="services-photo-shoji-edges" aria-hidden="true"><i/><i/></span>}
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
