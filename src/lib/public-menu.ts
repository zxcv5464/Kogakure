import {configured} from './config'
import {fetchMenu} from './menu-catalog'
import type {MenuCatalog} from './menu-catalog'

// Read-only visitor catalog. Admin maintenance deliberately uses fetchMenu()
// directly; short freshness and in-flight dedup only affect the public page.
export function createPublicMenuCache(
 reader:()=>Promise<MenuCatalog>,maxAgeMs=45_000,now:()=>number=Date.now
){
 let cached:{value:MenuCatalog;at:number}|null=null
 let pending:Promise<MenuCatalog>|null=null
 const peek=()=>cached&&now()-cached.at<maxAgeMs?cached.value:null
 function load({force=false}:{force?:boolean}={}):Promise<MenuCatalog>{
  const existing=peek()
  if(!force&&existing)return Promise.resolve(existing)
  if(pending)return pending
  const request=reader().then(value=>{cached={value,at:now()};return value})
   .finally(()=>{if(pending===request)pending=null})
  pending=request
  return request
 }
 return {peek,load}
}
const cache=createPublicMenuCache(fetchMenu)
export const getCachedPublicMenu=cache.peek
export const loadPublicMenu=cache.load
export function prefetchPublicMenu():void{
 if(!configured)return
 void loadPublicMenu().catch(()=>{/* MenuPage displays the error. */})
}
