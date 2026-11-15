import {configured} from './config'
import {loadPublicStaff} from './public-staff'
import {loadBookingPlans,loadStaffPresence} from './bookings'
import type {BookingPlan,StaffPresence} from './bookings'

/** Visitor-only cache; mutations and admin reads continue to use live APIs.
 * Busy presence expires quickly because approval can change at any time. */
export function createBookingReadCache<T>(
 reader:()=>Promise<T>,ttlMs:number,now:()=>number=Date.now
){
 let snapshot:{value:T;time:number}|null=null
 let pending:Promise<T>|null=null
 const peek=():T|null=>snapshot&&now()-snapshot.time<ttlMs?snapshot.value:null
 function load({force=false}:{force?:boolean}={}):Promise<T>{
  const value=peek()
  if(!force&&value!==null)return Promise.resolve(value)
  if(pending)return pending
  const request=reader().then(value=>{
   snapshot={value,time:now()}
   return value
  }).finally(()=>{if(pending===request)pending=null})
  pending=request
  return request
 }
 return {peek,load}
}
const plans=createBookingReadCache<BookingPlan[]>(()=>loadBookingPlans(),45_000)
const presence=createBookingReadCache<StaffPresence[]>(()=>loadStaffPresence(),6_000)
export const peekPublicBookingPlans=plans.peek
export const loadPublicBookingPlans=plans.load
export const peekPublicStaffPresence=presence.peek
export const loadPublicStaffPresence=presence.load

/** Warm public-only, read-only lookup data on deliberate navigation intent. */
export function prefetchPublicBookingData():void{
 if(!configured)return
 void Promise.all([loadPublicStaff(),loadPublicBookingPlans(),loadPublicStaffPresence()])
  .catch(()=>{/* The booking page handles errors. */})
}
