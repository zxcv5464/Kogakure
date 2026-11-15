import {configured} from './config'
import {rollingShiftWeeks} from './shift-calendar'
import {fetchShifts} from './shifts'
import type {ShiftCalendarData} from './shifts'

// Visitor-only cache: administration always uses the uncached fetchShifts().
// A short TTL avoids repeated three-query round trips when moving between pages.
const CACHE_TTL_MS=45_000
type ShiftReader=(start:string,end:string)=>Promise<ShiftCalendarData>

/** The injectable reader makes deduplication and expiry behavior testable
 * without touching production Supabase or changing private admin data. */
export function createPublicShiftCache(
 reader:ShiftReader,ttlMs=CACHE_TTL_MS,now:()=>number=Date.now
){
 const snapshots=new Map<string,{value:ShiftCalendarData;storedAt:number}>()
 const pending=new Map<string,Promise<ShiftCalendarData>>()
 const keyFor=(start:string,end:string)=>start+'|'+end

 /** Return even an older snapshot so the calendar stays visible while updating. */
 function peek(start:string,end:string):ShiftCalendarData|null{
  return snapshots.get(keyFor(start,end))?.value??null
 }
 function load(
  start:string,end:string,{force=false}:{force?:boolean}={}
 ):Promise<ShiftCalendarData>{
  const key=keyFor(start,end)
  const snapshot=snapshots.get(key)
  if(!force&&snapshot&&now()-snapshot.storedAt<ttlMs)
   return Promise.resolve(snapshot.value)
  // Multiple hover/touch/load actions must share one network round trip.
  const existing=pending.get(key)
  if(existing)return existing
  const request=reader(start,end).then(value=>{
   snapshots.set(key,{value,storedAt:now()})
   while(snapshots.size>4){
    const oldest=snapshots.keys().next().value
    if(oldest===undefined)break
    snapshots.delete(oldest)
   }
   return value
  }).finally(()=>{if(pending.get(key)===request)pending.delete(key)})
  pending.set(key,request)
  return request
 }
 return {peek,load}
}

const publicCache=createPublicShiftCache(fetchShifts)
export const peekPublicShifts=publicCache.peek
export const loadPublicShifts=publicCache.load

/** Only run on navigation intent (hover/focus/touch), never on homepage load. */
export function prefetchCurrentPublicShifts():void{
 if(!configured)return
 const weeks=rollingShiftWeeks()
 void loadPublicShifts(weeks[0].start,weeks[3].end).catch(()=>{
  // The actual shifts page owns visible error messages and retry controls.
 })
}
