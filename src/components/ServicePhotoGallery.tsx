import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {ImagePlus} from 'lucide-react'
import type {ServiceEntry} from '../lib/service-content'
import {normalizeServiceCrops,servicePhotoFrameStyle} from '../lib/service-photo-crop'

const slideIntervalMs=5000
const revealDurationMs=1450
type Layer=0|1
type Slides={indices:[number,number];active:Layer;previous:Layer|null;revealing:boolean}
type Transition={
 token:number;busy:boolean;preloader:HTMLImageElement|null;
 frameOne:number;frameTwo:number;transitionTimer:number
}

/** Only two image layers, even for twelve photographs.
 * Manual dot navigation shares the same decoded-image shoji reveal as autoplay,
 * while cancelling stale preload/animation callbacks before selecting another photo. */
export default function ServicePhotoGallery({service,number}:{service:ServiceEntry;number:string}){
 const photos=useMemo(()=>service.imageUrls.length?service.imageUrls:
  (service.imageUrl?[service.imageUrl]:[]),[service.imageUrls,service.imageUrl])
 const photoCrops=normalizeServiceCrops(service.imageCrops,photos.length)
 const photoKey=photos.join('\n')
 const galleryRef=useRef<HTMLDivElement>(null)
 const nextIndexRef=useRef(0)
 const transitionRef=useRef<Transition>({
  token:0,busy:false,preloader:null,frameOne:0,frameTwo:0,transitionTimer:0,
 })
 const [nearViewport,setNearViewport]=useState(false)
 const [navigationEpoch,setNavigationEpoch]=useState(0)
 const [slides,setSlides]=useState<Slides>({indices:[0,0],active:0,previous:null,revealing:false})

 const cancelTransition=useCallback(()=>{
  const run=transitionRef.current
  run.token++
  run.busy=false
  if(run.preloader){run.preloader.onload=null;run.preloader.onerror=null;run.preloader=null}
  window.cancelAnimationFrame(run.frameOne)
  window.cancelAnimationFrame(run.frameTwo)
  window.clearTimeout(run.transitionTimer)
 },[])

 useEffect(()=>{
  cancelTransition()
  nextIndexRef.current=0
  setSlides({indices:[0,0],active:0,previous:null,revealing:false})
 },[service.id,photoKey,cancelTransition])
 useEffect(()=>()=>cancelTransition(),[cancelTransition])

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

 const requestSlide=useCallback((next:number)=>{
  const run=transitionRef.current
  if(next<0||next>=photos.length||next===nextIndexRef.current||run.busy)return
  run.busy=true
  const token=++run.token
  const image=new Image()
  image.decoding='async'
  run.preloader=image
  const ready=()=>{
   if(token!==run.token)return
   // Populate the concealed image layer before revealing it, so the
   // outgoing full frame remains behind the two opening shoji panels.
   setSlides(previous=>{
    const layer:Layer=previous.active===0?1:0
    const indices:[number,number]=[...previous.indices]
    indices[layer]=next
    return {...previous,indices}
   })
   run.frameOne=window.requestAnimationFrame(()=>{
    run.frameTwo=window.requestAnimationFrame(()=>{
     if(token!==run.token)return
     nextIndexRef.current=next
     const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches
     setSlides(previous=>{
      const layer:Layer=previous.active===0?1:0
      return {...previous,active:layer,previous:reducedMotion?null:previous.active,
       revealing:!reducedMotion}
     })
     if(reducedMotion){run.busy=false;run.preloader=null;return}
     run.transitionTimer=window.setTimeout(()=>{
      if(token!==run.token)return
      setSlides(previous=>({...previous,previous:null,revealing:false}))
      run.busy=false
      run.preloader=null
     },revealDurationMs)
    })
   })
  }
  image.onload=()=>{
   if(token!==run.token)return
   if(image.decode)void image.decode().then(ready,ready)
   else ready()
  }
  image.onerror=()=>{
   if(token!==run.token)return
   run.busy=false
   run.preloader=null
  }
  image.src=photos[next]
 },[photos])

 // Automatically rotate only while the gallery is close to the screen.
 // Restart the five-second interval after a manual selection.
 useEffect(()=>{
  if(photos.length<2||!nearViewport)return
  const timer=window.setInterval(()=>{
   if(document.visibilityState!=='visible'||transitionRef.current.busy)return
   requestSlide((nextIndexRef.current+1)%photos.length)
  },slideIntervalMs)
  return()=>window.clearInterval(timer)
 },[photos.length,nearViewport,requestSlide,navigationEpoch])

 function choosePhoto(index:number){
  setNavigationEpoch(previous=>previous+1)
  if(index===nextIndexRef.current)return
  cancelTransition()
  setSlides(previous=>({...previous,previous:null,revealing:false}))
  requestSlide(index)
 }

 const current=slides.indices[slides.active]
 return <div className="services-photo" ref={galleryRef}>
  {photos.length?
   <div className={'services-photo-slides'+(slides.revealing?' is-opening':'')}
    aria-label={service.category+'形象照片輪播'} aria-live="off">
    {slides.indices.map((photoIndex,layer)=><img key={layer} src={photos[photoIndex]}
     style={servicePhotoFrameStyle(photoCrops[photoIndex])}
     alt={(service.photoLabel||service.category+'服務照片')+'，第 '+(photoIndex+1)+' 張'}
     aria-hidden={layer!==slides.active}
     className={'services-photo-slide'+(layer===slides.active?' is-visible'+
      (slides.revealing?' is-revealing':''):layer===slides.previous?' is-previous':'')}
     loading={number==='01'?'eager':'lazy'} decoding="async"/>)}
    {slides.revealing&&<span className="services-photo-shoji-edges" aria-hidden="true"><i/><i/></span>}
   </div>
   :<div className="services-photo-placeholder" role="img"
    aria-label={(service.photoLabel||service.category+'照片')+'，等待上傳'}>
     <span className="services-photo-halo" aria-hidden="true"/>
     <ImagePlus size={38} strokeWidth={1.15} aria-hidden="true"/>
     <strong>等待上傳</strong>
     <span>{service.photoLabel||service.category+'照片'} · 圖片預留區</span>
    </div>
  }
  {photos.length>1&&<div className="services-photo-dots" role="group"
   aria-label={service.category+'照片切換'}>
   {photos.map((_,index)=><button key={index} type="button"
    className={'services-photo-dot'+(index===current?' is-active':'')}
    aria-label={'觀看第 '+(index+1)+' 張照片'}
    aria-current={index===current?'true':undefined}
    onClick={()=>choosePhoto(index)}/>)}
  </div>}
 </div>
}
