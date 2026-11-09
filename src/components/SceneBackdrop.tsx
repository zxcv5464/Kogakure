import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { asset } from '../lib/paths'
import './scene-backdrop.css'

// Reuse the venue's own photography, with a quiet timed crossfade.
const SCENES = Array.from({ length: 7 }, (_, index) =>
 asset('images/scenes/scene-' + String(index + 1).padStart(2, '0') + '.webp'),
)

const INITIAL_SCENE: Record<string, number> = {
 '/': 0,
 '/about': 1,
 '/services': 2,
 '/staff': 3,
 '/shifts': 4,
 '/menu': 5,
 '/booking': 6,
}

type Layer = 0 | 1
type BackdropState = { sources: [string, string]; active: Layer }

export default function SceneBackdrop({ introReady }: { introReady: boolean }) {
 const location = useLocation()
 const path = location.pathname
 const startIndex = INITIAL_SCENE[path] ?? 0
 const nextIndex = useRef(startIndex)
 const previousPath = useRef(path)
 const [backdrop, setBackdrop] = useState<BackdropState>(() => ({
  sources: [SCENES[startIndex], SCENES[startIndex]],
  active: 0,
 }))

 useEffect(() => {
  let cancelled = false
  const preloads = new Set<HTMLImageElement>()
  function showScene(index: number) {
   const nextImage = SCENES[index]
   const preload = new Image()
   preloads.add(preload)
   preload.onload = () => {
    preloads.delete(preload)
    if (cancelled) return
    setBackdrop(previous => {
     if (previous.sources[previous.active] === nextImage) return previous
     const active: Layer = previous.active === 0 ? 1 : 0
     const sources: [string, string] = [...previous.sources]
     sources[active] = nextImage
     return { sources, active }
    })
   }
   preload.onerror = () => { preloads.delete(preload) }
   preload.src = nextImage
  }
  if (path !== previousPath.current) {
   previousPath.current = path
   nextIndex.current = INITIAL_SCENE[path] ?? 0
   if (path !== '/admin') showScene(nextIndex.current)
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const timer = path === '/admin' || reduced ? undefined : window.setInterval(() => {
   if (document.visibilityState !== 'visible') return
   nextIndex.current = (nextIndex.current + 1) % SCENES.length
   showScene(nextIndex.current)
  }, 5000)
  return () => {
   cancelled = true
   if (timer !== undefined) window.clearInterval(timer)
   for (const preload of preloads) { preload.onload = null; preload.onerror = null }
  }
 }, [path])

 return (
  <div
   className={'scene-backdrop' + (path === '/admin' ? ' scene-backdrop--hidden' : '') + (introReady ? '' : ' scene-backdrop--intro-waiting')}
   aria-hidden="true"
  >
   {backdrop.sources.map((source, index) => (
    <div
     key={index}
     className={'scene-backdrop__photo' + (backdrop.active === index ? ' is-active' : '')}
     style={{ backgroundImage: `url("${source}")` }}
    />
   ))}
   <div className="scene-backdrop__shade" />
  </div>
 )
}
