import {useEffect,useRef,useState} from 'react'
import type {ChangeEvent} from 'react'
import {ArrowDown,ArrowUp,Crop,ImagePlus,Trash2,X} from 'lucide-react'
import type {Staff} from '../../types'
import {BOOKING_CARD_RATIO} from '../../lib/staff-crop'
import StaffPhotoCrop from '../../components/StaffPhotoCrop'
import {
 deleteBookingGalleryPhoto,deleteBookingOverlay,moveBookingPhoto,setBookingPhotoDisplayMode,
 updateBookingPhotoCrop,uploadBookingOverlay,uploadBookingPhoto,
} from '../../lib/booking-photos'
import type {BookingPhoto} from '../../lib/booking-photos'
import './booking-photo-manager.css'

type PendingPhoto={id:string;file:File;url:string}
type CropTarget={id:string;source:string;file?:File;photoId?:string}
type Props={
 person:Staff;value:BookingPhoto|null;disabled?:boolean
 onChange:(photo:BookingPhoto)=>void;onDirtyChange?:(dirty:boolean)=>void
}
const validate=(file:File)=>{
 if(!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type))
  throw new Error('僅支援 JPG、PNG、WebP 或 AVIF 圖片')
 if(!file.size||file.size>12*1024*1024)throw new Error('來源圖片不可為空，且不可超過 12 MB')
}
function describe(error:unknown){return error instanceof Error?error.message:'照片操作失敗，請稍後再試'}

