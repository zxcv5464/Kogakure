import {configured} from './config'
import {rollingShiftWeeks} from './shift-calendar'
import {fetchShifts} from './shifts'
import type {ShiftCalendarData} from './shifts'

// Read-only visitor schedule: avoid three repeated Supabase queries each time
// a traveller returns from another page. Admin edits still use fetchShifts()
// directly, and the public refresh button explicitly bypasses this short TTL.
const CACHE_TTL_MS=45_000
const snapshots=new Map<string,{value:ShiftCalendarData;storedAt:number}>()
const pending=new Map<string,Promise<ShiftCalendarData>>()
const keyFor=(start:string,end:string)=>start+'|'+end

/** Return even an older snapshot so the calendar stays visible while updating. */
export function peekPublicShifts(start:string,end:string):ShiftCalendarData|null{
 return snapshots.get(keyFor(start,end))?.value??null
}

export function loadPublicShifts(
 start:string,end:string,{force=false}:{force?:boolean}={}
):Promise<ShiftCalendarData>{
 const key=keyFor(start,end)
 const snapshot=snapshots.get(key)
 if(!force&&snapshot&&Date.now()-snapshot.storedAt<CACHE_TTL_MS)
  return Promise.resolve(snapshot.value)
 const existing=pending.get(key)
 if(existing)return existing
 const request=fetchShifts(start,end).then(value=>{
  snapshots.set(key,{value,storedAt:Date.now()})
  // There is no need to retain weeks from long-ago visits indefinitely.
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

/** Only run on navigation intent (hover/focus/touch), never on homepage load. */
export function prefetchCurrentPublicShifts():void{
 if(!configured)return
 const weeks=rollingShiftWeeks()
 void loadPublicShifts(weeks[0].start,weeks[3].end).catch(()=>{
  // The actual shifts page owns visible error messages and retry controls.
 })
}
