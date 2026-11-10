import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal, UsersRound, X } from 'lucide-react'
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
 const [toolsOpen,setToolsOpen]=useState(false)
 const [opened,setOpened]=useState<Staff|null>(null)
 const close=useCallback(()=>setOpened(null),[])
 useEffect(()=>{if(!configured)return;let mounted=true;loadPublicStaff().then(rows=>{if(mounted)setStaff(rows)}).catch(e=>{if(mounted)setError('無法載入員工資料：'+e.message)}).finally(()=>{if(mounted)setLoading(false)});return()=>{mounted=false}},[])
 useEffect(()=>{if(!loading)window.dispatchEvent(new Event(STAFF_PAGE_READY_EVENT))},[loading])
 const categories=useMemo(()=>['全部',...Array.from(new Set(staff.flatMap(x=>x.services)))],[staff])
 const allowTools=staff.length>=6
 const visible=useMemo(()=>staff.filter(s=>(filter==='全部'||s.services.includes(filter))&&[s.name,s.role,s.tagline,...s.services].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())),[staff,query,filter])
 return <>
 <div className="staff-page">
  <section className="staff-hero">
   <div className="hero-inner">
    <p className="staff-overline">KOGAKURE · CAST</p>
    <h1>狐姬名冊</h1>
    <span className="hero-line" aria-hidden="true"/>
    <p className="hero-description">循狐而入，與狐隱之人相遇。</p>
   </div>
  </section>
  <section className="staff-section container" aria-label="狐姬名冊">
   <div className="staff-list-heading"><span>與狐姬相遇</span></div>
   {allowTools && <div className="staff-catalog-tools">
    <button className={'staff-catalog-toggle' + (toolsOpen ? ' is-open' : '')} type="button" aria-expanded={toolsOpen} aria-controls="staff-catalog-panel" onClick={() => {
     if (toolsOpen) { setQuery(''); setFilter('全部') }
     setToolsOpen(previous => !previous)
    }}><SlidersHorizontal size={15}/><span>尋找狐姬</span><ChevronDown size={15} className="staff-catalog-chevron"/></button>
    {toolsOpen && <div id="staff-catalog-panel" className="staff-catalog-panel" role="search" aria-label="搜尋狐姬名冊">
     <label className="staff-catalog-input"><Search size={17}/><span className="sr-only">搜尋狐姬</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜尋姓名、職稱或服務…" /></label>
     {categories.length>2 && <label className="staff-catalog-select"><span className="sr-only">依服務分類</span><select aria-label="依服務分類" value={filter} onChange={event=>setFilter(event.target.value)}>{categories.map(item=><option key={item} value={item}>{item==='全部'?'所有服務':item}</option>)}</select><ChevronDown size={15}/></label>}
     {(query||filter!=='全部') && <button type="button" className="staff-catalog-reset" onClick={()=>{setQuery('');setFilter('全部')}} aria-label="清除搜尋與篩選"><X size={16}/> 清除</button>}
     <span className="staff-catalog-count">{visible.length} / {staff.length} 位</span>
    </div>}
   </div>}
   {error&&<p className="error-message" role="alert">{error}</p>}
   {loading?<StaffLoading/>:visible.length?
    <div className="staff-grid">{visible.map((person,index)=><StaffCard key={person.id} staff={person} index={index} onOpen={setOpened}/>)}</div>:
    <div className="empty-staff"><UsersRound size={28}/><h3>{staff.length ? '沒有符合條件的狐姬' : '名冊尚在整理中'}</h3><p>{staff.length ? '可以試試其他姓名或服務條件。' : '狐姬們正在準備與你相見。'}</p>{staff.length>0 && <button type="button" onClick={()=>{setFilter('全部');setQuery('')}}>清除篩選</button>}</div>}
   {!configured&&<p className="staff-demo-disclaimer">目前姓名與簡介為版面展示資料，正式資料將於日後更新。</p>}
  </section>
 </div>
  {opened&&<StaffDialog staff={opened} onClose={close}/>}
 </>
}