export default function BookingPhotoManager({person,value,disabled=false,onChange,onDirtyChange}:Props){
 const [queue,setQueue]=useState<PendingPhoto[]>([])
 const [cropTarget,setCropTarget]=useState<CropTarget|null>(null)
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const urls=useRef<string[]>([])
 const dirtyCallback=useRef(onDirtyChange)
 useEffect(()=>{dirtyCallback.current=onDirtyChange},[onDirtyChange])
 const total=(value?.photos.length||0)+queue.length
 useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url))},[])
 useEffect(()=>{dirtyCallback.current?.(queue.length>0||cropTarget!==null||busy);return()=>dirtyCallback.current?.(false)},[queue.length,cropTarget,busy])

 function addPhotos(event:ChangeEvent<HTMLInputElement>){
  const files=event.currentTarget.files?Array.from(event.currentTarget.files):[]
  event.currentTarget.value=''
  if(!files.length)return
  if(total+files.length>12){setNotice('每位狐姬最多可設定 12 張預約照片，請先移除部分照片。');return}
  try{
   files.forEach(validate)
   const added=files.map(file=>{
    const url=URL.createObjectURL(file);urls.current.push(url)
    return {id:crypto.randomUUID(),file,url}
   })
   setQueue(previous=>[...previous,...added])
   setCropTarget(previous=>previous||{id:added[0].id,source:added[0].url,file:added[0].file})
   setNotice('請逐張圈選新照片的顯示範圍；套用後會直接儲存。')
  }catch(error){setNotice(describe(error))}
 }
 function editCrop(photoId:string,source:string){
  setCropTarget({id:photoId,photoId,source});setNotice('')
 }
 function removePending(id:string){
  const photo=queue.find(item=>item.id===id)
  if(photo){URL.revokeObjectURL(photo.url);urls.current=urls.current.filter(url=>url!==photo.url)}
  setQueue(previous=>previous.filter(item=>item.id!==id))
  setCropTarget(previous=>previous?.id===id?null:previous)
 }
 async function applyCrop(crop:import('../../lib/staff-crop').StaffCrop){
  const target=cropTarget
  if(!target||busy)return
  setBusy(true);setNotice('')
  try{
   let updated:BookingPhoto
   if(target.file){
    updated=await uploadBookingPhoto(person.id,target.file,crop)
    onChange(updated)
    const nextQueue=queue.filter(item=>item.id!==target.id)
    const staged=queue.find(item=>item.id===target.id)
    if(staged){URL.revokeObjectURL(staged.url);urls.current=urls.current.filter(url=>url!==staged.url)}
    setQueue(nextQueue)
    const next=nextQueue[0]
    setCropTarget(next?{id:next.id,source:next.url,file:next.file}:null)
    setNotice('已新增預約照片。')
   }else if(target.photoId){
    updated=await updateBookingPhotoCrop(person.id,target.photoId,crop)
    onChange(updated);setCropTarget(null);setNotice('已更新這張預約照片的取景範圍。')
   }
  }catch(error){setNotice(describe(error))}
  finally{setBusy(false)}
 }
 async function removePhoto(photoId:string){
  if(busy||!window.confirm('確定刪除這張預約照片？此操作不會影響名帖照片。'))return
  setBusy(true);setNotice('')
  try{onChange(await deleteBookingGalleryPhoto(person.id,photoId));setNotice('預約照片已刪除。')}
  catch(error){setNotice(describe(error))}
  finally{setBusy(false)}
 }
 async function reorder(photoId:string,direction:-1|1){
  if(busy)return
  setBusy(true);setNotice('')
  try{onChange(await moveBookingPhoto(person.id,photoId,direction))}
  catch(error){setNotice(describe(error))}
  finally{setBusy(false)}
 }
 async function changeMode(mode:'single'|'gallery'){
  if(busy||mode===(value?.displayMode||'single'))return
  setBusy(true);setNotice('')
  try{onChange(await setBookingPhotoDisplayMode(person.id,mode));setNotice('預約照片顯示方式已更新。')}
  catch(error){setNotice(describe(error))}
  finally{setBusy(false)}
 }
 async function addOverlay(event:ChangeEvent<HTMLInputElement>){
  const file=event.currentTarget.files?.[0]
  event.currentTarget.value=''
  if(!file||busy)return
  setBusy(true);setNotice('')
  try{validate(file);onChange(await uploadBookingOverlay(person.id,file));setNotice('右下角副圖片已更新。')}
  catch(error){setNotice(describe(error))}
  finally{setBusy(false)}
 }
 async function removeOverlay(){
  if(busy||!value?.secondaryImageUrl||!window.confirm('確定刪除右下角副圖片？'))return
  setBusy(true);setNotice('')
  try{onChange(await deleteBookingOverlay(person.id));setNotice('右下角副圖片已刪除。')}
  catch(error){setNotice(describe(error))}
  finally{setBusy(false)}
 }
 return <section className="booking-gallery-manager" aria-label={person.name+'的預約照片管理'}>
  <div className="booking-gallery-manager-head">
   <div><strong>預約主照片相簿</strong><small>最多 12 張；每張都能獨立圈選取景範圍，與名帖照片完全分開。</small></div>
   <label className={'booking-gallery-add'+(disabled||busy?' is-disabled':'')}>
    <ImagePlus size={16}/>新增照片（可多選）
    <input type="file" multiple disabled={disabled||busy} accept="image/jpeg,image/png,image/webp,image/avif"
     aria-label={'新增 '+person.name+' 的預約照片'} onChange={addPhotos}/>
   </label>
  </div>
  <label className="booking-gallery-mode">前台照片顯示
   <select value={value?.displayMode||'single'} disabled={disabled||busy}
    onChange={event=>void changeMode(event.target.value as 'single'|'gallery')}>
    <option value="single">單張顯示（只顯示第一張）</option>
    <option value="gallery">多張輪播（神祕揭幕＋分頁點）</option>
   </select>
  </label>
  <div className="booking-gallery-grid">
   {(value?.photos||[]).map((photo,index)=><article key={photo.id} className="booking-gallery-item">
    <img src={photo.thumbnailUrl||photo.imageUrl} alt={'預約照片第 '+(index+1)+' 張'} loading="lazy"/>
    <strong>第 {index+1} 張</strong>
    <div>
     <button type="button" disabled={disabled||busy||index===0} onClick={()=>void reorder(photo.id,-1)} aria-label={"將預約照片第 "+(index+1)+" 張上移"} title="上移"><ArrowUp size={15}/></button>
     <button type="button" disabled={disabled||busy} onClick={()=>editCrop(photo.id,photo.imageUrl)} aria-label={"調整預約照片第 "+(index+1)+" 張取景範圍"} title="取景"><Crop size={15}/></button>
     <button type="button" disabled={disabled||busy} className="is-delete" onClick={()=>void removePhoto(photo.id)} aria-label={"刪除預約照片第 "+(index+1)+" 張"} title="刪除"><Trash2 size={15}/></button>
     <button type="button" disabled={disabled||busy||index===(value?.photos.length||0)-1} onClick={()=>void reorder(photo.id,1)} aria-label={"將預約照片第 "+(index+1)+" 張下移"} title="下移"><ArrowDown size={15}/></button>
    </div>
   </article>)}
   {queue.map((photo,index)=><article key={photo.id} className="booking-gallery-item is-pending">
    <img src={photo.url} alt={'待新增預約照片 '+(index+1)} loading="lazy"/>
    <strong>待新增 · {photo.file.name}</strong>
    <div><button type="button" disabled={disabled||busy} onClick={()=>setCropTarget({id:photo.id,source:photo.url,file:photo.file})} aria-label={"調整待新增預約照片 "+(index+1)+" 取景範圍"} title="取景"><Crop size={15}/></button>
     <button type="button" disabled={disabled||busy} className="is-delete" onClick={()=>removePending(photo.id)} aria-label={"移除待新增預約照片 "+(index+1)} title="移除"><X size={15}/></button></div>
   </article>)}
  </div>
  {!value?.photos.length&&!queue.length&&<p className="booking-gallery-empty">尚未設定預約主照片，前台將顯示預設圖示。</p>}
  <div className="booking-gallery-overlay-editor">
   <div className="booking-gallery-overlay-preview">
    <strong>右下角副圖片</strong>
    <small>可上傳透明背景貼圖，會浮在主照片右下角。</small>
    {value?.secondaryImageUrl?<img src={value.secondaryImageUrl} alt="目前預約副圖片"/>:<span>尚未設定副圖片</span>}
   </div>
   <div className="booking-gallery-overlay-actions">
    <label className={'booking-gallery-add'+(disabled||busy?' is-disabled':'')}>
     <ImagePlus size={15}/>{value?.secondaryImageUrl?'更換副圖片':'新增副圖片'}
     <input type="file" disabled={disabled||busy} accept="image/jpeg,image/png,image/webp,image/avif"
      aria-label={'上傳 '+person.name+' 的預約副圖片'} onChange={addOverlay}/>
    </label>
    <button type="button" className="is-delete" disabled={disabled||busy||!value?.secondaryImageUrl}
     onClick={()=>void removeOverlay()}><Trash2 size={15}/>刪除副圖片</button>
   </div>
  </div>
  {notice&&<p className="booking-gallery-notice" role="status">{notice}</p>}
  {cropTarget&&<div className="booking-gallery-crop">
   <StaffPhotoCrop key={cropTarget.id+cropTarget.source} source={cropTarget.source} title="指名" aspectRatio={BOOKING_CARD_RATIO} previewShape="rectangle"
    onConfirm={crop=>void applyCrop(crop)} onCancel={()=>setCropTarget(null)}/>
  </div>}
 </section>
}
