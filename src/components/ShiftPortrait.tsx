import {useEffect,useState} from 'react'
import {UserRound} from 'lucide-react'
import './shift-portrait.css'

/** A missing or removed shift photo never hides its person's name. */
export default function ShiftPortrait({name,url}:{name:string;url?:string}){
 const [failed,setFailed]=useState(false)
 useEffect(()=>setFailed(false),[url])
 return <span className="shift-person-portrait" aria-hidden="true">
  {url&&!failed?<img src={url} alt="" loading="lazy" decoding="async"
   onError={()=>setFailed(true)}/>:<UserRound size={17} strokeWidth={1.6}/>}
 </span>
}
