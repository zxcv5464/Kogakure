import {useCallback,useEffect,useRef,useState} from 'react'
import {Music2,Play,Volume2,VolumeX} from 'lucide-react'
import './site-bgm.css'

// The official BGMer recording of the selected "みやびごころ" track.
// A single audio element lives in the persistent public Layout.
const AUDIO_URL='https://bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'
const DEFAULT_VOLUME=0.24

type Playback='waiting'|'starting'|'playing'|'blocked'|'off'|'error'

export default function SiteBgm({onRegisterStart}:{onRegisterStart?:(start:()=>void)=>void}){
 const [enabled,setEnabled]=useState(true)
 const [playback,setPlayback]=useState<Playback>('waiting')
 const audioRef=useRef<HTMLAudioElement>(null)
 const sequence=useRef(0)

 const startMusic=useCallback(()=>{
  const audio=audioRef.current
  if(!audio)return
  const requestId=++sequence.current
  setEnabled(true)
  setPlayback('starting')
  audio.volume=DEFAULT_VOLUME
  // Called synchronously by the actual "進入狐隱" button's click handler.
  // No timeout, React effect or separate gateway is allowed between the
  // visitor's gesture and play(): Safari/Chrome require transient activation.
  try{
   const request=audio.play()
   if(request){
    void request.then(()=>{
     if(requestId!==sequence.current)return
     setPlayback('playing')
    }).catch((error:unknown)=>{
     if(requestId!==sequence.current)return
     const name=error instanceof Error?error.name:''
     setPlayback(name==='NotAllowedError'||name==='AbortError'?'blocked':'error')
    })
   }
  }catch(error){
   if(requestId!==sequence.current)return
   const name=error instanceof Error?error.name:''
   setPlayback(name==='NotAllowedError'?'blocked':'error')
  }
 },[])

 // Give the existing logo intro a direct click-to-play callback; there is no
 // second modal or new playback page. This registration does not start audio.
 useEffect(()=>{onRegisterStart?.(startMusic)},[onRegisterStart,startMusic])

 function pauseMusic(){
  ++sequence.current // Ignore any outdated play() promise.
  audioRef.current?.pause()
  setEnabled(false)
  setPlayback('off')
 }
 function toggle(){
  if(enabled&&playback==='playing')pauseMusic()
  else startMusic()
 }

 const playing=playback==='playing'
 const status=playing?'播放中':playback==='error'?'音樂載入失敗':
  playback==='blocked'?'點擊播放':playback==='starting'?'準備播放':
  playback==='waiting'?'入館後播放':'已關閉'
 return <div className="site-bgm" aria-label="背景音樂控制">
  <audio ref={audioRef} src={AUDIO_URL} loop preload="auto"
   onPlaying={()=>{if(enabled)setPlayback('playing')}}
   onPause={()=>{if(enabled)setPlayback(current=>current==='playing'?'blocked':current)}}
   onError={()=>{if(enabled)setPlayback('error')}}
   aria-hidden="true"/>
  <button type="button"
   className={'site-bgm-toggle'+(playing?' is-playing':'')+(playback==='blocked'?' is-blocked':'')}
   aria-label={playing?'停止背景音樂':'播放背景音樂'}
   aria-pressed={playing}
   title={'背景音樂：みやびごころ · '+status}
   onClick={toggle}>
   {playing?<Volume2 size={17}/>:enabled?<Play size={16}/>:<VolumeX size={17}/>}
   <span className="site-bgm-text"><strong>BGM</strong><small>{status}</small></span>
   {playing&&<span className="site-bgm-note" aria-hidden="true"><Music2 size={12}/></span>}
  </button>
 </div>
}
