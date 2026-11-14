// Normalized source-image crop coordinates; the mask always matches the
// omamori portrait aspect ratio, so the final WebP needs no CSS auto-cropping.
export const STAFF_CARD_RATIO = 0.655
export type StaffCrop = { x:number; y:number; width:number; height:number }
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value))
export function defaultStaffCrop(imageWidth:number,imageHeight:number):StaffCrop{
 if(imageWidth<=0||imageHeight<=0)throw new Error('無效的照片尺寸')
 const imageRatio=imageWidth/imageHeight
 const width=Math.min(1,STAFF_CARD_RATIO/imageRatio)
 const height=Math.min(1,imageRatio/STAFF_CARD_RATIO)
 return {x:(1-width)/2,y:(1-height)/2,width,height}
}
export function moveStaffCrop(crop:StaffCrop,dx:number,dy:number):StaffCrop{
 return {...crop,x:clamp(crop.x+dx,0,1-crop.width),y:clamp(crop.y+dy,0,1-crop.height)}
}
export function resizeStaffCrop(crop:StaffCrop,scale:number,sourceWidth:number,sourceHeight:number):StaffCrop{
 const max=defaultStaffCrop(sourceWidth,sourceHeight)
 const s=clamp(scale,.25,1)
 const width=max.width*s,height=max.height*s
 const centerX=crop.x+crop.width/2,centerY=crop.y+crop.height/2
 return {x:clamp(centerX-width/2,0,1-width),y:clamp(centerY-height/2,0,1-height),width,height}
}
export function cropScale(crop:StaffCrop,sourceWidth:number,sourceHeight:number){
 return crop.width/defaultStaffCrop(sourceWidth,sourceHeight).width
}
export function cropPixels(crop:StaffCrop,sourceWidth:number,sourceHeight:number){
 if(![crop.x,crop.y,crop.width,crop.height,sourceWidth,sourceHeight].every(Number.isFinite)
 ||crop.width<=0||crop.height<=0||sourceWidth<=0||sourceHeight<=0
 ||crop.x<0||crop.y<0||crop.x+crop.width>1.000001||crop.y+crop.height>1.000001){
  throw new Error('照片圈選範圍無效，請重新設定')
 }
 const aspect=(crop.width*sourceWidth)/(crop.height*sourceHeight)
 if(Math.abs(aspect-STAFF_CARD_RATIO)>0.01)throw new Error('圈選比例與名冊卡片不符，請重新設定')
 return {x:crop.x*sourceWidth,y:crop.y*sourceHeight,width:crop.width*sourceWidth,height:crop.height*sourceHeight}
}
