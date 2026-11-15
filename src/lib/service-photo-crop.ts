/** A non-destructive crop, kept in slideshow order alongside image_urls.
 * x/y are alignment percentages, not destructive pixel coordinates.
 * 0=left/top, 50=center, 100=right/bottom; zoom is 1–3. */
export type ServicePhotoCrop={x:number;y:number;zoom:number}
export const DEFAULT_SERVICE_CROP:ServicePhotoCrop={x:50,y:50,zoom:1}
export const MAX_SERVICE_CROP_ZOOM=3
export const SERVICE_CROP_ASPECT=4/4.7

const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n))
const percent=(value:unknown,defaultValue:number)=>{
 const n=typeof value==='number'?value:NaN
 return Number.isFinite(n)?Math.round(clamp(n,0,100)*100)/100:defaultValue
}
export function normalizeServiceCrop(value:unknown):ServicePhotoCrop{
 if(!value||typeof value!=='object')return {...DEFAULT_SERVICE_CROP}
 const obj=value as Record<string,unknown>
 const zoom=typeof obj.zoom==='number'?obj.zoom:NaN
 return {
  x:percent(obj.x,50),
  y:percent(obj.y,50),
  zoom:Number.isFinite(zoom)?Math.round(clamp(zoom,1,MAX_SERVICE_CROP_ZOOM)*100)/100:1,
 }
}
export function normalizeServiceCrops(value:unknown,count:number):ServicePhotoCrop[]{
 const raw=Array.isArray(value)?value:[]
 return Array.from({length:Math.max(0,Math.min(12,count))},(_,i)=>normalizeServiceCrop(raw[i]))
}

/** The same source framing applies in the admin previews and front carousel.
 * The expanded image box + object-position permit full panning after zoom,
 * unlike transform:scale() on an already object-fit-cropped image. */
export function servicePhotoFrameStyle(crop:ServicePhotoCrop){
 const {x,y,zoom}=normalizeServiceCrop(crop)
 return {
  width:(zoom*100)+'%',
  height:(zoom*100)+'%',
  left:((1-zoom)*x)+'%',
  top:((1-zoom)*y)+'%',
  objectPosition:x+'% '+y+'%',
 }
}

/** The crop region shown on the complete original image in the editor.
 * Frame aspect is the front page's desktop image shape (4:4.7). */
export function servicePhotoSelectionRect(
 imageWidth:number,imageHeight:number,crop:ServicePhotoCrop,
 targetAspect:number=SERVICE_CROP_ASPECT
){
 const {x,y,zoom}=normalizeServiceCrop(crop)
 if(!(imageWidth>0&&imageHeight>0))return {left:0,top:0,width:100,height:100}
 const ratio=imageWidth/imageHeight
 const width=100*Math.min(1,targetAspect/ratio)/zoom
 const height=100*Math.min(1,ratio/targetAspect)/zoom
 return {left:(100-width)*x/100,top:(100-height)*y/100,width,height}
}
