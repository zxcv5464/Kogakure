import {useEffect,useMemo,useState} from 'react'

// Display dates in Asia/Taipei regardless of the traveller's browser locale.
export function taipeiToday(now:Date=new Date()):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
 const take=(type:string)=>parts.find(p=>p.type===type)?.value||''
 return take('year')+'-'+take('month')+'-'+take('day')
}
export function shiftAddDays(date:string,amount:number):string{
 const base=new Date(date+'T00:00:00Z')
 base.setUTCDate(base.getUTCDate()+amount)
 return base.toISOString().slice(0,10)
}
export function shiftWeekStart(date:string):string{
 const weekday=new Date(date+'T00:00:00Z').getUTCDay()
 return shiftAddDays(date,-((weekday+6)%7))
}
export type ShiftWeek={start:string;end:string;days:string[]}
export function rollingShiftWeeks(date:string=taipeiToday()):ShiftWeek[]{
 const first=shiftWeekStart(date)
 return Array.from({length:4},(_,i)=>{
  const start=shiftAddDays(first,i*7)
  const days=Array.from({length:7},(_,j)=>shiftAddDays(start,j))
  return {start,end:days[6],days}
 })
}
export function shiftDateLabel(date:string):string{
 const [,month,day]=date.split('-')
 return Number(month)+'/'+Number(day)
}
export function useRollingShiftWeeks(){
 const [today,setToday]=useState(()=>taipeiToday())
 useEffect(()=>{
  const refresh=()=>setToday(prev=>{const next=taipeiToday();return next===prev?prev:next})
  const interval=window.setInterval(refresh,60000)
  document.addEventListener('visibilitychange',refresh)
  window.addEventListener('focus',refresh)
  return()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh)}
 },[])
 const weeks=useMemo(()=>rollingShiftWeeks(today),[today])
 return {today,weeks}
}
export const SHIFT_WEEKDAYS=['一','二','三','四','五','六','日']
