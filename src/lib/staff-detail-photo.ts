// Keep a small set of intent-warmed full portraits. Failed requests may retry.
const warmed=new Map<string,HTMLImageElement>()
export function prefetchStaffDetailPhoto(source:string){
 if(!source||typeof Image==='undefined'||warmed.has(source))return
 const image=new Image()
 image.decoding='async'
 image.fetchPriority='low'
 warmed.set(source,image)
 if(warmed.size>8){const oldest=warmed.keys().next().value;if(oldest)warmed.delete(oldest)}
 image.onerror=()=>{if(warmed.get(source)===image)warmed.delete(source)}
 image.src=source
}
