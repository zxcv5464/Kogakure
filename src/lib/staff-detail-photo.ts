import type { Staff } from '../types'

type Warmed={image:HTMLImageElement;done:Promise<void>;settled:boolean}
const warmed=new Map<string,Warmed>()
const MAX_RETAINED=24
const CONCURRENT=3

function trimCache(){
 for(const [url,item] of warmed){
  if(warmed.size<=MAX_RETAINED)break
  if(item.settled)warmed.delete(url)
 }
}

export function prefetchStaffDetailPhoto(source:string,priority:'low'|'high'='high'):Promise<void>{
 if(!source||typeof Image==='undefined')return Promise.resolve()
 const existing=warmed.get(source)
 if(existing){
  if(priority==='high')existing.image.fetchPriority='high'
  return existing.done
 }
 const image=new Image()
 image.decoding='async'
 image.fetchPriority=priority
 let finish:()=>void=()=>{}
 const done=new Promise<void>(resolve=>{finish=resolve})
 const entry:Warmed={image,done,settled:false}
 warmed.set(source,entry)
 const settle=(success:boolean)=>{
  if(entry.settled)return
  entry.settled=true
  window.clearTimeout(timer)
  image.onload=null;image.onerror=null
  if(!success&&warmed.get(source)===entry)warmed.delete(source)
  trimCache();finish()
 }
 const timer=window.setTimeout(()=>settle(false),20000)
 image.onload=()=>{if(image.decode)void image.decode().then(()=>settle(true),()=>settle(image.naturalWidth>0));else settle(true)}
 image.onerror=()=>settle(false)
 image.src=source
 return done
}

// First portrait of every published staff member, then the extra slides in
// round-robin order. Single mode never downloads undisplayed gallery photos.
export function staffDetailPhotoSources(staff:Staff[]):string[]{
 const albums=staff.map(person=>{
  const photos=person.photos?.length?person.photos.map(p=>p.imageUrl||p.thumbnailUrl):[person.imageUrl||person.thumbnailUrl]
  return (person.photoDisplayMode==='gallery'?photos:photos.slice(0,1)).filter(Boolean).slice(0,12)
 })
 const ordered:string[]=[]
 for(let i=0;i<12;i++)for(const album of albums)if(album[i])ordered.push(album[i])
 return [...new Set(ordered)]
}

// Called on roster entry, not after a profile click. Limit parallel transfers
// and cancel queued work on navigation; the shared browser cache is reusable.
export function prefetchStaffRosterPhotos(staff:Staff[]):()=>void{
 const urls=staffDetailPhotoSources(staff)
 let cancelled=false,cursor=0
 const worker=async()=>{
  while(!cancelled&&cursor<urls.length){
   const url=urls[cursor++]
   await prefetchStaffDetailPhoto(url,'low')
  }
 }
 for(let i=0;i<Math.min(CONCURRENT,urls.length);i++)void worker()
 return()=>{cancelled=true}
}
