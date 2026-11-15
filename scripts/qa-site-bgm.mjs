// Sound controls must work across public route changes and never request
// access to guest or employee data. This runs without browser audio hardware.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {createServer} from 'vite'

const [player,css,layout,app,terms]=await Promise.all([
 'src/components/SiteBgm.tsx',
 'src/components/site-bgm.css',
 'src/components/Layout.tsx',
 'src/App.tsx',
 'src/components/PageTransition.tsx',
].map(path=>readFile(path,'utf8')))

assert.ok(player.includes('https://bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'),
 'Use the actual short version of the selected BGMer song')
assert.ok(player.includes("const STORAGE_KEY='kogakure-bgm-enabled-v1'"),
 'BGM needs a stable user preference key')
assert.ok(player.includes("window.localStorage.getItem(STORAGE_KEY)!=='off'"),
 'BGM should be enabled by default unless visitor expressly turned it off')
assert.ok(player.includes("setEnabled(false)")&&player.includes("storePreference(false)")&&player.includes("audioRef.current?.pause()"),
 'Stop button must pause the audio and persist off')
assert.ok(player.includes("storePreference(true)")&&player.includes("attemptPlay()"),
 'Play button must reactivate BGM and persist on')
assert.ok(player.includes("const request=audio.play()")&&player.includes("NotAllowedError"),
 'A browser autoplay rejection must leave a manual play fallback')
assert.ok(player.includes("document.addEventListener('click',retry)")&&player.includes("document.addEventListener('keydown',retry)"),
 'Playing should be retried on user interaction when autoplay is forbidden')
assert.ok(player.includes('loop preload="none"')&&player.includes('DEFAULT_VOLUME=0.24'),
 'The music should play quietly on repeat without loading eagerly when stopped')
assert.ok(player.includes("onError={()=>setPlayback('error')}"),
 'Unavailable audio must show an understandable error state')
assert.ok(layout.includes('<SiteBgm/>')&&layout.includes("import SiteBgm from './SiteBgm'"),
 'Only one audio player should be mounted in persistent public Layout')
assert.ok(layout.includes('bgmer.net/music/456'),
 'Composer/source attribution must remain available')
assert.ok(!app.includes('<SiteBgm')&&app.includes('return <PublicApp />'),
 'Do not duplicate audio per page or inject it into the administrative shell')
assert.ok(css.includes('@media(max-width:850px)')&&css.includes('.site-bgm{margin-left:auto}'),
 'The BGM toggle must remain usable in the mobile top bar')
assert.ok(terms.includes('<SceneBackdrop introReady={introReady} />'),
 'Shared scene animations must remain separate from the audio')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:Layout}=await vite.ssrLoadModule('/src/components/Layout.tsx')
 const markup=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(Layout,null,createElement('p',null,'TEST'))))
 assert.equal((markup.match(/<audio\b/g)||[]).length,1,'The public shell should have exactly one audio element')
 assert.ok(markup.includes('loop=""')||markup.includes(' loop'),'Audio must loop automatically')
 assert.ok(markup.includes('背景音樂')&&markup.includes('BGM'),'Visitors should see a labeled playback toggle')
 assert.ok(markup.includes('bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'),
  'Server render must point to the official audio file')
 console.log('PASS: single site-wide looping BGM, persisted choice, autoplay fallback, mobile controls and attribution')
}finally{await vite.close()}
