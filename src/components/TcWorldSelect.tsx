import type {ChangeEvent} from 'react'

/** The seven currently listed FFXIV Traditional Chinese edition Worlds.
 * https://www.ffxiv.com.tw/web/worldstatus/index.aspx */
export const TC_WORLDS=[
 '伊弗利特','迦樓羅','利維坦','鳳凰','奧汀','巴哈姆特','泰坦',
] as const

type Props={value:string;onChange:(world:string)=>void;disabled?:boolean}

/** Shared by tea checkout, public nomination, and manual booking. */
export default function TcWorldSelect({value,onChange,disabled=false}:Props){
 function selectWorld(event:ChangeEvent<HTMLSelectElement>){
  onChange(event.target.value)
 }
 return <select required value={value} disabled={disabled} onChange={selectWorld}>
  <option value="">請選擇所在伺服器</option>
  {TC_WORLDS.map(world=><option key={world} value={world}>{world}</option>)}
 </select>
}
