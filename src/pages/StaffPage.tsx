import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, UsersRound } from 'lucide-react'
import type { Staff } from '../types'
import StaffCard from '../components/StaffCard'
import StaffDialog from '../components/StaffDialog'
import StaffLoading from '../components/StaffLoading'
import { demoStaff } from '../data/demo'
import { configured } from '../lib/config'
import { getCachedPublicStaff, loadPublicStaff } from '../lib/public-staff'
import { STAFF_PAGE_READY_EVENT } from '../lib/route-events'
import './staff-page.css'
export default function StaffPage(){
 const [staff,setStaff]=useState<Staff[]>(()=>configured?(getCachedPublicStaff()??[]):demoStaff)
 const [loading,setLoading]=useState(()=>configured&&!getCachedPublicStaff())
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState('全部')
 const [opened,setOpened]=useState<Staff|null>(null)
 const close=useCallback(()=>setOpened(null),[])
 useEffect(()=>{if(!configured)return;let mounted=true;loadPublicStaff().then(rows=>{if(mounted)setStaff(rows)}).catch(e=>{if(mounted)setError('無法載入員工資料：'+e.message)}).finally(()=>{if(mounted)setLoading(false)});return()=>{mounted=false}},[])
 useEffect(()=>{if(!loading)window.dispatchEvent(new Event(STAFF_PAGE_READY_EVENT))},[loading])
 const categories=useMemo(()=>['全部',...Array.from(new Set(staff.flatMap(x=>x.services)))],[staff])
 const visible=useMemo(()=>staff.filter(s=>(filter==='全部'||s.services.includes(filter))&&[s.name,s.role,s.tagline,...s.services].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())),[staff,query,filter])
 return <>
 <div className="staff-page">
  <section className="staff-hero">
   <div className="hero-inner">
    <p className="staff-overline">KOGAKURE · CAST</p>
    <h1>狐隱名帖</h1>
    <span className="hero-line" aria-hidden="true"/>
    <p className="hero-description">循狐而入，與狐隱之人相遇。</p>
   </div>
  </section>
  <section className="staff-section container" aria-label="員工名錄">
   <div className="staff-list-heading"><span>接待者名帖</span></div>
   {staff.length>4&&<div className="staff-toolbar">
    <div className="filter-list" role="group" aria-label="依服務篩選">{categories.map(item=><button key={item} type="button" className={item===filter?'selected':''} onClick={()=>setFilter(item)}>{item}</button>)}</div>
    <label className="staff-search"><Search size={18}/><span className="sr-only">搜尋員工</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋姓名或服務..." /></label>
   </div>}
   {error&&<p className="error-message" role="alert">{error}</p>}
   {loading?<StaffLoading/>:visible.length?
    <div className="staff-grid">{visible.map((person,index)=><StaffCard key={person.id} staff={person} index={index} onOpen={setOpened}/>)}</div>:
    <div className="empty-staff"><UsersRound size={28}/><h3>暫無符合條件的人員</h3><p>試著切換其他分類或搜尋條件。</p><button type="button" onClick={()=>{setFilter('全部');setQuery('')}}>清除篩選</button></div>}
   {!configured&&<p className="staff-demo-disclaimer">目前姓名與簡介為版面展示資料，正式資料將於日後更新。</p>}
  </section>
 </div>
  {opened&&<StaffDialog staff={opened} onClose={close}/>}
 </>
}
