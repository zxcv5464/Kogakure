// Cold first-visit Chromium regression for both live public pages.
// Mock only read-only Supabase REST requests with a 3.6-second delay.
// This ensures the branded page is usable/visible before data returns, and
// the guest never sees stale menu prices or unverified bookable staff.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const browser=[process.env.CHROME_BIN,'/usr/bin/google-chrome',
 '/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser',
].find(p=>p&&existsSync(p))
assert.ok(browser,'Chromium is needed for cold visit rendering checks')
const port=5398,debugPort=9498
const origin='http://127.0.0.1:'+port
const profile=await mkdtemp(join(tmpdir(),'kogakure-menu-booking-'))
const vite=spawn(process.execPath,[
 'node_modules/vite/bin/vite.js','--host','127.0.0.1',
 '--port',String(port),'--strictPort',
],{env:{...process.env,VITE_OFFLINE_PREVIEW:'false',
 VITE_BASE_PATH:'/Kogakure/',
 VITE_SUPABASE_URL:'https://public-page-test.invalid',
 VITE_SUPABASE_PUBLISHABLE_KEY:'test_public_browser_key'},stdio:'ignore'})
let chrome,socket
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(check,maxMs=16000){
 const began=Date.now()
 while(Date.now()-began<maxMs){
  try{const value=await check();if(value)return value}catch{}
  await sleep(70)
 }
 throw Error('Cold menu/booking page wait condition timed out')
}
try{
 await waitFor(async ()=>(await fetch(origin+'/Kogakure/')).ok)
 chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu',
  '--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--remote-allow-origins=*',
  '--remote-debugging-port='+debugPort,'--user-data-dir='+profile,
  'about:blank'],{stdio:'ignore'})
 const tab=await waitFor(async()=>{
  const r=await fetch('http://127.0.0.1:'+debugPort+'/json/list')
  return (await r.json()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl)
 })
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((ok,bad)=>{
  socket.addEventListener('open',ok,{once:true})
  socket.addEventListener('error',bad,{once:true})
 })
 let counter=0
 const handlers=new Map()
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++counter
  handlers.set(id,{resolve,reject})
  socket.send(JSON.stringify({id,method,params}))
 })
 socket.addEventListener('message',event=>{
  const packet=JSON.parse(event.data)
  if(packet.id===undefined)return
  const handler=handlers.get(packet.id)
  if(!handler)return
  handlers.delete(packet.id)
  packet.error?handler.reject(Error(packet.error.message)):handler.resolve(packet.result)
 })
 await send('Runtime.enable')
 await send('Page.enable')
 await send('Emulation.setDeviceMetricsOverride',{
  width:1330,height:850,deviceScaleFactor:1,mobile:false,
 })
 const mock="(()=>{"+
 "const old=window.fetch.bind(window);"+
 "window.__publicPageCalls=[];"+
 "window.fetch=(input,options)=>{"+
  "const url=typeof input==='string'?input:input?.url||'';"+
  "if(url.includes('public-page-test.invalid/rest/v1/')){"+
   "window.__publicPageCalls.push(url);"+
   "return new Promise(resolve=>setTimeout(()=>resolve("+
    "new Response('[]',{status:200,headers:{'content-type':'application/json'}})"+
   "),3600));"+
  "}return old(input,options);"+
 "};"+
 "})();"
 await send('Page.addScriptToEvaluateOnNewDocument',{source:mock})
 await send('Page.navigate',{url:origin+'/Kogakure/'})
 async function evalJS(expression){
  const result=await send('Runtime.evaluate',{expression,returnByValue:true})
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text)
  return result.result.value
 }
 await waitFor(()=>evalJS("!!document.querySelector('.intro-entry-action:not(:disabled)')"))
 await evalJS("document.querySelector('.intro-entry-action').click()")
 await waitFor(()=>evalJS("!document.querySelector('.entry-intro')"))

 // First visit: no menu catalog was cached, so the 2 requests really wait.
 const menuClick=await evalJS("performance.now()")
 await evalJS("document.querySelector('.desktop-nav a[href$=\"/menu\"]').click()")
 await waitFor(()=>evalJS("!!document.querySelector('.tea-menu-loading-stage')"))
 const menuPending=await evalJS("(()=>({"+
  "title:document.querySelector('.tea-menu-hero h1')?.textContent,"+
  "loading:!!document.querySelector('.tea-menu-loading-stage'),"+
  "items:document.querySelectorAll('.tea-menu-item').length,"+
  "queries:window.__publicPageCalls.filter(url=>url.includes('menu_categories')||url.includes('menu_items')).length"+
 "}))()")
 assert.equal(menuPending.title,'狐之茶宴')
 assert.equal(menuPending.loading,true)
 assert.equal(menuPending.items,0,'Do not flash demonstration prices during a live read')
 assert.equal(menuPending.queries,2,'Menu needs one read per published table')
 await waitFor(()=>evalJS("!!document.querySelector('.page-transition-curtain.is-quick.is-revealing')"),2500)
 const menuRevealMs=await evalJS("performance.now()")-menuClick
 assert.ok(menuRevealMs<1800,'Cold menu route should reveal before 1.8 seconds, not await slow Supabase: '+Math.round(menuRevealMs)+'ms')
 const menuDuration=await evalJS("getComputedStyle(document.querySelector('.page-transition-curtain')).transitionDuration")
 assert.equal(menuDuration,'0.41s','Quick menu reveal CSS must match the 410ms transition timer')
 assert.equal(await evalJS("!!document.querySelector('.tea-menu-loading-stage')"),true,
  'The curtain must reveal a visible menu header and stable loading area before backend responds')
 await waitFor(()=>evalJS("!document.querySelector('.tea-menu-loading-stage')"),8000)
 assert.equal(await evalJS("!!document.querySelector('.tea-menu-state')"),true,
  'Empty confirmed live menu should show no-dishes state, not preview dishes')
 assert.equal(await evalJS("document.querySelectorAll('.tea-menu-item').length"),0)
 assert.equal(await evalJS("window.__publicPageCalls.filter(url=>url.includes('menu_categories')||url.includes('menu_items')).length"),2)

 // First booking visit: 3 new requests (published staff, plans, presence).
 const bookingClick=await evalJS("performance.now()")
 await evalJS("document.querySelector('.desktop-nav a[href$=\"/booking\"]').click()")
 await waitFor(()=>evalJS("!!document.querySelector('.booking-loading-stage')"))
 const bookingPending=await evalJS("(()=>({"+
  "title:document.querySelector('.booking-hero h1')?.textContent,"+
  "loading:!!document.querySelector('.booking-loading-stage'),"+
  "cards:document.querySelectorAll('.booking-profile').length,"+
  "calls:window.__publicPageCalls.filter(url=>"+
   "url.includes('/staff?')||url.includes('/booking_plans?')||url.includes('/staff_booking_presence?')).length"+
 "}))()")
 assert.equal(bookingPending.title,'狐隱指名')
 assert.equal(bookingPending.loading,true)
 assert.equal(bookingPending.cards,0,'Do not imply a staff member is available before presence arrives')
 assert.equal(bookingPending.calls,3,'Three booking read-only calls must be deduplicated')
 await waitFor(()=>evalJS("!!document.querySelector('.page-transition-curtain.is-quick.is-revealing')"),2500)
 const bookingRevealMs=await evalJS("performance.now()")-bookingClick
 assert.ok(bookingRevealMs<1800,'Cold booking route should reveal before 1.8 seconds, not await slow Supabase: '+Math.round(bookingRevealMs)+'ms')
 const bookingDuration=await evalJS("getComputedStyle(document.querySelector('.page-transition-curtain')).transitionDuration")
 assert.equal(bookingDuration,'0.41s','Quick booking reveal CSS must match the 410ms transition timer')
 assert.equal(await evalJS("!!document.querySelector('.booking-loading-stage')"),true,
  'The booking title must be revealed before all three queries settle')
 await waitFor(()=>evalJS("!document.querySelector('.booking-loading-stage')"),8500)
 assert.equal(await evalJS("!!document.querySelector('.booking-notice')"),true,
  'Empty confirmed staff list should show no nominees, not fake bookable cards')
 assert.equal(await evalJS("document.querySelectorAll('.booking-profile').length"),0)
 assert.equal(await evalJS("window.__publicPageCalls.filter(url=>url.includes('menu_categories')||url.includes('menu_items')).length"),2,
  'Navigating to booking should not re-fetch or remount the menu')
 console.log('PASS: cold menu and booking reveal quickly ('+Math.round(menuRevealMs)+'ms / '+Math.round(bookingRevealMs)+'ms) before 2/3 slow Supabase reads; no stale prices or false booking cards')
}finally{
 socket?.close()
 const closed=chrome&&chrome.exitCode===null
  ?new Promise(resolve=>chrome.once('close',resolve)):Promise.resolve()
 chrome?.kill()
 vite.kill()
 await Promise.race([closed,sleep(1800)])
 try{await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:250})}
 catch(error){console.warn('Temporary Chrome profile cleanup incomplete:',error)}
}
