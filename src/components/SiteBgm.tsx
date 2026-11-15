import {useCallback,useEffect,useRef,useState} from 'react'
import {Music2,Play,Volume2,VolumeX,Headphones,ArrowRight} from 'lucide-react'
import './site-bgm.css'

// BGMer's official short recording of the selected "みやびごころ" track.
// This audio player is mounted once in Layout, not once per route.
const AUDIO_URL='https://bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'
const DEFAULT_VOLUME=0.24

type Playback='starting'|'playing'|'blocked'|'off'|'error'

export default function SiteBgm({introReady=true}:{introReady?:boolean}){
 // Every new visit requests music regardless of the previous visit's choice.
 // Pausing remains the visitor's choice for the current SPA session.
 const [enabled,setEnabled]=useState(true)
 const [playback,setPlayback]=useState<Playback>('starting')
 const [entryRequired,setEntryRequired]=useState(false)
 const [retrying,setRetrying]=useState(false)
 const audioRef=useRef<HTMLAudioElement>(null)
 const playAttempt=useRef(0)
 const everPlayed=useRef(false)
 const entryPlayRef=useRef<HTMLButtonElement>(null)
 const entrySkipRef=useRef<HTMLButtonElement>(null)

 const attemptPlay=useCallback((fromGesture=false)=>{
  const audio=audioRef.current
  if(!audio)return
  const attempt=++playAttempt.current
  audio.volume=DEFAULT_VOLUME
  if(fromGesture)setRetrying(true)
  else setPlayback('starting')
  // This call MUST occur in the user gesture handler when autoplay is blocked:
  // browser policies cannot be overridden by code.
  function failed(error:unknown){
   if(attempt!==playAttempt.current)return
   const name=error instanceof Error?error.name:''
   setPlayback(name==='NotAllowedError'||name==='AbortError'?'blocked':'error')
   if(!everPlayed.current)setEntryRequired(true)
  }
  try{
   const request=audio.play()
   if(request){
    void request.then(()=>{
     if(attempt!==playAttempt.current)return
     everPlayed.current=true
     setPlayback('playing')
     setEntryRequired(false)
    }).catch(failed).finally(()=>{if(attempt===playAttempt.current)setRetrying(false)})
   }else{
    // Some older browsers return void; HTMLMediaElement's event listeners
    // below are the source of truth for real playback.
    setRetrying(false)
   }
  }catch(error){failed(error);setRetrying(false)}
 },[])

 useEffect(()=>{
  // Attempt unmuted playback as soon as the public site mounts.
  attemptPlay()
 },[attemptPlay])

 function pauseMusic(){
  ++playAttempt.current // Ignore stale promises from earlier play requests.
  const audio=audioRef.current
  if(audio)audio.pause()
  setEnabled(false)
  setPlayback('off')
  setEntryRequired(false)
  setRetrying(false)
 }
 function startMusic(){
  setEnabled(true)
  // Never postpone play() to a setState/useEffect; the click/tap's
  // transient user activation would have expired in Safari and Chrome.
  attemptPlay(true)
 }
 function toggle(){
  if(enabled&&playback==='playing')pauseMusic()
  else startMusic()
 }

 const gateVisible=introReady&&enabled&&entryRequired&&(playback==='blocked'||playback==='error')
 useEffect(()=>{
  if(!gateVisible)return
  const oldOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  entryPlayRef.current?.focus()
  function keepFocus(event:KeyboardEvent){
   if(event.key!=='Tab')return
   const first=entryPlayRef.current,last=entrySkipRef.current
   if(!first||!last)return
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  document.addEventListener('keydown',keepFocus)
  return()=>{
   document.body.style.overflow=oldOverflow
   document.removeEventListener('keydown',keepFocus)
  }
 },[gateVisible])

 const playing=playback==='playing'
 const label=playing?'停止背景音樂':enabled?'播放背景音樂':'開啟背景音樂'
 const status=playing?'播放中':playback==='error'?'載入失敗':playback==='blocked'?'需要啟動':enabled?'準備播放':'已關閉'
 return <div className="site-bgm" aria-label="背景音樂控制">
  <audio ref={audioRef} src={AUDIO_URL} loop preload="auto"
   onPlaying={()=>{everPlayed.current=true;setPlayback('playing');setEntryRequired(false);setRetrying(false)}}
   onPause={()=>{if(enabled)setPlayback(current=>current==='playing'?'blocked':current)}}
   onError={()=>{if(enabled){setPlayback('error');if(!everPlayed.current)setEntryRequired(true)}}}
   aria-hidden="true"/>
  <button type="button"
   className={'site-bgm-toggle'+(playing?' is-playing':'')+(playback==='blocked'?' is-blocked':'')}
   aria-label={label} aria-pressed={playing}
   title={'背景音樂：みやびごころ · '+status}
   onClick={toggle}>
   {playing?<Volume2 size={17}/>:enabled?<Play size={16}/>:<VolumeX size={17}/>}
   <span className="site-bgm-text"><strong>BGM</strong><small>{status}</small></span>
   {playing&&<span className="site-bgm-note" aria-hidden="true"><Music2 size={12}/></span>}
  </button>
  {gateVisible&&<div className="site-bgm-entry-backdrop">
   <section className="site-bgm-entry" role="dialog" aria-modal="true"
    aria-labelledby="site-bgm-entry-title" aria-describedby="site-bgm-entry-desc">
    <div className="site-bgm-entry-symbol" aria-hidden="true"><Headphones size={32} strokeWidth={1.4}/></div>
    <p className="site-bgm-entry-english">KOGAKURE · MUSIC</p>
    <h2 id="site-bgm-entry-title">循狐而入・聆聽雅音</h2>
    <p id="site-bgm-entry-desc">{playback==='error'
     ?'背景音樂暫時無法載入，請再試一次；也可以先進入狐隱。'
     :'為讓旅人入館時就能聽見和風琴音，請點選下方按鈕，開啟音樂後進入狐隱。'}</p>
    <button type="button" ref={entryPlayRef} className="site-bgm-entry-play"
     disabled={retrying} onClick={startMusic}>
     <Play size={17} fill="currentColor"/>
     {retrying?'正在啟動背景音樂…':playback==='error'?'重新播放・進入狐隱':'進入狐隱・開啟音樂'}
     <ArrowRight size={17}/>
    </button>
    <button type="button" ref={entrySkipRef} className="site-bgm-entry-skip"
     onClick={pauseMusic}>暫不播放・直接入館</button>
    <small>音樂啟動後可隨時使用頁首 BGM 按鈕停止播放。</small>
   </section>
  </div>}
 </div>
}
