import {useEffect,useRef,useState} from 'react'
import type {PointerEvent} from 'react'
import {createPortal} from 'react-dom'
import ScrollCue from '../../components/ScrollCue'
import {Check,RotateCcw,X} from 'lucide-react'
import {
 DEFAULT_SERVICE_CROP,normalizeServiceCrop,servicePhotoFrameStyle,
 servicePhotoSelectionRect,
} from '../../lib/service-photo-crop'
import type {ServicePhotoCrop} from '../../lib/service-photo-crop'

type Props={
 photoUrl:string;photoNumber:number;initialCrop:ServicePhotoCrop
 onApply:(crop:ServicePhotoCrop)=>void;onCancel:()=>void
}

/** Edit the non-destructive visible frame, not the uploaded original.
 * Dragging moves the gold desktop crop box; zoom resizes it. The mobile
 * landscape preview uses the same saved alignment in its own aspect ratio. */
export default function ServicePhotoCropEditor({
 photoUrl,photoNumber,initialCrop,onApply,onCancel,
}:Props){
 const [crop,setCrop]=useState<ServicePhotoCrop>(()=>normalizeServiceCrop(initialCrop))
 const [natural,setNatural]=useState({width:0,height:0})
 const [photoFailed,setPhotoFailed]=useState(false)
 const dragging=useRef(false)
 const closeRef=useRef<HTMLButtonElement>(null)
 const rect=servicePhotoSelectionRect(natural.width,natural.height,crop)
 const frameStyle=servicePhotoFrameStyle(crop)

 useEffect(()=>{
  const previousOverflow=document.body.style.overflow
  const previousFocus=document.activeElement
  document.body.style.overflow='hidden'
  closeRef.current?.focus({preventScroll:true})
  const handleKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();onCancel()}
   if(event.key==='Tab'){
    const dialog=document.querySelector<HTMLElement>('.service-admin-crop-dialog')
    if(!dialog)return
    const focusable=Array.from(dialog.querySelectorAll<HTMLElement>(
     'button:not(:disabled),input:not(:disabled)'
    ))
    const first=focusable[0],last=focusable[focusable.length-1]
    if(!first||!last)return
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
   }
  }
  document.addEventListener('keydown',handleKey)
  return()=>{
   document.body.style.overflow=previousOverflow
   document.removeEventListener('keydown',handleKey)
   if(previousFocus instanceof HTMLElement)previousFocus.focus({preventScroll:true})
  }
 },[onCancel])

 function moveSelection(event:PointerEvent<HTMLDivElement>){
  if(!natural.width||!natural.height)return
  const bounds=event.currentTarget.getBoundingClientRect()
  if(!(bounds.width>0&&bounds.height>0))return
  const pointX=((event.clientX-bounds.left)/bounds.width)*100
  const pointY=((event.clientY-bounds.top)/bounds.height)*100
  // x/y describe the available movement, so the selection never extends
  // outside the original image, even at maximum zoom.
  setCrop(prev=>normalizeServiceCrop({
   ...prev,
   x:rect.width>=99.99?50:((pointX-rect.width/2)/(100-rect.width))*100,
   y:rect.height>=99.99?50:((pointY-rect.height/2)/(100-rect.height))*100,
  }))
 }
 function pointerDown(event:PointerEvent<HTMLDivElement>){
  if(event.button!==0||!natural.width||!natural.height)return
  dragging.current=true
  event.currentTarget.setPointerCapture(event.pointerId)
  moveSelection(event)
 }
 function pointerMove(event:PointerEvent<HTMLDivElement>){
  if(dragging.current)moveSelection(event)
 }
 function pointerUp(event:PointerEvent<HTMLDivElement>){
  dragging.current=false
  if(event.currentTarget.hasPointerCapture(event.pointerId))
   event.currentTarget.releasePointerCapture(event.pointerId)
 }

 return createPortal(<div className="service-admin-crop-backdrop">
  <section className="service-admin-crop-dialog" role="dialog" aria-modal="true"
   aria-labelledby="service-crop-title" aria-describedby="service-crop-instructions">
   <div className="service-admin-crop-header">
    <div><p>KOGAKURE · PHOTO FRAMING</p><h2 id="service-crop-title">第 {photoNumber} 張 · 圈選照片顯示範圍</h2></div>
    <button type="button" ref={closeRef} onClick={onCancel} aria-label="關閉照片範圍設定"><X size={20}/></button>
   </div>
   <p id="service-crop-instructions" className="service-admin-crop-instructions">
    拖曳金色選取框，調整想呈現的區域；使用縮放調整框線大小。右側會即時預覽前台效果，原始照片不會被裁切或覆蓋。
   </p>
   <div className="service-admin-crop-grid">
    <div className="service-admin-crop-source">
     <h3>原始照片 · 可拖曳圈選</h3>
     <div className="service-admin-crop-source-scroller">
      <div className="service-admin-crop-original"
       style={{
        aspectRatio:natural.width&&natural.height?natural.width+'/'+natural.height:'4/3',
        width:natural.width&&natural.height
         ?'min(100%, '+Math.round(320*natural.width/natural.height)+'px)'
         :'min(100%, 440px)',
       }}
       onPointerDown={pointerDown} onPointerMove={pointerMove}
       onPointerUp={pointerUp} onPointerCancel={pointerUp}
       aria-label="原圖與可拖曳的金色圈選框">
       <img src={photoUrl} alt="供選擇顯示範圍的完整原始照片"
        draggable={false}
        onLoad={event=>{
         const image=event.currentTarget
         setNatural({width:image.naturalWidth,height:image.naturalHeight})
         setPhotoFailed(false)
        }}
        onError={()=>setPhotoFailed(true)}/>
       {!!natural.width&&<span className="service-admin-crop-selection"
        style={{left:rect.left+'%',top:rect.top+'%',width:rect.width+'%',height:rect.height+'%'}} aria-hidden="true">
        <span className="service-admin-crop-crosshair"/>
       </span>}
      </div>
     </div>
     {photoFailed&&<p className="service-admin-crop-load-error" role="alert">圖片載入失敗，請檢查照片連結。</p>}
     <div className="service-admin-crop-controls">
      <label>取景縮放 <strong>{Math.round(crop.zoom*100)}%</strong>
       <input type="range" min="1" max="3" step="0.05" value={crop.zoom}
        onChange={event=>setCrop(prev=>normalizeServiceCrop({...prev,zoom:Number(event.target.value)}))}/>
      </label>
      <label>水平位置 <strong>{Math.round(crop.x)}%</strong>
       <input type="range" min="0" max="100" step="1" value={crop.x}
        onChange={event=>setCrop(prev=>({...prev,x:Number(event.target.value)}))}/>
      </label>
      <label>垂直位置 <strong>{Math.round(crop.y)}%</strong>
       <input type="range" min="0" max="100" step="1" value={crop.y}
        onChange={event=>setCrop(prev=>({...prev,y:Number(event.target.value)}))}/>
      </label>
     </div>
    </div>
    <div className="service-admin-crop-previews">
     <h3>前台顯示預覽</h3>
     <p>桌機服務照片（直幅）</p>
     <div className="service-admin-crop-preview is-desktop"><img src={photoUrl} style={frameStyle} alt="桌機版服務照片裁切預覽"/></div>
     <p>手機服務照片（橫幅）</p>
     <div className="service-admin-crop-preview is-mobile"><img src={photoUrl} style={frameStyle} alt="手機版服務照片裁切預覽"/></div>
     <small>各裝置會依照片容器比例自動填滿；此設定會保留同一個取景焦點。</small>
    </div>
   </div>
   <div className="service-admin-crop-actions">
    <button type="button" className="is-reset" onClick={()=>setCrop({...DEFAULT_SERVICE_CROP})}>
     <RotateCcw size={16}/>還原置中
    </button>
    <div>
     <button type="button" className="is-cancel" onClick={onCancel}>取消</button>
     <button type="button" className="is-apply" onClick={()=>onApply(normalizeServiceCrop(crop))}>
      <Check size={17}/>套用顯示範圍
     </button>
    </div>
   </div>
   <p className="service-admin-crop-save-note">套用後仍需返回編輯頁面點選「儲存服務」，才會正式更新前台照片範圍。</p>
   <ScrollCue/>
  </section>
 </div>,document.body)
}
