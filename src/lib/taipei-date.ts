/** Calendar dates are local to the venue (Taipei, UTC+08:00 year-round).
 * Avoid UTC ISO substrings: around midnight they can select yesterday's orders. */
export const TAIPEI_TZ='Asia/Taipei'
export const validVenueDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 !Number.isNaN(Date.parse(value+'T12:00:00+08:00'))&&
 new Date(value+'T12:00:00+08:00').toLocaleDateString('sv-SE',{timeZone:TAIPEI_TZ})===value
export function venueDate(value:Date=new Date()):string{
 const date=new Intl.DateTimeFormat('en-US',{
  timeZone:TAIPEI_TZ,year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(value)
 const get=(type:string)=>date.find(part=>part.type===type)?.value||''
 return get('year')+'-'+get('month')+'-'+get('day')
}
export function shiftVenueDate(value:string,offset:number):string{
 if(!validVenueDate(value)||!Number.isInteger(offset))throw new Error('日期格式不正確')
 return venueDate(new Date(Date.parse(value+'T12:00:00+08:00')+offset*86_400_000))
}
export function venueDayWindow(value:string):{start:string;end:string}{
 if(!validVenueDate(value))throw new Error('請選擇有效的營業日期')
 const next=shiftVenueDate(value,1)
 return {start:value+'T00:00:00+08:00',end:next+'T00:00:00+08:00'}
}
export function validVenueMonth(value:string):boolean{
 return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}
export function venueMonthRange(month:string):{start:string;end:string}{
 if(!validVenueMonth(month))throw new Error('月份格式不正確')
 const [year,m]=month.split('-').map(Number)
 const next=m===12?String(year+1)+'-01':year+'-'+String(m+1).padStart(2,'0')
 return {start:month+'-01',end:next+'-01'}
}
