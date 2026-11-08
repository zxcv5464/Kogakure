import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const port = 9396
const root = process.env.QA_SITE || 'http://127.0.0.1:5238'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
 '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
 '--remote-allow-origins=*', '--remote-debugging-port=' + port,
 '--user-data-dir=C:/Windows/Temp/kogakure-home-load-qa-' + port,
 root + '/',
], {stdio: 'ignore'})
let socket
try {
 let pages
 for (let i=0;i<100;i++) {
  try {
   const response=await fetch('http://127.0.0.1:'+port+'/json/list')
   if (response.ok) {pages=await response.json();break}
  } catch {}
  await delay(100)
 }
 const tab=pages?.find(page=>page.type==='page')
 if (!tab) throw Error('Chrome is not ready')
 socket = new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true})
  socket.addEventListener('error',reject,{once:true})
 })
 let seq=0
 const run=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq
  const handler=event=>{
   const message=JSON.parse(event.data)
   if (message.id!==id) return
   socket.removeEventListener('message',handler)
   message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result)
  }
  socket.addEventListener('message',handler)
  socket.send(JSON.stringify({id,method,params}))
 })
 const evaluate=async expression=>{
  const r=await run('Runtime.evaluate',{expression,returnByValue:true})
  if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
 }
 await run('Runtime.enable')
 await run('Page.enable')
 await run('Page.addScriptToEvaluateOnNewDocument',{source:`
  (() => {
   const original = window.fetch.bind(window)
   window.__staffRequests = 0
   window.fetch = (...args) => {
    const input = args[0]
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes('/rest/v1/staff')) {
     window.__staffRequests++
     return new Promise(resolve=>setTimeout(()=>resolve(original(...args)),1700))
    }
    return original(...args)
   }
  })()
 `})
 await run('Page.navigate',{url:root+'/'})
 await delay(3600)
 for (const [width,height] of [[1440,980],[1024,768],[390,844],[320,640]]) {
  await run('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<851})
  await delay(150)
  const state=await evaluate(`({
   innerWidth,innerHeight,viewportWidth:document.documentElement.clientWidth,
   documentWidth:document.documentElement.scrollWidth,
   documentHeight:document.documentElement.scrollHeight,
   height:document.querySelector('.site')?.getBoundingClientRect().height,
   heroHeight:document.querySelector('.home-hero')?.getBoundingClientRect().height,
   noteCount:document.querySelectorAll('.home-note').length,
   noteInsideHero:!!document.querySelector('.home-hero .home-note'),
   scrollbar:getComputedStyle(document.documentElement).scrollbarWidth,
   footerTop:Math.round(document.querySelector('.site-footer')?.getBoundingClientRect().top)
  })`)
  console.log('HOME',JSON.stringify(state))
  if (state.documentWidth>state.viewportWidth+1 || !state.noteInsideHero || state.noteCount!==1 || state.scrollbar!=='none') throw Error('Bad home layout at '+width)
  if (width>850 && height>=768 && state.documentHeight>height+12) throw Error('Unnecessary desktop homepage scroll at '+width)
 }
 await run('Emulation.setDeviceMetricsOverride',{width:1440,height:980,deviceScaleFactor:1,mobile:false})
 // Trigger navigation without hover so the request has to be delayed and the
 // animated skeleton can be inspected before Supabase responds.
 await evaluate('document.querySelector(".desktop-nav a[href$=staff]")?.click()')
 await delay(1040)
 const interim=await evaluate(`({
   path:location.pathname,
   loading:!!document.querySelector('.staff-loading'),
   cards:document.querySelectorAll('.staff-loading__card').length,
   requests:window.__staffRequests,
   caption:document.querySelector('.staff-loading__caption')?.textContent
 })`)
 console.log('LOADING',JSON.stringify(interim))
 if (!interim.loading || interim.cards!==2 || interim.requests!==1) throw Error('The delayed request did not show the animated skeleton')
 const skeletonShot = await run('Page.captureScreenshot', {format:'jpeg',quality:75,fromSurface:true})
 await writeFile(join(tmpdir(),'kogakure-loading-qa.jpg'),Buffer.from(skeletonShot.data,'base64'))
 for (let i=0;i<50;i++) {
  if (await evaluate('document.querySelectorAll(".omamori-card").length>=2 || !!document.querySelector(".error-message")')) break
  await delay(150)
 }
 const loaded=await evaluate(`({
  path:location.pathname,
  cardCount:document.querySelectorAll('.omamori-card').length,
  skeleton:!!document.querySelector('.staff-loading'),
  requests:window.__staffRequests,
  error:document.querySelector('.error-message')?.textContent
 })`)
 console.log('LOADED',JSON.stringify(loaded))
 if(loaded.cardCount!==2 || loaded.skeleton || loaded.requests!==1) throw Error('Staff did not replace placeholders correctly')
 await evaluate('document.querySelector(".desktop-nav a[href$=about]")?.click()')
 await delay(1600)
 await evaluate('document.querySelector(".desktop-nav a[href$=staff]")?.click()')
 await delay(1750)
 const returnTrip=await evaluate(`({
   cards:document.querySelectorAll('.omamori-card').length,
   requests:window.__staffRequests,
   skeleton:!!document.querySelector('.staff-loading')
 })`)
 console.log('RETURN TO STAFF',JSON.stringify(returnTrip))
 if(returnTrip.cards!==2 || returnTrip.requests!==1 || returnTrip.skeleton) throw Error('Cache did not prevent duplicate egress')
 console.log('PASS: home responsiveness, real loading animation, one Supabase query across navigation')
} finally {
 socket?.close()
 chrome.kill()
}
