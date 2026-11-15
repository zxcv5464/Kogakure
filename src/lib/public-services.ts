import {configured} from './config'
import {fetchServiceContents} from './service-content'
import type {ServiceEntry} from './service-content'

const CACHE_TTL_MS=45_000
type ServiceReader=()=>Promise<ServiceEntry[]>

/** Public visitor-only read-through cache. Admin continues reading the live
 * service_contents table directly, including unpublished drafts. */
export function createPublicServiceCache(
 reader:ServiceReader,ttlMs=CACHE_TTL_MS,now:()=>number=Date.now
){
 let snapshot:{value:ServiceEntry[];storedAt:number}|null=null
 let pending:Promise<ServiceEntry[]>|null=null

 // An expired result remains available while the visitor's next read
 // revalidates, so returning to the page never empties the content first.
 const peek=():ServiceEntry[]|null=>snapshot?.value??null
 function load({force=false}:{force?:boolean}={}):Promise<ServiceEntry[]>{
  if(!force&&snapshot&&now()-snapshot.storedAt<ttlMs)
   return Promise.resolve(snapshot.value)
  if(pending)return pending
  const promise=reader().then(rows=>{
   snapshot={value:rows,storedAt:now()}
   return rows
  }).finally(()=>{
   if(pending===promise)pending=null
  })
  pending=promise
  return promise
 }
 return {peek,load}
}

const visitorCache=createPublicServiceCache(()=>fetchServiceContents())
export const peekPublicServices=visitorCache.peek
export const loadPublicServices=visitorCache.load

/** Fetch only on actual navigation intent, never on general homepage load. */
export function prefetchPublicServices():void{
 if(!configured)return
 void loadPublicServices().catch(()=>{
  // The destination page handles failures and shows its own explanation.
 })
}
