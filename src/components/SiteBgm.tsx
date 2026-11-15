import {useCallback,useEffect,useRef,useState} from 'react'
import {Music2,Play,Volume2,VolumeX} from 'lucide-react'
import './site-bgm.css'

// Official short version of the user-provided "みやびごころ" recording.
// BGMer permits website/commercial BGM use. The audio is streamed from the
// publisher; do not duplicate it in the JS bundle or trigger extra downloads.
const AUDIO_URL='https://bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'
const STORAGE_KEY='kogakure-bgm-enabled-v1'
const DEFAULT_VOLUME=0.24

type Playback='playing'|'blocked'|'off'|'error'
function loadPreference():boolean{
 if(typeof window==='undefined')return true
 try{return window.localStorage.getItem(STORAGE_KEY)!=='off'}
 catch{return true}
}
function storePreference(enabled:boolean){
 try{window.localStorage.setItem(STORAGE_KEY,enabled?'on':'off')}
 catch{/* A private browser may block localStorage. */}
}

export default function SiteBgm(){
 const [enabled,setEnabled]=useState(loadPreference)
 const [playback,setPlayback]=useState<Playback>(enabled?'blocked':'off')
 const audioRef=useRef<HTMLAudioElement>(null)

 const attemptPlay=useCallback(()=>{
  const audio=audioRef.current
  if(!audio)return
  // play() must be called synchronously from a user gesture when autoplay
  // is blocked. A promise rejection is normal in modern browsers.
  audio.volume=DEFAULT_VOLUME
  const request=audio.play()
  if(request){
   void request.then(()=>setPlayback('playing')).catch((error:unknown)=>{
    const name=error instanceof DOMException?error.name:''
    if(name==='NotAllowedError'||name==='AbortError')setPlayback('blocked')
    else setPlayback('error')
   })
  }
 },[])

 useEffect(()=>{
  const audio=audioRef.current
  if(!audio)return
  audio.volume=DEFAULT_VOLUME
  if(enabled)attemptPlay()
  else{audio.pause();setPlayback('off')}
 },[enabled,attemptPlay])

 // Browsers refuse unmuted autoplay until a visitor interacts with the
 // document. Retry once the user intentionally interacts with the page,
 // without overriding a previous choice to turn music off.
 useEffect(()=>{
  if(!enabled||playback==='playing'||playback==='error')return
  function retry(event:MouseEvent|KeyboardEvent){
   const target=event.target
   if(target instanceof Element&&target.closest('.site-bgm-toggle'))return
   attemptPlay()
  }
  document.addEventListener('click',retry)
  document.addEventListener('keydown',retry)
  return()=>{
   document.removeEventListener('click',retry)
   document.removeEventListener('keydown',retry)
  }
 },[enabled,playback,attemptPlay])

 function toggle(){
  if(enabled&&playback==='playing'){
   setEnabled(false)
   storePreference(false)
   audioRef.current?.pause()
   setPlayback('off')
   return
  }
  setEnabled(true)
  storePreference(true)
  attemptPlay()
 }

 const playing=playback==='playing'
 const label=playing?'停止背景音樂':playback==='error'?'重試背景音樂':enabled?'播放背景音樂':'開啟背景音樂'
 const status=playing?'播放中':playback==='error'?'音樂載入失敗':enabled?'點擊播放':'已關閉'
 return <div className="site-bgm" aria-label="背景音樂控制">
  <audio ref={audioRef} src={AUDIO_URL} loop preload="none"
   onPlay={()=>setPlayback('playing')}
   onPause={()=>{if(enabled)setPlayback('blocked')}}
   onError={()=>setPlayback('error')}
   aria-hidden="true"/>
  <button type="button"
   className={'site-bgm-toggle'+(playing?' is-playing':'')+(playback==='blocked'?' is-blocked':'')}
   aria-label={label}
   aria-pressed={playing}
   title={'背景音樂：みやびごころ · '+status}
   onClick={toggle}>
   {playing?<Volume2 size={17}/>:playback==='blocked'?<Play size={16}/>:<VolumeX size={17}/>}
   <span className="site-bgm-text"><strong>BGM</strong><small>{status}</small></span>
   {playing&&<span className="site-bgm-note" aria-hidden="true"><Music2 size={12}/></span>}
  </button>
 </div>
}
