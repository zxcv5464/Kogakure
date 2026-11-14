import {useCallback,useEffect,useState} from 'react'
import {CalendarDays,Clock3,RefreshCw,UsersRound} from 'lucide-react'
import {configured} from '../lib/config'
import {useRollingShiftWeeks,shiftDateLabel,SHIFT_WEEKDAYS} from '../lib/shift-calendar'
import {fetchShifts} from '../lib/shifts'
import type {ShiftCalendarData} from '../lib/shifts'
import './shifts-page.css'

const blank:ShiftCalendarData={days:[],attendance:[]}

export default function ShiftsPage(){
 const {today,weeks}=useRollingShiftWeeks()
 const start=weeks[0].start,end=weeks[3].end
 const [calendar,setCalendar]=useState<ShiftCalendarData>(blank)
 const [loading,setLoading]=useState(configured)
 const [error,setError]=useState('')
 const reload=useCallback(async()=>{
  if(!configured)return
  const next=await fetchShifts(start,end)
  setCalendar(next);setError('')
 },[start,end])
 useEffect(()=>{
  if(!configured)return
  let active=true
  setLoading(true)
  fetchShifts(start,end).then(value=>{if(active){setCalendar(value);setError('')}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'排班資訊暫時無法讀取')})
   .finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[start,end])
 const openings=new Map(calendar.days.map(x=>[x.date,x]))
 const members=new Map<string,string[]>()
 for(const entry of calendar.attendance){
  if(!members.has(entry.date))members.set(entry.date,[])
  members.get(entry.date)?.push(entry.name)
 }
 return <section className="shift-page">
  <header className="shift-hero">
   <p className="shift-eyebrow">狐隱 · KOGAKURE</p>
   <span className="shift-ornament" aria-hidden="true">◇</span>
   <h1>狐火值夜曆</h1>
   <p className="shift-hero-sub">營業日曆 · Weekly Attendance</p>
   <p className="shift-intro">四週狐火，靜候有緣旅人。<br/>循著月光，看看哪個夜晚能與館中的狐姬相遇。</p>
   <div className="shift-legend">
    <span><i className="shift-dot is-open"/>營業</span>
    <span><i className="shift-dot is-closed"/>休館</span>
    <span><i className="shift-dot is-unannounced"/>未公告</span>
   </div>
  </header>
  <div className="shift-body">
   <div className="shift-toolbar">
    <p><CalendarDays size={17}/>顯示本週及未來三週 · 每週一自動更新</p>
    <button type="button" disabled={loading||!configured} onClick={()=>{void reload().catch(e=>setError(e instanceof Error?e.message:'更新失敗'))}}><RefreshCw size={16}/>更新排班</button>
   </div>
   {!configured&&<p className="shift-message">目前為離線展示模式，正式營業與出勤資訊請以館方公告為準。</p>}
   {loading&&<p role="status" className="shift-message">狐火正在照亮四週值夜曆…</p>}
   {error&&<p role="alert" className="shift-message is-error">排班讀取失敗：{error}。請重新整理。</p>}
   {!loading&&!error&&<div className="shift-weeks">
    {weeks.map((week,index)=><section className="shift-week" key={week.start} aria-label={'第 '+(index+1)+' 週'}>
     <div className="shift-week-heading">
      <span>WEEK {String(index+1).padStart(2,'0')}</span>
      <h2>{shiftDateLabel(week.start)} — {shiftDateLabel(week.end)}</h2>
     </div>
     <div className="shift-days">{week.days.map((date,i)=>{
      const opening=openings.get(date)
      const names=opening?.open?members.get(date)||[]:[]
      const status=!opening?'unannounced':opening.open?'open':'closed'
      return <article className={'shift-day is-'+status+(date===today?' is-today':'')+(date<today?' is-past':'')} key={date}>
       <div className="shift-day-top">
        <div className="shift-day-date"><small>週{SHIFT_WEEKDAYS[i]}</small><strong>{date.slice(-2)}</strong>{date===today&&<em>今日</em>}</div>
        <span className={'shift-status is-'+status}>{status==='open'?'營業':status==='closed'?'休館':'未公告'}</span>
       </div>
       {status==='open'?<div className="shift-day-details">
        {opening?.hours&&<p className="shift-hours"><Clock3 size={13}/>{opening.hours}</p>}
        {opening?.note&&<p className="shift-note">{opening.note}</p>}
        {names.length?<div className="shift-attendees" aria-label="當日出勤人員">
         <p><UsersRound size={13}/> 出勤人員 · {names.length} 位</p>
         <div>{names.map((name,k)=><span key={name+'-'+k}>{name}</span>)}</div>
        </div>:<p className="shift-no-staff">出勤名單待更新</p>}
       </div>:opening?.note?<p className="shift-note">{opening.note}</p>:<p className="shift-no-staff">{status==='closed'?'當日不對外營業':'館方尚未公布營業安排'}</p>}
      </article>
     })}</div>
    </section>)}
   </div>}
   <p className="shift-disclaimer">值班資訊依館方開店日期與館員出勤登記顯示。實際接待、預約與服務內容可能調整，請以最新館內公告為準。</p>
  </div>
 </section>
}
