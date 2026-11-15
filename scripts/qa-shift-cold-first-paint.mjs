// Real Chromium test: three deliberately delayed Supabase reads on FIRST visit.
// While they are pending, the four-week calendar must already be fully mounted.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const browser=[process.env.CHROME_BIN,'/usr/bin/google-chrome',
 '/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser',
].find(file=>file&&existsSync(file))
assert.ok(browser,'Chromium required for shift first-load regression')
const port=5393,remotePort=9493
const origin='http://127.0.0.1:'+port
const profile=await mkdtemp(join(tmpdir(),'kogakure-first-shifts-'))
const vite=spawn(process.execPath,[
 'node_modules/vite/bin/vite.js','--host','127.0.0.1',
 '--port',String(port),'--strictPort',
],{env:{...process.env,VITE_OFFLINE_PREVIEW:'false',
 VITE_BASE_PATH:'/Kogakure/',VITE_SUPABASE_URL:'https://shift-load-test.invalid',
 VITE_SUPABASE_PUBLISHABLE_KEY:'browser_public_fake_key'},stdio:'ignore'})
let chrome,socket
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(test,ms=13000){
 const start=Date.now()
 while(Date.now()-start<ms){
  try{const result=await test();if(result)return result}catch{}
  await sleep(65)
 }
 throw Error('Cold first visit shift calendar condition timed out')
}
try{
 await waitFor(async ()=>(await fetch(origin+'/Kogakure/')).ok)
 chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu',
  '--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--remote-allow-origins=*',
  '--remote-debugging-port='+remotePort,'--user-data-dir='+profile,
  'about:blank'],{stdio:'ignore'})
 const tab=await waitFor(async()=>{
  const r=await fetch('http://127.0.0.1:'+remotePort+'/json/list')
  return (await r.json()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl)
 })
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((ok,bad)=>{
  socket.addEventListener('open',ok,{once:true})
  socket.addEventListener('error',bad,{once:true})
 })
 let nextId=0
 const pending=new Map()
 function send(method,params={}){
  return new Promise((resolve,reject)=>{
   const id=++nextId
   pending.set(id,{resolve,reject})
   socket.send(JSON.stringify({id,method,params}))
  })
 }
 socket.addEventListener('message',message=>{
  const packet=JSON.parse(message.data)
  if(packet.id===undefined)return
  const cb=pending.get(packet.id)
  if(!cb)return
  pending.delete(packet.id)
  packet.error?cb.reject(Error(packet.error.message)):cb.resolve(packet.result)
 })
 await send('Runtime.enable')
 await send('Page.enable')
 await send('Emulation.setDeviceMetricsOverride',{
  width:1360,height:900,deviceScaleFactor:1,mobile:false,
 })
 // Inject fake HTTP responses before site code starts; nothing contacts the
 // live Supabase server and every request remains unresolved for 3.8 seconds.
 const mock="(()=>{"+
  "const oldFetch=window.fetch.bind(window);window.__mockShiftCalls=0;"+
  "window.fetch=(resource,options)=>{"+
   "const url=typeof resource==='string'?resource:resource?.url||'';"+
   "if(url.includes('shift-load-test.invalid/rest/v1/')){"+
    "window.__mockShiftCalls++;"+
    "return new Promise(resolve=>window.setTimeout(()=>resolve("+
     "new Response('[]',{status:200,headers:{'content-type':'application/json'}})"+
    "),3800));"+
   "}return oldFetch(resource,options);"+
  "};"+
 "})();"
 await send('Page.addScriptToEvaluateOnNewDocument',{source:mock})
 await send('Page.navigate',{url:origin+'/Kogakure/'})
 async function evaluate(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true})
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text)
  return r.result.value
 }
 await waitFor(()=>evaluate("!!document.querySelector('.intro-entry-action:not(:disabled)')"))
 await evaluate("document.querySelector('.intro-entry-action').click()")
 await waitFor(()=>evaluate("!document.querySelector('.entry-intro')"))
 await evaluate("document.querySelector('.desktop-nav a[href$=\"/shifts\"]').click()")
 await waitFor(()=>evaluate("document.querySelectorAll('.shift-day').length===28"))
 const before=await evaluate("(()=>{"+
  "const days=[...document.querySelectorAll('.shift-day')];"+
  "const shell=document.querySelector('.shift-calendar-shell');"+
  "window.__firstDay=days[0];window.__firstShell=shell;"+
  "return{busy:shell?.getAttribute('aria-busy'),"+
   "count:days.length,disabled:days.filter(d=>d.disabled).length,"+
   "statuses:days.map(d=>d.querySelector('.shift-status')?.textContent),"+
   "fallback:!!document.querySelector('.empty-staff'),"+
   "calls:window.__mockShiftCalls};"+
  "})()")
 assert.equal(before.count,28,'The full calendar must mount before network replies')
 assert.equal(before.busy,'true','Mark the initial calendar as pending')
 assert.equal(before.disabled,28,'Unknown days must not be clickable')
 assert.ok(before.statuses.every(s=>s==='讀取中'),'Unknown days must not appear closed')
 assert.equal(before.fallback,false,'Never show the general lazy-route fallback')
 assert.equal(before.calls,3,'Exactly three read-only schedule queries expected')
 await waitFor(()=>evaluate("!!document.querySelector('.page-transition-curtain.is-revealing')"),3700)
 const during=await evaluate("(()=>{const shell=document.querySelector('.shift-calendar-shell');return{"+
  "count:document.querySelectorAll('.shift-day').length,"+
  "busy:shell?.getAttribute('aria-busy'),"+
  "fallback:!!document.querySelector('.empty-staff')};})()")
 assert.equal(during.count,28)
 assert.equal(during.busy,'true','Reveal the ready calendar, not an empty frame')
 assert.equal(during.fallback,false)
 await waitFor(()=>evaluate("document.querySelector('.shift-calendar-shell')?.getAttribute('aria-busy')==='false'"),9000)
 const after=await evaluate("(()=>{const days=[...document.querySelectorAll('.shift-day')];return{"+
  "sameShell:document.querySelector('.shift-calendar-shell')===window.__firstShell,"+
  "sameDay:days[0]===window.__firstDay,count:days.length,"+
  "closed:days.filter(d=>d.textContent.includes('休館')).length,"+
  "disabled:days.filter(d=>d.disabled).length,"+
  "calls:window.__mockShiftCalls,"+
  "error:!!document.querySelector('.shift-message.is-error')};})()")
 assert.equal(after.sameShell,true,'Live data must not remount the calendar')
 assert.equal(after.sameDay,true,'Date buttons must retain DOM identity after initial fetch')
 assert.equal(after.count,28)
 assert.equal(after.closed,28,'Confirmed empty schedule defaults to closed, never before')
 assert.equal(after.disabled,0,'Confirmed dates are selectable')
 assert.equal(after.calls,3,'Do not duplicate the initial fetch')
 assert.equal(after.error,false,'Mocked successful fetch should show no error')
 console.log('PASS: first shifts visit paints 28 neutral days before slow Supabase; curtain waits for the first paint; data updates cells without remount')
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
