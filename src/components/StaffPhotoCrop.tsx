import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, CSSProperties, SyntheticEvent } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import {
 STAFF_CARD_RATIO, cropScale, defaultStaffCrop, moveStaffCrop, resizeStaffCrop,
} from '../lib/staff-crop'
import type { StaffCrop } from '../lib/staff-crop'
import './staff-photo-crop.css'

type Props={source:string;onConfirm:(crop:StaffCrop)=>void;onCancel:()=>void}
export default function StaffPhotoCrop({source,onConfirm,onCancel}:Props){
 const [size,setSize]=useState<{width:number;height:number}|null>(null)
 const [crop,setCrop]=useState<StaffCrop|null>(null)
 const [failure,setFailure]=useState('')
 const image=useRef<HTMLImageElement>(null)
 const drag=useRef<{x:number;y:number;crop:StaffCrop}|null>(null)
 useEffect(()=>{setSize(null);setCrop(null);setFailure('');drag.current=null},[source])

 function ready(event:SyntheticEvent<HTMLImageElement>){
  const el=event.currentTarget
  if(!el.naturalWidth||!el.naturalHeight){setFailure('圖片尺寸無效，請重新選擇');return}
  setSize({width:el.naturalWidth,height:el.naturalHeight})
  setCrop(defaultStaffCrop(el.naturalWidth,el.naturalHeight))
 }
 function pointerDown(event:PointerEvent<HTMLDivElement>){
  if(!crop||event.button!==0)return
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  drag.current={x:event.clientX,y:event.clientY,crop}
 }
 function pointerMove(event:PointerEvent<HTMLDivElement>){
  if(!drag.current||!image.current)return
  const rect=image.current.getBoundingClientRect()
  if(!rect.width||!rect.height)return
  setCrop(moveStaffCrop(drag.current.crop,
   (event.clientX-drag.current.x)/rect.width,
   (event.clientY-drag.current.y)/rect.height))
 }
 function pointerUp(event:PointerEvent<HTMLDivElement>){
  drag.current=null
  if(event.currentTarget.hasPointerCapture(event.pointerId))
   event.currentTarget.releasePointerCapture(event.pointerId)
 }
 const slider=size&&crop?Math.round(cropScale(crop,size.width,size.height)*100):100
 return <section className="staff-crop-workspace" aria-label="名冊圖片範圍圈選">
  <div className="staff-crop-heading">
   <div><h4>自訂名冊照片顯示範圍</h4><p>拖曳金色選取框來移動照片範圍，使用縮放調整畫面大小。卡片將完整呈現你圈選的範圍，不再自行放大裁切。</p></div>
   <button className="staff-crop-close" type="button" onClick={onCancel} aria-label="取消範圍圈選"><X size={18}/></button>
  </div>
  {failure&&<p className="staff-crop-error" role="alert">{failure}</p>}
  <div className="staff-crop-layout">
   <div className="staff-crop-stage">
    <div className="staff-crop-image-wrap">
     <img ref={image} src={source} alt="照片原圖，請在上方圈選要展示的範圍" onLoad={ready} onError={()=>setFailure('無法載入照片，請重新上傳原始圖片')} draggable={false}/>
     {crop&&size&&<div className="staff-crop-selection" role="img" aria-label="可拖曳的名冊照片圈選範圍"
      style={{left:(crop.x*100)+'%',top:(crop.y*100)+'%',width:(crop.width*100)+'%',height:(crop.height*100)+'%'}}
      onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <span className="staff-crop-grid-lines" aria-hidden="true"/>
      <span className="staff-crop-handle" aria-hidden="true"/>
     </div>}
    </div>
   </div>
   <div className="staff-crop-controls">
    <p className="staff-crop-side-title">名冊卡片預覽</p>
    <div className="staff-crop-card-preview" style={{aspectRatio:String(STAFF_CARD_RATIO)}}>
     {crop&&<img src={source} alt="目前圈選範圍的實際卡片預覽" draggable={false}
      style={{
       width:(100/crop.width)+'%',
       height:(100/crop.height)+'%',
       left:(-crop.x/crop.width*100)+'%',
       top:(-crop.y/crop.height*100)+'%',
      } as CSSProperties}/>}
     <span className="staff-crop-preview-mask" aria-hidden="true"/>
    </div>
    <label className="staff-crop-zoom">顯示範圍 <strong>{slider}%</strong>
     <input type="range" min={25} max={100} step={1} value={slider}
      disabled={!crop||!size} onChange={e=>{
       if(size&&crop)setCrop(resizeStaffCrop(crop,Number(e.target.value)/100,size.width,size.height))
      }}/>
    </label>
    <div className="staff-crop-controls-actions">
     <button type="button" className="staff-crop-reset" disabled={!size} onClick={()=>{
      if(size)setCrop(defaultStaffCrop(size.width,size.height))
     }}><RotateCcw size={16}/>重設</button>
     <button type="button" className="staff-crop-confirm" disabled={!crop||!!failure}
      onClick={()=>{if(crop&&!failure)onConfirm(crop)}}><Check size={17}/>套用這個範圍</button>
    </div>
    <small>套用後仍需按「儲存名帖」才會更新前台與 Supabase；原始照片會保留。</small>
   </div>
  </div>
 </section>
}
