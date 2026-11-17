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
assert.ok(player.includes("from '../lib/site-bgm'")&&
 player.includes("DEFAULT_BGM")&&player.includes('currentAudioUrl(settings)'),
 'Current persistent player must read its current source from the managed BGM config')
assert.ok(player.includes('useState(true)')&&player.includes("useState<Playback>('waiting')"),
 'A fresh public visit must be ready for background music')
assert.ok(!player.includes('localStorage')&&!player.includes('sessionStorage'),
 'Muting a previous visit must not affect the next entrance')
assert.ok(player.includes('const request=audio.play()')&&player.includes('NotAllowedError')&&
 player.includes('void refresh()')&&player.includes('window.setInterval'),
 'Preserve synchronous gesture-based playback and live source refresh')
assert.ok(player.includes('audio.volume=config.volume')&&
 player.includes('audioRef.current.volume=next.volume'),
 'Managed volume must use the existing HTMLAudioElement')
assert.ok(player.includes('loop={settings.loop} preload="metadata"'),
 'The existing player must not eagerly download full audio before visitor consent')
assert.ok(player.includes("document.addEventListener('visibilitychange',refreshWhenVisible)")&&
 player.includes("window.setInterval(refreshWhenVisible,120000)"),
 'Background tabs must not keep polling the public BGM setting')
assert.ok(player.includes('function pauseMusic()')&&player.includes('audioRef.current?.pause()')&&
 player.includes('setYoutubeOpen(false)'),
 'The original header control must still stop uploaded audio and visible YouTube')
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
assert.ok(!layout.includes('site-bgm-credit')&&
 !layout.includes('背景音樂：')&&
 !layout.includes('みやびごころ · BGMer')&&
 !css.includes('.site-bgm-credit'),
 'Footer must no longer show the soundtrack label or its unused style')
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
assert.ok(intro.includes("type Phase='preparing'")&&intro.includes("'preparing'"), 
 'Cold first load must have a distinct asset-preparation stage')
assert.ok(intro.includes('image.decode().then(settle,settle)')&&intro.includes('LOGO_LOAD_TIMEOUT_MS'),
 'Start animation after the logo image decodes, with a bounded fallback')
assert.ok(intro.includes('window.requestAnimationFrame(()=>')&&intro.includes("setPhase('enter')"),
 'Ensure a complete initial paint before beginning the brand animation')
assert.ok(introCss.includes('.entry-intro.is-preparing :is(')&&
 introCss.includes('animation:none!important;opacity:0'),
 'First paint must hide all entrance layers until the logo is ready')
assert.ok(intro.includes("phase==='preparing'?' is-preparing'"),
 'The CSS preparation state must actually be applied to the initial intro')
assert.ok(intro.includes('進入狐隱<ArrowRight')&&intro.includes('onClick={enterInn}')&&
 !intro.includes('<Music2')&&
 !intro.includes('ArrowRight,Music2'),
 'The original logo page must show just 進入狐隱 on the enter-and-play button')
assert.ok(!intro.includes('進入狐隱・開始播放音樂'),
 'Long music activation wording should be removed from the intro button')
assert.ok(intro.includes("disabled={phase!=='ready'}")&&intro.includes('const HOLD_MS=1650'),
 'Button stays mounted for a smooth fade but must not be clickable before it fully appears')
assert.ok(intro.includes('onEnter?.()')&&intro.indexOf('onEnter?.()')<intro.indexOf("setPhase('clear')"),
 'Start the audio synchronously within the entry button click before fade timers')
assert.ok(intro.includes("phase!=='ready'")&&intro.includes("setPhase('ready')"),
 'Enable the entry button only after the original logo has finished its entrance')
assert.ok(!intro.includes('sessionStorage')&&!intro.includes('localStorage'),
 'Every fresh page visit should show the single logo entrance for audio activation')
assert.ok(intro.includes('role="dialog" aria-modal="true"')&&
 intro.includes('className="intro-entry-action"')&&intro.includes('type="button"'),
 'Logo entry must keep a keyboard-accessible button')
assert.ok(!intro.includes('entryButton.current?.focus('),
 'Do not automatically focus the button and create an unwanted visible focus frame')
assert.ok(!introCss.includes('#9ce4d5')&&introCss.includes('outline:2px solid rgba(220,180,121,.9)'),
 'Avoid pale-blue entry focus outlines; use a subdued warm gold keyboard focus ring')
assert.ok(introCss.includes('.intro-entry-action')&&
 introCss.includes('.intro-entry-action:focus-visible'),
 'The enter-and-play control must be legible and keyboard focusable')
assert.ok(introCss.includes('opacity:0;')&&
 introCss.includes('animation:intro-letter-arrive 650ms ease-out 1000ms both;'),
 'Logo entrance button should fade in after the brand and motto, not flash into view')
assert.ok(introCss.includes('animation:intro-letter-arrive 550ms ease-out 1320ms both'),
 'Music control hint should fade softly after the entry action')
assert.ok(introCss.includes('.intro-entry-action,.intro-music-note{opacity:1!important'),
 'Reduced-motion visitors must still be able to see and use the entry action')
assert.ok(introCss.includes('@media(prefers-reduced-motion:reduce)')&&
 !introCss.includes('.entry-intro{display:none!important}'),
 'Visitors with reduced motion must retain access to the entry button')
assert.ok(transition.includes('<SceneBackdrop introReady={introReady} />'),
 'Site background and route transitions must keep using the existing reveal state')
assert.ok(css.includes('width:40px;height:40px')&&
 css.includes('border-radius:50%')&&
 !css.includes('.site-bgm-text')&&
 player.includes('aria-pressed={playing}')&&
 player.includes('開啟背景音樂')&&player.includes('關閉背景音樂')&&
 layout.includes('className="header-actions"')&&
 layout.includes('className="header-socials"')&&
 introCss.includes('@media(max-width:570px)'),
 'Compact top-right BGM button must match social icons without crowding navigation')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:Layout}=await vite.ssrLoadModule('/src/components/Layout.tsx')
 const markup=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(Layout,null,createElement('p',null,'TEST'))))
 assert.equal((markup.match(/<audio\b/g)||[]).length,1,
  'There must be precisely one persistent public audio element')
 assert.ok(markup.includes('loop=""')||markup.includes(' loop'))
 assert.ok(markup.includes('site-bgm-toggle')&&markup.includes('背景音樂'))
 assert.ok(markup.includes('bgmer.net/wp-content/uploads/2025/04/456_BPM80.mp3'))
 assert.ok(!markup.includes('site-bgm-youtube-heading'),'YouTube iframe only loads after a real visitor click')
 console.log('PASS: original header player, logo gesture, managed audio, source refresh and visible YouTube; no extra entry screen')
}finally{await vite.close()}
