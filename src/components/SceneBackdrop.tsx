import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { asset } from '../lib/paths'
import './scene-backdrop.css'

// The scene only advances when visitors navigate, never on a timer.
// Keep the previous image mounted so the two images can cross-fade.
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

export default function SceneBackdrop() {
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
  if (path === previousPath.current) return
  previousPath.current = path

  const index = (nextIndex.current + 1) % SCENES.length
  nextIndex.current = index
  const nextImage = SCENES[index]
  let cancelled = false
  let revealed = false
  const preload = new Image()
  function reveal() {
   if (cancelled || revealed) return
   revealed = true
   setBackdrop(previous => {
    const active: Layer = previous.active === 0 ? 1 : 0
    const sources: [string, string] = [...previous.sources]
    sources[active] = nextImage
    return { sources, active }
   })
  }
  preload.onload = reveal
  preload.onerror = () => { /* The current photo stays visible on load failure. */ }
  preload.src = nextImage
  if (preload.complete && preload.naturalWidth > 0) reveal()
  return () => {
   cancelled = true
   preload.onload = null
   preload.onerror = null
  }
 }, [path])

 return (
  <div
   className={'scene-backdrop' + (path === '/admin' ? ' scene-backdrop--hidden' : '')}
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
