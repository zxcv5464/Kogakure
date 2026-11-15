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
assert.ok(player.includes('useState(true)')&&player.includes('useState<Playback>(\'starting\')'),
 'Every visit should request music by default, even if a past visit was muted')
assert.ok(!player.includes('localStorage')&&!player.includes('sessionStorage'),
 'Previous stop preference must not silently mute the next visit')
assert.ok(player.includes('function pauseMusic()')&&player.includes('audio.pause()')&&player.includes("setPlayback('off')"),
 'Visitors must still be able to stop music at any time')
assert.ok(player.includes('function startMusic()')&&player.includes('attemptPlay(true)'),
 'User-initiated BGM requests must immediately call the player')
assert.ok(player.includes('const request=audio.play()')&&player.includes("NotAllowedError"),
 'Browser autoplay rejection must be detected by the actual playback promise')
assert.ok(player.includes('const gateVisible=introReady&&enabled&&entryRequired'),
 'A branded music-entry screen must appear only if autoplay is blocked or fails')
assert.ok(player.includes("createPortal(<div className=\"site-bgm-entry-backdrop\"")&&player.includes('document.body)'),
 'Gate must overlay the site without being trapped under the header stacking context')
assert.ok(player.includes('onClick={startMusic}')&&player.includes('onClick={pauseMusic}'),
 'Entering with music must call play inside the click; a music-free alternative must remain')
assert.ok(player.includes('role="dialog" aria-modal="true"')&&player.includes('entryPlayRef.current?.focus()'),
 'Entry screen must be keyboard accessible')
assert.ok(player.includes('onPlaying={()=>')&&player.includes('setEntryRequired(false)'),
 'Entry gate must close once media actually begins playing')
assert.ok(player.includes('loop preload="auto"')&&player.includes('DEFAULT_VOLUME=0.24'),
 'BGM should loop softly and begin loading immediately')

assert.ok(player.includes("onError={()=>{if(enabled){setPlayback('error')")&&player.includes("if(!everPlayed.current)setEntryRequired(true)"),
 'Unavailable audio must show a retryable entry screen rather than leaving visitors stuck in silence')
assert.ok(layout.includes('<SiteBgm introReady={introReady}/>')&&layout.includes("import SiteBgm from './SiteBgm'"),
 'Only one audio player should be mounted in persistent public Layout and synchronized with brand intro')
assert.ok(layout.includes('bgmer.net/music/456'),
 'Composer/source attribution must remain available')
assert.ok(!app.includes('<SiteBgm')&&app.includes('return <PublicApp />'),
 'Do not duplicate audio per page or inject it into the administrative shell')
assert.ok(css.includes('@media(max-width:850px)')&&css.includes('.site-bgm{margin-left:auto}'),
 'The BGM toggle must remain usable in the mobile top bar')
assert.ok(css.includes('.site-bgm-entry-backdrop{')&&css.includes('.site-bgm-entry-play{'),
 'Blocked autoplay requires a responsive, prominent entrance action')
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
 console.log('PASS: fresh-visit music start, browser-blocked entry gate, play-on-click, optional mute, one looping player and attribution')
}finally{await vite.close()}
