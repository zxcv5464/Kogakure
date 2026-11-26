import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {MouseEvent,CSSProperties} from 'react'
import './mystic-photo-gallery.css'
import type { StaffCrop } from '../lib/staff-crop'

type GalleryPhoto={imageUrl:string;thumbnailUrl?:string;preserveCrop?:boolean;mobileCrop?:StaffCrop|null}
type Layer=0|1
type Slides={indices:[number,number];active:Layer;previous:Layer|null;revealing:boolean}
type Transition={token:number;busy:boolean;preloader:HTMLImageElement|null;frameOne:number;frameTwo:number;timer:number}
type Props={
 photos:GalleryPhoto[];mode?:'single'|'gallery';useThumbnail?:boolean;useMobileCrop?:boolean
 alt:string;className?:string;overlayUrl?:string;showCounter?:boolean;showPagination?:boolean;loading?:'eager'|'lazy'
}

/** A portrait slideshow that shares the Services page's shoji reveal and ink-gold dots. */
export default function MysticPhotoGallery({
 photos,mode='single',useThumbnail=true,useMobileCrop=false,alt,className='',overlayUrl='',showCounter=true,showPagination=true,loading='lazy',
}:Props){
 const galleryPhotos=useMemo(()=>photos.filter(photo=>Boolean(useThumbnail?(photo.thumbnailUrl||photo.imageUrl):photo.imageUrl)).slice(0,12),[photos,useThumbnail])
 const sources=useMemo(()=>galleryPhotos.map(photo=>useThumbnail?(photo.thumbnailUrl||photo.imageUrl):photo.imageUrl),[galleryPhotos,useThumbnail])
 const activeSources=useMemo(()=>mode==='gallery'?sources:sources.slice(0,1),[mode,sources])
 const photoKey=activeSources.join('\n')
 const root=useRef<HTMLDivElement>(null)
 const nextIndex=useRef(0)
 const transition=useRef<Transition>({token:0,busy:false,preloader:null,frameOne:0,frameTwo:0,timer:0})
 const [nearViewport,setNearViewport]=useState(false)
 const [navigationEpoch,setNavigationEpoch]=useState(0)
 const [slides,setSlides]=useState<Slides>({indices:[0,0],active:0,previous:null,revealing:false})
 const cancel=useCallback(()=>{
  const run=transition.current
  run.token++;run.busy=false
  if(run.preloader){run.preloader.onload=null;run.preloader.onerror=null;run.preloader=null}
  window.cancelAnimationFrame(run.frameOne);window.cancelAnimationFrame(run.frameTwo)
  window.clearTimeout(run.timer)
 },[])
 useEffect(()=>{
  cancel();nextIndex.current=0
  setSlides({indices:[0,0],active:0,previous:null,revealing:false})
 },[photoKey,cancel])
 useEffect(()=>()=>cancel(),[cancel])
 useEffect(()=>{
  if(activeSources.length<2){setNearViewport(false);return}
  const node=root.current
  if(!node||typeof IntersectionObserver==='undefined'){setNearViewport(true);return}
  const observer=new IntersectionObserver(entries=>setNearViewport(Boolean(entries[0]?.isIntersecting)),{rootMargin:'180px 0px'})
  observer.observe(node)
  return()=>observer.disconnect()
 },[photoKey,activeSources.length])
 const requestSlide=useCallback((next:number)=>{
  const run=transition.current
  if(next<0||next>=activeSources.length||next===nextIndex.current||run.busy)return
  run.busy=true
  const token=++run.token
  const image=new Image();image.decoding='async';run.preloader=image
  const ready=()=>{
   if(token!==run.token)return
   setSlides(previous=>{
    const layer:Layer=previous.active===0?1:0
    const indices:[number,number]=[...previous.indices];indices[layer]=next
    return {...previous,indices}
   })
   run.frameOne=window.requestAnimationFrame(()=>run.frameTwo=window.requestAnimationFrame(()=>{
    if(token!==run.token)return
    nextIndex.current=next
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setSlides(previous=>{
     const layer:Layer=previous.active===0?1:0
     return {...previous,active:layer,previous:reduced?null:previous.active,revealing:!reduced}
    })
    if(reduced){run.busy=false;run.preloader=null;return}
    run.timer=window.setTimeout(()=>{
     if(token!==run.token)return
     setSlides(previous=>({...previous,previous:null,revealing:false}))
     run.busy=false;run.preloader=null
    },1450)
   }))
  }
  image.onload=()=>{
   if(token!==run.token)return
   if(image.decode)void image.decode().then(ready,ready);else ready()
  }
  image.onerror=()=>{if(token===run.token){run.busy=false;run.preloader=null}}
  image.src=activeSources[next]
 },[activeSources])
 useEffect(()=>{
  if(activeSources.length<2||!nearViewport||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
  const timer=window.setInterval(()=>{
   if(document.visibilityState==='visible'&&!transition.current.busy)
    requestSlide((nextIndex.current+1)%activeSources.length)
  },5000)
  return()=>window.clearInterval(timer)
 },[activeSources.length,nearViewport,requestSlide,navigationEpoch])
 function choose(index:number,event:MouseEvent<HTMLButtonElement>){
  event.stopPropagation()
  setNavigationEpoch(value=>value+1)
  if(index===nextIndex.current)return
  cancel()
  setSlides(previous=>({...previous,previous:null,revealing:false}))
  requestSlide(index)
 }
 if(!activeSources.length)return <div className={'mystic-photo-gallery is-empty '+className} aria-label={alt}/>
 const current=slides.indices[slides.active]
 return <div ref={root} className={'mystic-photo-gallery '+className} aria-label={alt}>
  <div className={'services-photo-slides'+(slides.revealing?' is-opening':'')} aria-live="off">
   {slides.indices.map((photoIndex,layer)=>{
    const source=activeSources[photoIndex]||activeSources[0]
    const photo=galleryPhotos[photoIndex]||galleryPhotos[0]
    const crop=useMobileCrop?photo?.mobileCrop:null
    const classes='services-photo-slide'+(photo?.preserveCrop?' is-manual-crop':'')+(layer===slides.active?' is-visible'+(slides.revealing?' is-revealing':''):layer===slides.previous?' is-previous':'')
    const imageProps={src:source,alt:alt+'，第 '+(photoIndex+1)+' 張',decoding:'async' as const,loading:layer===slides.active?loading:'lazy' as const}
    return crop?<div key={layer} className={classes+' has-mobile-crop'} aria-hidden={layer!==slides.active}
     style={{'--mobile-crop-width':(100/crop.width)+'%','--mobile-crop-height':(100/crop.height)+'%','--mobile-crop-left':(-crop.x/crop.width*100)+'%','--mobile-crop-top':(-crop.y/crop.height*100)+'%'} as CSSProperties}>
     <img {...imageProps}/></div>:<img key={layer} {...imageProps} aria-hidden={layer!==slides.active} className={classes}/>
   })}
   {slides.revealing&&<span className="services-photo-shoji-edges" aria-hidden="true"><i/><i/></span>}
  </div>
  {overlayUrl&&<img className="mystic-photo-overlay" src={overlayUrl} alt="預約副圖片" loading="lazy" decoding="async"/>}
  {activeSources.length>1&&showCounter&&<span className="services-photo-counter" aria-hidden="true">
   {String(current+1).padStart(2,'0')} / {String(activeSources.length).padStart(2,'0')}
  </span>}
  {activeSources.length>1&&showPagination&&<div className="services-photo-dots" role="group" aria-label={alt+'照片切換'}>
   {activeSources.map((_,index)=><button key={index} type="button"
    className={'services-photo-dot'+(index===current?' is-active':'')}
    aria-label={'觀看第 '+(index+1)+' 張照片'} aria-current={index===current?'true':undefined}
    onClick={event=>choose(index,event)}/>)}
  </div>}
 </div>
}
