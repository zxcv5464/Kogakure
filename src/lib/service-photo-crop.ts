/** A non-destructive crop, kept in slideshow order alongside image_urls.
 * x/y are alignment percentages, not destructive pixel coordinates.
 * 0=left/top, 50=center, 100=right/bottom; zoom is 0.5–3.
 * Below 1, show the complete original image (with possible dark margins). */
export type ServicePhotoCrop={x:number;y:number;zoom:number}
export const DEFAULT_SERVICE_CROP:ServicePhotoCrop={x:50,y:50,zoom:1}
export const MIN_SERVICE_CROP_ZOOM=0.5
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
  zoom:Number.isFinite(zoom)?Math.round(clamp(zoom,MIN_SERVICE_CROP_ZOOM,MAX_SERVICE_CROP_ZOOM)*100)/100:1,
 }
}
export function normalizeServiceCrops(value:unknown,count:number):ServicePhotoCrop[]{
 const raw=Array.isArray(value)?value:[]
 return Array.from({length:Math.max(0,Math.min(12,count))},(_,i)=>normalizeServiceCrop(raw[i]))
}

/** The same source framing applies in the admin previews and front carousel.
 * 100% and above preserve the existing cover/crop behavior. Below 100% we
 * switch to contain, so even incompatible image/frame aspect ratios can show
 * the complete original with dark margins instead of losing scenery. */
export function servicePhotoFrameStyle(crop:ServicePhotoCrop){
 const {x,y,zoom}=normalizeServiceCrop(crop)
 const style={
  width:(zoom*100)+'%',
  height:(zoom*100)+'%',
  left:((1-zoom)*x)+'%',
  top:((1-zoom)*y)+'%',
  objectPosition:x+'% '+y+'%',
 }
 return zoom<1?{...style,objectFit:'contain' as const}:style
}

/** The crop region shown on the complete original image in the editor.
 * Frame aspect is the front page's desktop image shape (4:4.7). */
export function servicePhotoSelectionRect(
 imageWidth:number,imageHeight:number,crop:ServicePhotoCrop,
 targetAspect:number=SERVICE_CROP_ASPECT
){
 const {x,y,zoom}=normalizeServiceCrop(crop)
 if(!(imageWidth>0&&imageHeight>0))return {left:0,top:0,width:100,height:100}
 // In full-image mode the entire original is selected, not a cropped box.
 // Image scale and position are represented by the live desktop/mobile preview.
 if(zoom<1)return {left:0,top:0,width:100,height:100}
 const ratio=imageWidth/imageHeight
 const width=100*Math.min(1,targetAspect/ratio)/zoom
 const height=100*Math.min(1,ratio/targetAspect)/zoom
 return {left:(100-width)*x/100,top:(100-height)*y/100,width,height}
}
