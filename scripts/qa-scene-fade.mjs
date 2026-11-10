import { spawn } from 'node:child_process'
import sharp from 'sharp'

const port = 9392
const origin = process.env.QA_SITE || 'http://127.0.0.1:5224/Kogakure/'
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
 '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
 '--remote-allow-origins=*', '--remote-debugging-port=' + port,
 '--user-data-dir=C:/Windows/Temp/kogakure-scene-qa-' + port,
 origin,
], { stdio: 'ignore' })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
 let pages
 for (let i = 0; i < 90; i++) {
  try {
   const response = await fetch('http://127.0.0.1:' + port + '/json/list')
   if (response.ok) { pages = await response.json(); break }
  } catch {}
  await delay(100)
 }
 const tab = pages?.find(page => page.type === 'page')
 if (!tab) throw new Error('Chrome did not start')
 socket = new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
 })
 let seq = 0
 const run = (method, params={}) => new Promise((resolve, reject) => {
  const id = ++seq
  const receive = event => {
   const message = JSON.parse(event.data)
   if (message.id !== id) return
   socket.removeEventListener('message', receive)
   message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result)
  }
  socket.addEventListener('message', receive)
  socket.send(JSON.stringify({ id, method, params }))
 })
 await run('Runtime.enable')
 await run('Page.enable')
 const sampleScene = async () => {
  const result = await run('Page.captureScreenshot', {format:'png',captureBeyondViewport:false})
  const {data,info} = await sharp(Buffer.from(result.data,'base64')).raw().toBuffer({resolveWithObject:true})
  return [[20,250],[45,370],[75,470]].map(([x,y])=>{
   const offset=(y*info.width+x)*info.channels
   return [...data.subarray(offset,offset+3)]
  })
 }
 const evaluate = async expression => {
  const response = await run('Runtime.evaluate', { expression, returnByValue: true })
  if (response.exceptionDetails) throw Error(response.exceptionDetails.text)
  return response.result.value
 }
 const snapshot = () => evaluate(`({
  url: location.pathname,
  heading: document.querySelector('main h1')?.textContent,
  backdrop: !!document.querySelector('.scene-backdrop'),
  photoSources: [...document.querySelectorAll('.scene-backdrop__photo')].map(node=>node.style.backgroundImage),
  opacity: [...document.querySelectorAll('.scene-backdrop__photo')].map(node=>Number(getComputedStyle(node).opacity)),
  active: [...document.querySelectorAll('.scene-backdrop__photo')].findIndex(node=>node.classList.contains('is-active')),
  transition: document.querySelector('.page-transition-curtain')?.className,
  visibility: getComputedStyle(document.querySelector('.scene-backdrop')).visibility,
  zIndex: getComputedStyle(document.querySelector('.scene-backdrop')).zIndex,
 })`)
 await delay(3400)
 const home = await snapshot()
 console.log('Initial home:', home)
 if (home.photoSources.length !== 2 || !home.photoSources[0].includes('scene-01.webp')) throw Error('Home image not loaded')
 await evaluate('document.querySelector(".desktop-nav a[href$=about]")?.click()')
 await delay(280)
 const fading = await snapshot()
 console.log('Mid-fade:', fading)
 if (fading.photoSources.filter(url => url.includes('scene-02.webp')).length !== 1) throw Error('The new photo did not start cross-fading')
 if (!(fading.opacity[fading.active] > 0 && fading.opacity[fading.active] < 1)) throw Error('Photo opacity did not animate')
 await delay(1650)
 const about = await snapshot()
 console.log('After cross-fade:', about)
 if (about.heading !== '館內介紹' || about.opacity[about.active] < 0.97) throw Error('Fade did not settle')
 const aboutPixels = await sampleScene()
 await evaluate('document.querySelector(".desktop-nav a[href$=services]")?.click()')
 await delay(1950)
 const services = await snapshot()
 console.log('Next page:', services)
 if (services.heading !== '服務內容' || !services.photoSources[services.active].includes('scene-03.webp')) throw Error('Scene did not advance to third photograph')
 if (services.transition !== 'page-transition-curtain') throw Error('Curtain did not clear')
 const servicePixels = await sampleScene()
 const sceneDifference=aboutPixels.flat().reduce((sum,v,i)=>sum+Math.abs(v-servicePixels.flat()[i]),0)
 console.log('Rendered background sample difference:',sceneDifference,aboutPixels,servicePixels)
 if (sceneDifference < 12) throw Error('The photo seems hidden behind opaque page layers')
 await evaluate('document.querySelector(".desktop-nav a[href$=staff]")?.click()')
 await delay(1900)
 const staff = await snapshot()
 console.log('Staff scene:',staff)
 if (staff.heading !== '狐姬名冊' || !staff.photoSources[staff.active].includes('scene-04.webp')) throw Error('Staff scene did not rotate')
 const cards = await evaluate('document.querySelectorAll(".omamori-card").length')
 if (cards > 0) {
  await evaluate('document.querySelector(".omamori-card")?.click()')
  await delay(360)
  const dialogLayers = await evaluate('({open:!!document.querySelector(".staff-dialog"),coversHeader:!!document.elementFromPoint(5,5)?.closest(".dialog-overlay"),backdrop:getComputedStyle(document.querySelector(".scene-backdrop")).zIndex})')
  console.log('Staff modal layer:', dialogLayers)
  if (!dialogLayers.open || !dialogLayers.coversHeader || dialogLayers.backdrop !== '-1') throw Error('Staff modal must remain above the header')
 }
 await evaluate('document.querySelector(".dialog-close")?.click()')
 await run('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
 await delay(240)
 const mobileNav = await evaluate('getComputedStyle(document.querySelector(".mobile-bottom-nav")).display')
 if (mobileNav !== 'grid') throw Error('Mobile navigation is not visible')
 await evaluate('document.querySelector(".mobile-bottom-nav a[href$=shifts]")?.click()')
 await delay(1950)
 const mobile = await snapshot()
 console.log('Mobile shift scene:',mobile)
 if (mobile.heading !== '值班排班' || !mobile.photoSources[mobile.active].includes('scene-05.webp')) throw Error('Mobile navigation did not advance the background')
 console.log('PASS: rotating background, actual opacity cross-fade, route animations, clean routes, modal layering and mobile navigation')
} finally {
 socket?.close()
 chrome.kill()
}
