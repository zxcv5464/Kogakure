// Normalized source-image crop coordinates; the mask always matches the
// omamori portrait aspect ratio, so the final WebP needs no CSS auto-cropping.
export const STAFF_CARD_RATIO = 0.655
export const BOOKING_CARD_RATIO = 0.55
export type StaffCrop = { x:number; y:number; width:number; height:number; aspectRatio?:number }
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value))
export function defaultStaffCrop(imageWidth:number,imageHeight:number,aspectRatio=STAFF_CARD_RATIO):StaffCrop{
 if(imageWidth<=0||imageHeight<=0)throw new Error('無效的照片尺寸')
 const imageRatio=imageWidth/imageHeight
 const width=Math.min(1,aspectRatio/imageRatio)
 const height=Math.min(1,imageRatio/aspectRatio)
 return {x:(1-width)/2,y:(1-height)/2,width,height}
}
export function moveStaffCrop(crop:StaffCrop,dx:number,dy:number):StaffCrop{
 return {...crop,x:clamp(crop.x+dx,0,1-crop.width),y:clamp(crop.y+dy,0,1-crop.height)}
}
export function resizeStaffCrop(crop:StaffCrop,scale:number,sourceWidth:number,sourceHeight:number,aspectRatio=STAFF_CARD_RATIO):StaffCrop{
 const max=defaultStaffCrop(sourceWidth,sourceHeight,aspectRatio)
 const s=clamp(scale,.25,1)
 const width=max.width*s,height=max.height*s
 const centerX=crop.x+crop.width/2,centerY=crop.y+crop.height/2
 return {x:clamp(centerX-width/2,0,1-width),y:clamp(centerY-height/2,0,1-height),width,height}
}
export function cropScale(crop:StaffCrop,sourceWidth:number,sourceHeight:number,aspectRatio=STAFF_CARD_RATIO){
 return crop.width/defaultStaffCrop(sourceWidth,sourceHeight,aspectRatio).width
}
export function cropPixels(crop:StaffCrop,sourceWidth:number,sourceHeight:number,aspectRatio=STAFF_CARD_RATIO){
 if(![crop.x,crop.y,crop.width,crop.height,sourceWidth,sourceHeight].every(Number.isFinite)
 ||crop.width<=0||crop.height<=0||sourceWidth<=0||sourceHeight<=0
 ||crop.x<0||crop.y<0||crop.x+crop.width>1.000001||crop.y+crop.height>1.000001){
  throw new Error('照片圈選範圍無效，請重新設定')
 }
 const aspect=(crop.width*sourceWidth)/(crop.height*sourceHeight)
 if(Math.abs(aspect-aspectRatio)>0.01)throw new Error('圈選比例與照片顯示框不符，請重新設定')
 return {x:crop.x*sourceWidth,y:crop.y*sourceHeight,width:crop.width*sourceWidth,height:crop.height*sourceHeight}
}

// Match the mobile detail photo viewport and the rectangular admin preview.
export const STAFF_MOBILE_DETAIL_RATIO = 4/5
const LEGACY_MOBILE_DETAIL_RATIO = 10/7
export function normalizeStaffCrop(value:unknown):StaffCrop|null{
 if(!value||typeof value!=='object')return null
 const {x,y,width,height,aspectRatio}=value as StaffCrop
 if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>1.000001||y+height>1.000001)return null
 return {x,y,width,height,...(typeof aspectRatio==='number'&&Number.isFinite(aspectRatio)&&aspectRatio>0?{aspectRatio}:{})}
}

// Older mobile crops used a wide 10:7 viewport. Recover the source aspect
// from the saved rectangle and expand vertically around its previous center.
// If the image boundary is reached, slide the crop inward without stretching.
export function reframeMobileStaffCrop(value:StaffCrop|null|undefined):StaffCrop|null{
 const crop=normalizeStaffCrop(value)
 if(!crop)return null
 const oldRatio=crop.aspectRatio||LEGACY_MOBILE_DETAIL_RATIO
 const ratio=STAFF_MOBILE_DETAIL_RATIO
 if(Math.abs(oldRatio-ratio)<1e-9)return {...crop,aspectRatio:ratio}
 const sourceRatio=oldRatio*crop.height/crop.width
 const width=Math.min(crop.width,1,ratio/sourceRatio)
 const height=width*sourceRatio/ratio
 return {x:clamp(crop.x+crop.width/2-width/2,0,Math.max(0,1-width)),
  y:clamp(crop.y+crop.height/2-height/2,0,Math.max(0,1-height)),
  width,height,aspectRatio:ratio}
}
