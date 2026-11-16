import {useCallback,useEffect,useRef,useState} from 'react'
import {Music2,VolumeX,X} from 'lucide-react'
import {
 DEFAULT_BGM,readPublicBgm,currentAudioUrl,youtubeVideoId,
} from '../lib/site-bgm'
import type {BgmSettings} from '../lib/site-bgm'
import './site-bgm.css'

// Keep the same compact gold control and single persistent HTMLAudioElement.
// The site entry still triggers audio.play() synchronously from the actual
// visitor click. Admin settings change the source, not the player UI.
type Playback='waiting'|'starting'|'playing'|'blocked'|'off'|'error'
export default function SiteBgm({onRegisterStart}:{onRegisterStart?:(start:()=>void)=>void}){
 const [settings,setSettings]=useState<BgmSettings>({...DEFAULT_BGM})
 const current=useRef(settings)
 const [enabled,setEnabled]=useState(true)
 const [playback,setPlayback]=useState<Playback>('waiting')
 const [youtubeOpen,setYoutubeOpen]=useState(false)
 const audioRef=useRef<HTMLAudioElement>(null)
 const sequence=useRef(0)

 const startMusic=useCallback(()=>{
  const config=current.current
  if(!config.enabled){setEnabled(false);setPlayback('off');return}
  const requestId=++sequence.current
  setEnabled(true)
  if(config.source==='youtube'){
   audioRef.current?.pause()
   setYoutubeOpen(true)
   // The official, visible iframe may require its own play click on iOS.
   setPlayback('starting')
   return
  }
  setYoutubeOpen(false)
  const audio=audioRef.current
  if(!audio)return
  setPlayback('starting')
  audio.volume=config.volume
  // There is NO promise, timeout or React effect between the visitor's
  // click on 進入狐隱 and this audio.play() call.
  try{
   const request=audio.play()
   if(request)void request.then(()=>{
    if(requestId!==sequence.current)return
    setPlayback('playing')
   }).catch((error:unknown)=>{
    if(requestId!==sequence.current)return
    const name=error instanceof Error?error.name:''
    setPlayback(name==='NotAllowedError'||name==='AbortError'?'blocked':'error')
   })
  }catch(error){
   if(requestId!==sequence.current)return
   setPlayback(error instanceof Error&&error.name==='NotAllowedError'?'blocked':'error')
  }
 },[])
 // Persist the existing entrance callback; switching BGM sources must not
 // recreate or re-register a different entry button.
 useEffect(()=>{onRegisterStart?.(startMusic)},[onRegisterStart,startMusic])

 useEffect(()=>{
  let live=true
  async function refresh(){
   try{
    const next=await readPublicBgm()
    if(!live)return
    const previous=current.current
    if(previous.updatedAt===next.updatedAt&&previous.source===next.source&&
      previous.url===next.url&&previous.enabled===next.enabled)return
    current.current=next
    setSettings(next)
    if(next.source!==previous.source||currentAudioUrl(next)!==currentAudioUrl(previous)||
      !next.enabled){
     ++sequence.current
     audioRef.current?.pause()
     setYoutubeOpen(false)
     setPlayback(next.enabled?'blocked':'off')
    }else if(audioRef.current)audioRef.current.volume=next.volume
   }catch{/* Keep the last playable source when the network is unavailable. */}
  }
  void refresh()
  const interval=window.setInterval(()=>{void refresh()},45000)
  return()=>{live=false;window.clearInterval(interval)}
 },[])

 function pauseMusic(){
  ++sequence.current
  audioRef.current?.pause()
  setYoutubeOpen(false)
  setEnabled(false)
  setPlayback('off')
 }
 function toggle(){
  if(!settings.enabled)return
  if(youtubeOpen||enabled&&playback==='playing')pauseMusic()
  else startMusic()
 }
 const youtubeId=settings.source==='youtube'?youtubeVideoId(settings.url):null
 const playing=playback==='playing'||youtubeOpen
 const status=youtubeOpen?'YouTube 已開啟':
  playback==='playing'?'播放中':playback==='error'?'音樂載入失敗':
  playback==='blocked'?'點擊播放':playback==='starting'?'準備播放':
  playback==='waiting'?'入館後播放':'已關閉'
 return <div className="site-bgm" aria-label="背景音樂控制">
  <audio ref={audioRef} src={currentAudioUrl(settings)||undefined} loop={settings.loop} preload="auto"
   onPlaying={()=>{if(enabled&&settings.enabled&&settings.source!=='youtube')setPlayback('playing')}}
   onPause={()=>{if(enabled)setPlayback(previous=>previous==='playing'?'blocked':previous)}}
   onError={()=>{if(enabled&&settings.source!=='youtube')setPlayback('error')}}
   aria-hidden="true"/>
  <button type="button"
   className={'site-bgm-toggle'+(playing?' is-playing':'')+(playback==='blocked'?' is-blocked':'')}
   aria-label={playing?'關閉背景音樂':'開啟背景音樂'}
   aria-pressed={playing}
   disabled={!settings.enabled}
   title={'背景音樂：'+settings.title+' · '+(settings.enabled?status:'館方暫停播放')}
   onClick={toggle}>
   {playback==='off'||!settings.enabled?<VolumeX size={19} strokeWidth={1.8} aria-hidden="true"/>:
    <Music2 size={19} strokeWidth={1.8} aria-hidden="true"/>}
  </button>
  {youtubeOpen&&youtubeId&&<div className="site-bgm-youtube" role="region" aria-label="YouTube 背景音樂">
   <div className="site-bgm-youtube-heading"><span>{settings.title}</span>
    <button type="button" aria-label="關閉 YouTube 音樂" onClick={pauseMusic}><X size={17}/></button>
   </div>
   <iframe title={'YouTube 音樂：'+settings.title}
    src={'https://www.youtube-nocookie.com/embed/'+youtubeId+
     '?playsinline=1&autoplay=1&controls=1'+(settings.loop?'&loop=1&playlist='+youtubeId:'')}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>
   <small>如未自動開始，請點擊影片內的播放鍵。YouTube 須使用可見的官方播放器。</small>
  </div>}
 </div>
}
