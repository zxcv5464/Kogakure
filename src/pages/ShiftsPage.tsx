import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {CalendarDays,Clock3,RefreshCw,UsersRound,Sparkles,ArrowRight,CalendarCheck2} from 'lucide-react'
import {configured} from '../lib/config'
import {useRollingShiftWeeks,shiftDateLabel,SHIFT_WEEKDAYS} from '../lib/shift-calendar'
import {loadPublicShifts,peekPublicShifts} from '../lib/public-shifts'
import {SHIFT_PAGE_READY_EVENT} from '../lib/route-events'
import type {ShiftAttendance,ShiftCalendarData} from '../lib/shifts'
import ShiftPortrait from '../components/ShiftPortrait'
import './shifts-page.css'

const blank:ShiftCalendarData={days:[],attendance:[]}
type DayState='open'|'closed'
const stateLabel:Record<DayState,string>={open:'營業',closed:'休館'}

export default function ShiftsPage(){
 const {today,weeks}=useRollingShiftWeeks()
 const start=weeks[0].start,end=weeks[3].end
 // Keep a previous visitor snapshot on screen while its 45-second freshness
 // window expires. An empty but successfully loaded 4-week schedule is valid.
 const [calendar,setCalendar]=useState<ShiftCalendarData>(()=>peekPublicShifts(start,end)??blank)
 const [hasSnapshot,setHasSnapshot]=useState(()=>peekPublicShifts(start,end)!==null)
 const [loading,setLoading]=useState(()=>configured&&peekPublicShifts(start,end)===null)
 const [refreshing,setRefreshing]=useState(false)
 const [error,setError]=useState('')
 const [selectedDate,setSelectedDate]=useState(today)
 const detailRef=useRef<HTMLElement>(null)
 // The route curtain should reveal a fully laid-out 28-day calendar, not the
 // blank suspense fallback or a sudden calendar insertion after the fetch.
 useEffect(()=>{
  let one=0,two=0
  one=window.requestAnimationFrame(()=>{
   two=window.requestAnimationFrame(()=>window.dispatchEvent(new Event(SHIFT_PAGE_READY_EVENT)))
  })
  return()=>{window.cancelAnimationFrame(one);window.cancelAnimationFrame(two)}
 },[])
 const latestRequest=useRef(0)
 const reload=useCallback(async()=>{
  if(!configured)return
  const request=++latestRequest.current
  setRefreshing(true)
  try{
   // Unlike background prefetch, the user's update action forces a new read.
   const next=await loadPublicShifts(start,end,{force:true})
   if(request===latestRequest.current){
    setCalendar(next);setHasSnapshot(true);setError('')
   }
  }catch(e){
   if(request===latestRequest.current)
    setError(e instanceof Error?e.message:'更新失敗')
  }finally{
   if(request===latestRequest.current)setRefreshing(false)
  }
 },[start,end])
 useEffect(()=>{
  if(!configured)return
  let active=true
  const request=++latestRequest.current
  const snapshot=peekPublicShifts(start,end)
  if(snapshot){
   setCalendar(snapshot);setHasSnapshot(true);setLoading(false)
  }else{
   setCalendar(blank);setHasSnapshot(false);setLoading(true)
  }
  setError('')
  loadPublicShifts(start,end).then(value=>{
   if(active&&request===latestRequest.current){
    setCalendar(value);setHasSnapshot(true);setError('')
   }
  }).catch(e=>{
   if(active&&request===latestRequest.current)
    setError(e instanceof Error?e.message:'排班資訊暫時無法讀取')
  }).finally(()=>{
   if(active&&request===latestRequest.current)setLoading(false)
  })
  return()=>{active=false}
 },[start,end])
 useEffect(()=>{
  if(selectedDate<start||selectedDate>end)setSelectedDate(today)
 },[selectedDate,start,end,today])
 // Changing the selected day should not rebuild maps and re-count the full
 // schedule; derive these only when new public shift data actually arrives.
 const {openings,members,openingCount,activityCount}=useMemo(()=>{
  const openings=new Map(calendar.days.map(x=>[x.date,x]))
  const members=new Map<string,ShiftAttendance[]>()
  for(const entry of calendar.attendance){
   if(!members.has(entry.date))members.set(entry.date,[])
   members.get(entry.date)?.push(entry)
  }
  return {
   openings,members,
   openingCount:calendar.days.filter(day=>day.open).length,
   activityCount:calendar.days.filter(day=>day.open&&day.eventTitle.trim()).length,
  }
 },[calendar])
 // Keep the same calendar DOM mounted even before the first Supabase response;
 // never label unknown opening days as closed while the first read is pending.
 const unavailable=configured&&!hasSnapshot
 const unavailableLabel=loading?'讀取中':'暫無資料'
 const selectedOpening=openings.get(selectedDate)
 const selectedStatus:DayState=selectedOpening?.open?'open':'closed'
 const selectedPeople=selectedOpening?.open?members.get(selectedDate)||[]:[]
 const dayNumber=weeks.flatMap(week=>week.days).indexOf(selectedDate)
 const selectedWeekday=dayNumber>=0?SHIFT_WEEKDAYS[dayNumber%7]:''
 function selectDate(date:string){
  setSelectedDate(date)
  window.requestAnimationFrame(()=>{
   detailRef.current?.focus({preventScroll:true})
   detailRef.current?.scrollIntoView({
    behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
    block:'nearest'
   })
  })
 }
 return <section className="shift-page">
  <header className="shift-hero">
   <p className="shift-eyebrow">狐隱 · KOGAKURE</p>
   <span className="shift-ornament" aria-hidden="true">◇</span>
   <h1>狐火值夜曆</h1>
   <p className="shift-hero-sub">四週營業月曆 · Opening Calendar</p>
   <p className="shift-intro">循著月光，挑選一個適合造訪狐隱的夜晚。<br/>先看營業日與活動，再點日期查看當晚接待的狐姬。</p>
  </header>
  <div className="shift-body">
   <div className="shift-toolbar">
    <p><CalendarDays size={17}/>本週與未來三週 · 每週一更新</p>
    <button type="button" disabled={loading||refreshing||!configured} onClick={()=>{void reload()}}><RefreshCw size={16}/>{refreshing?'更新中…':'更新排班'}</button>
   </div>
   {!configured&&<p className="shift-message">目前為離線展示模式，正式營業與出勤資訊請以館方公告為準。</p>}
   {error&&<p role="alert" className="shift-message is-error">排班讀取失敗：{error}。請點選「更新排班」再試一次。</p>}
   <>
    <section className="shift-calendar-shell" aria-label="四週營業月曆" aria-busy={unavailable}>
     <div className="shift-calendar-heading">
      <div><span>FOUR-WEEK CALENDAR</span><h2>{shiftDateLabel(start)} — {shiftDateLabel(end)}</h2></div>
      <div className="shift-calendar-stats" aria-label="四週營業摘要">
       <span><strong>{unavailable?'—':openingCount}</strong> 日營業</span>
       <span><strong>{unavailable?'—':activityCount}</strong> 場活動</span>
      </div>
     </div>
     <div className="shift-legend" aria-label="月曆圖例">
      <span><i className="shift-dot is-open"/>營業・可查看名單</span>
      <span><i className="shift-dot is-closed"/>休館</span>
      
      <span><i className="shift-dot is-today"/>今天</span>
     </div>
     <p className="shift-calendar-instruction" role="status" aria-live="polite">{unavailable?'狐火正在照亮四週值夜曆…':'選擇日期，即可查看當天的營業時間、活動與出勤人員。'}</p>
     <div className="shift-calendar-weekdays" aria-hidden="true">
      {SHIFT_WEEKDAYS.map(weekday=><span key={weekday}>週{weekday}</span>)}
     </div>
     <div className="shift-weeks">
      {weeks.map((week,index)=><div className="shift-week" key={week.start} aria-label={'第 '+(index+1)+' 週，'+shiftDateLabel(week.start)+' 至 '+shiftDateLabel(week.end)}>
       {week.days.map((date,i)=>{
        const opening=openings.get(date)
        const names=opening?.open?members.get(date)||[]:[]
        const status:DayState=opening?.open?'open':'closed'
        const isToday=date===today
        return <button type="button" key={date}
         className={'shift-day is-'+status+(unavailable?' is-loading':'')+(isToday?' is-today':'')+(date<today?' is-past':'')+(selectedDate===date?' is-selected':'')}
         aria-label={unavailable?date+' 週'+SHIFT_WEEKDAYS[i]+'，'+unavailableLabel:date+' 週'+SHIFT_WEEKDAYS[i]+'，'+stateLabel[status]+(status==='open'&&opening?.hours?'，'+opening.hours:'')+(status==='open'&&opening?.eventTitle?'，活動：'+opening.eventTitle:'')+'，查看詳細資訊'}
         aria-pressed={selectedDate===date} aria-controls="shift-selected-detail" disabled={unavailable}
         onClick={()=>selectDate(date)}>
         <span className="shift-day-top">
          <span className="shift-day-date"><small>{Number(date.slice(5,7))}月</small><strong>{Number(date.slice(8,10))}</strong></span>
          {isToday&&<span className="shift-today-tag">今日</span>}
         </span>
         <span className={'shift-status is-'+(unavailable?'loading':status)}>{unavailable?unavailableLabel:stateLabel[status]}</span>
         {status==='open'&&opening?.eventTitle&&<span className="shift-event-indicator" aria-hidden="true">✦ 活動</span>}
         {status==='open'&&<span className="shift-day-details">
          {opening?.hours&&<span className="shift-hours"><Clock3 size={12}/><span>{opening.hours}</span></span>}
          {opening?.eventTitle&&<span className="shift-event"><Sparkles size={12}/><span>{opening.eventTitle}</span></span>}
          <span className="shift-attendance-count"><UsersRound size={12}/>{names.length>0?names.length+' 位出勤':'名單待更新'}</span>
         </span>}
         {status!=='open'&&<span className="shift-day-muted">{unavailable?'等候排班資訊':'暫停接待'}</span>}
        </button>
       })}
      </div>)}
     </div>
    </section>
    <section id="shift-selected-detail" className="shift-selected-detail" ref={detailRef}
     tabIndex={-1} aria-labelledby="shift-detail-title">
     <div className="shift-selected-heading">
      <div>
       <span className="shift-detail-kicker">SELECTED DATE · 當日資訊</span>
       <h2 id="shift-detail-title">{selectedDate.slice(0,4)} 年 {Number(selectedDate.slice(5,7))} 月 {Number(selectedDate.slice(8,10))} 日 <small>週{selectedWeekday}</small></h2>
      </div>
      <span className={'shift-detail-state is-'+(unavailable?'loading':selectedStatus)}>{unavailable?unavailableLabel:stateLabel[selectedStatus]}</span>
     </div>
     {unavailable?<div className="shift-detail-empty shift-detail-pending" role="status">
      <CalendarCheck2 size={27}/>
      <p>{loading?'當日資料正在讀取中，完成後便能查看狐姬出勤名單。':'排班資料暫時無法取得，請按「更新排班」重新載入。'}</p>
     </div>:selectedStatus==='open'?<div className="shift-detail-content">
      <div className="shift-detail-facts">
       <div className="shift-detail-fact"><Clock3 size={20}/><div><span>營業時間</span><strong>{selectedOpening?.hours||'營業時段請依館方公告'}</strong></div></div>
       {selectedOpening?.eventTitle&&<div className="shift-detail-fact is-event"><Sparkles size={20}/><div><span>當日特別活動</span><strong>{selectedOpening.eventTitle}</strong></div></div>}
       {selectedOpening?.note&&<p className="shift-detail-note">館方備註：{selectedOpening.note}</p>}
      </div>
      <div className="shift-detail-roster">
       <h3><UsersRound size={18}/>當晚出勤狐姬 <span>{selectedPeople.length} 位</span></h3>
       {selectedPeople.length?<div className="shift-attendees" aria-label="當日出勤人員">
        {selectedPeople.map(person=><div className="shift-attendee" key={person.source+':'+person.employeeId}>
         <ShiftPortrait name={person.name} url={person.imageUrl}/><span>{person.name}</span>
        </div>)}
       </div>:<p className="shift-no-staff">出勤名單尚待公布，請留意後續更新。</p>}
      </div>
      <Link className="shift-booking-link" to="/booking">查看預約方式 <ArrowRight size={16}/></Link>
     </div>:<div className="shift-detail-empty">
      <CalendarCheck2 size={27}/>
      <p>這一天為休館日，暫不對外接待。</p>
      {selectedOpening?.note&&<p className="shift-detail-note">{selectedOpening.note}</p>}
     </div>}
    </section>
   </>
   <p className="shift-disclaimer">月曆依台灣時間顯示，並於每週一更新四週範圍。未設定營業的日期預設為「休館」，只有標示「營業」的日期代表館方已公告開店；出勤名單與活動安排可能調整，實際接待與預約仍以最新公告為準。</p>
  </div>
 </section>
}
