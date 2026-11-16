// Verify Discord is a peer of the existing Threads links on desktop,
// mobile-more navigation and the public footer, without adding new pages.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {createServer} from 'vite'

const [layout,css]=await Promise.all([
 readFile('src/components/Layout.tsx','utf8'),
 readFile('src/index.css','utf8'),
])
const invite='https://discord.gg/f34DSnUgGV'
assert.ok(layout.includes("const DISCORD_INVITE='"+invite+"'"),
 'The Discord invite must exactly match the supplied permanent link')
assert.ok(layout.includes('function DiscordMark(')&&layout.includes('fill="currentColor"'),
 'Use a brand-shaped Discord icon inheriting the same gold color as Threads')
assert.ok(layout.includes('className="header-socials"')&&
 layout.includes('className="social-header"')&&layout.includes('aria-label="狐隱 Discord"'),
 'Desktop Discord icon must share the exact Threads circular style')
assert.ok(layout.includes('官方 Discord')&&layout.includes('className="mobile-extra-link mobile-social-link"'),
 'Mobile more menu must contain a Discord entry matching Threads')
assert.equal((layout.match(/<a className="mobile-extra-link mobile-social-link"/g)||[]).length,2,
 'Threads and Discord must share the same mobile-more link treatment')
assert.equal((layout.match(/<NavLink key=\{to\} to=\{to\} ref=\{index===0\?firstExtra:undefined\} className=/g)||[]).length,1,
 'Keep the three internal mobile-more links in front of the two social links')
assert.ok(css.includes('.mobile-more-panel .mobile-extra-link:nth-of-type(4){animation-delay:.29s}')&&
 css.includes('.mobile-more-panel .mobile-extra-link:nth-of-type(5){animation-delay:.36s}')&&
 css.includes('.mobile-more-panel .mobile-extra-link:is(:hover,:focus-visible)')&&
 css.includes('.mobile-more-panel .mobile-extra-link:active')&&
 css.includes('.mobile-more-panel .mobile-extra-link>svg{transition:')&&
 css.includes('prefers-reduced-motion:reduce'),
 'Fifth Discord link must share all mobile-menu stagger, icon, touch and accessible reduced-motion effects')
assert.ok(css.includes('.header-socials{display:flex')&&
 css.includes('@media(max-width:850px){.header-socials{display:none}}')&&
 css.includes('.header-inner>.header-actions')&&
 layout.includes('<SiteBgm onRegisterStart={onRegisterBgm}/>'),
 'Social icons and compact BGM must share the right-side action group without disrupting navigation')
assert.ok(layout.includes('target="_blank" rel="noopener noreferrer"'),
 'External social links need secure tab handling')

const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:Layout}=await vite.ssrLoadModule('/src/components/Layout.tsx')
 const html=renderToStaticMarkup(createElement(MemoryRouter,null,
  createElement(Layout,null,createElement('p',null,'CHECK'))))
 assert.equal((html.match(/class="social-header"/g)||[]).length,2,
  'Header must present exactly one Threads icon and one Discord icon')
 // Mobile "更多" items only render after the visitor opens the menu.
 // Source checks cover their JSX; SSR checks cover always-visible links.
 assert.equal((layout.match(/className="mobile-extra-link mobile-social-link"/g)||[]).length,2,
  'Mobile more menu JSX must contain both social channels')
 assert.equal((layout.match(/href=\{DISCORD_INVITE\}/g)||[]).length,3,
  'Discord must be wired in the header, mobile menu and footer')
 assert.equal((html.match(/href="https:\/\/discord\.gg\/f34DSnUgGV"/g)||[]).length,2,
  'With the mobile menu closed, desktop header and footer links should render')
 assert.ok(html.includes('aria-label="狐隱 Discord"')&&html.includes('官方 Discord'),
  'Discord controls must be identifiable to accessibility tools and visitors')
 assert.ok(html.includes('href="https://www.threads.com/@kogakure_ffxiv"'),
  'Existing Threads links must remain unchanged')
 assert.equal((html.match(/<audio\b/g)||[]).length,1,
  'Adding social buttons must not duplicate or remount the BGM player')
 console.log('PASS: Discord matches Threads across desktop header, mobile navigation and footer')
}finally{await vite.close()}
