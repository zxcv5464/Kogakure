// The original animated logo is the only audio-entry surface.
// Test wiring without audio hardware, browser autoplay hacks, or DB access.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {createServer} from 'vite'
import ts from 'typescript'

const paths=[
 'src/components/SiteBgm.tsx','src/components/site-bgm.css',
 'src/components/Layout.tsx','src/App.tsx',
 'src/components/PageTransition.tsx',
 'src/components/EntryIntro.tsx','src/components/entry-intro.css',
]
const [player,css,layout,app,transition,intro,introCss]=
 await Promise.all(paths.map(p=>readFile(p,'utf8')))
for(const path of paths.filter(p=>p.endsWith('.tsx'))){
 const source=await readFile(path,'utf8')
 const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 assert.equal(parsed.parseDiagnostics.length,0,'Invalid TSX: '+path)
}
assert.ok(player.includes('https://bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'),
 'Keep playing the selected official BGMer track')
assert.ok(player.includes('useState(true)')&&player.includes("useState<Playback>('waiting')"),
 'A fresh public visit must be ready for background music')
assert.ok(!player.includes('localStorage')&&!player.includes('sessionStorage'),
 'Muting a previous visit must not affect the next entrance')
assert.ok(player.includes('const request=audio.play()')&&player.includes('NotAllowedError'),
 'Honor actual browser autoplay policy and handle playback rejection')
assert.ok(player.includes('audio.volume=DEFAULT_VOLUME')&&player.includes('DEFAULT_VOLUME=0.24'),
 'Keep gentle background volume')
assert.ok(player.includes('loop preload="auto"'),
 'Play the official soundtrack continuously using only one audio element')
assert.ok(player.includes('function pauseMusic()')&&player.includes('audioRef.current?.pause()'),
 'The public header music control must still be able to stop audio')
assert.ok(player.includes('function toggle()')&&player.includes('else startMusic()'),
 'Visitors can restart background music from the header')
assert.ok(player.includes('onRegisterStart?.(startMusic)'),
 'Expose a direct click-to-play action to the original intro via registration')
assert.ok(!player.includes('createPortal')&&!player.includes('site-bgm-entry-backdrop'),
 'The separate playback gateway/modal must be removed entirely')
assert.ok(!css.includes('.site-bgm-entry-backdrop')&&!css.includes('.site-bgm-entry-play'),
 'Obsolete separate-player-screen CSS must be removed')
assert.ok(layout.includes('<SiteBgm onRegisterStart={onRegisterBgm}/>'),
 'The persistent public layout must expose its one audio player to the entrance')
assert.ok(layout.includes('bgmer.net/music/456'),
 'Soundtrack credit must remain visible in public footer')
assert.ok(app.includes('const startMusic=useRef<()=>void>')&&
 app.includes('const registerBgm=useCallback('),
 'Keep a stable, directly callable music starter across the logo and header')
assert.ok(app.includes('<Layout onRegisterBgm={registerBgm}>')&&
 app.includes('<EntryIntro onEnter={()=>startMusic.current()}'),
 'The logo entry action must start the audio without switching to another modal')
assert.ok(!app.includes('<SiteBgm')&&app.includes('return <PublicApp />'),
 'Only the public shell should own the BGM player, not every page or admin')
assert.ok(intro.includes("images/brand/logo-intro.webp")&&intro.includes('intro-motto'),
 'Use the existing original animated logo and motto, not a new entrance page')
assert.ok(intro.includes('進入狐隱・開始播放音樂')&&intro.includes('onClick={enterInn}'),
 'The original logo page must show the single enter-and-start-music action')
assert.ok(intro.includes('onEnter?.()')&&intro.indexOf('onEnter?.()')<intro.indexOf("setPhase('clear')"),
 'Start the audio synchronously within the entry button click before fade timers')
assert.ok(intro.includes("phase==='ready'")&&intro.includes("setPhase('ready')"),
 'Wait for the original logo arrival before showing the entry button')
assert.ok(!intro.includes('sessionStorage')&&!intro.includes('localStorage'),
 'Every fresh page visit should show the single logo entrance for audio activation')
assert.ok(intro.includes('role="dialog" aria-modal="true"')&&intro.includes('entryButton.current?.focus('),
 'Logo entry must be keyboard accessible')
assert.ok(introCss.includes('.intro-entry-action')&&
 introCss.includes('.intro-entry-action:focus-visible'),
 'The enter-and-play control must be legible and keyboard focusable')
assert.ok(introCss.includes('@media(prefers-reduced-motion:reduce)')&&
 !introCss.includes('.entry-intro{display:none!important}'),
 'Visitors with reduced motion must retain access to the entry button')
assert.ok(transition.includes('<SceneBackdrop introReady={introReady} />'),
 'Site background and route transitions must keep using the existing reveal state')
assert.ok(css.includes('@media(max-width:850px)')&&introCss.includes('@media(max-width:570px)'),
 'Keep mobile music controls and responsive logo entry')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:Layout}=await vite.ssrLoadModule('/src/components/Layout.tsx')
 const markup=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(Layout,null,createElement('p',null,'TEST'))))
 assert.equal((markup.match(/<audio\b/g)||[]).length,1,
  'There must be precisely one persistent public audio element')
 assert.ok(markup.includes('loop=""')||markup.includes(' loop'))
 assert.ok(markup.includes('BGM')&&markup.includes('背景音樂'))
 assert.ok(markup.includes('bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'))
 console.log('PASS: original logo click starts one looping BGM player; no separate audio screen; mobile, keyboard, stop/restart and attribution intact')
}finally{await vite.close()}
