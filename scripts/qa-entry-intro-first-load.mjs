// Real cold-cache browser regression test for the original logo entrance.
// Deliberately delay logo-intro.webp so first-time users never miss its fade.
// Run after npm run build; needs Google Chrome/Chromium on the CI runner.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const chromeBin=[
 process.env.CHROME_BIN,
 '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
 '/usr/bin/chromium','/usr/bin/chromium-browser',
].find(binary=>binary&&existsSync(binary))
assert.ok(chromeBin,'A Chrome/Chromium browser is required to verify the first visit')

const webPort=5379,debugPort=9479
const origin='http://127.0.0.1:'+webPort
const profile=await mkdtemp(join(tmpdir(),'kogakure-cold-intro-'))
const web=spawn(process.execPath,[
 'node_modules/vite/bin/vite.js','preview','--host','127.0.0.1',
 '--port',String(webPort),'--strictPort',
],{env:{...process.env,VITE_BASE_PATH:'/Kogakure/'},stdio:'ignore'})
let chrome,socket
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(check,limit=9000){
 const start=Date.now()
 while(Date.now()-start<limit){
  try{const result=await check();if(result)return result}catch{/* Browser may still be booting. */}
  await sleep(65)
 }
 throw new Error('Cold-first-visit condition timed out after '+limit+' ms')
}

try{
 await waitFor(async()=>{
  const response=await fetch(origin+'/Kogakure/')
  return response.ok
 },14000)

 chrome=spawn(chromeBin,[
  '--headless=new','--no-sandbox','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--disable-background-networking',
  '--remote-allow-origins=*','--remote-debugging-port='+debugPort,
  '--user-data-dir='+profile,'about:blank',
 ],{stdio:'ignore'})
 const tabs=await waitFor(async()=>{
  const response=await fetch('http://127.0.0.1:'+debugPort+'/json/list')
  const items=await response.json()
  return items.find(item=>item.type==='page'&&item.webSocketDebuggerUrl)
 },14000)

 socket=new WebSocket(tabs.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true})
  socket.addEventListener('error',reject,{once:true})
 })
 let nextId=0
 const pending=new Map()
 let paused=0
 function send(method,params={}){
  return new Promise((resolve,reject)=>{
   const id=++nextId
   pending.set(id,{resolve,reject})
   socket.send(JSON.stringify({id,method,params}))
  })
 }
 socket.addEventListener('message',event=>{
  const packet=JSON.parse(event.data)
  if(packet.id!==undefined){
   const handler=pending.get(packet.id)
   if(handler){pending.delete(packet.id);packet.error?handler.reject(Error(packet.error.message)):handler.resolve(packet.result)}
  }
  if(packet.method==='Fetch.requestPaused'){
   paused++
   // A cold first-time visit should load JavaScript and the hidden intro
   // BEFORE the hero logo is available, just like a slow phone network.
   setTimeout(()=>{
    void send('Fetch.continueRequest',{requestId:packet.params.requestId}).catch(()=>{})
   },2400)
  }
 })
 await send('Runtime.enable')
 await send('Page.enable')
 await send('Network.enable')
 await send('Network.setCacheDisabled',{cacheDisabled:true})
 await send('Fetch.enable',{patterns:[{urlPattern:'*logo-intro.webp',requestStage:'Request'}]})
 await send('Page.navigate',{url:origin+'/Kogakure/'})
 async function evaluate(expression){
  const response=await send('Runtime.evaluate',{expression,returnByValue:true})
  if(response.exceptionDetails)throw Error(response.exceptionDetails.text)
  return response.result.value
 }
 const state=()=>evaluate(`(()=>{
  const intro=document.querySelector('.entry-intro')
  const logo=document.querySelector('.intro-seal')
  const button=document.querySelector('.intro-entry-action')
  if(!intro||!logo||!button)return null
  const logoStyle=getComputedStyle(logo),buttonStyle=getComputedStyle(button)
  return{
   preparing:intro.classList.contains('is-preparing'),
   logoAnimation:logoStyle.animationName,
   logoOpacity:Number(logoStyle.opacity),
   buttonOpacity:Number(buttonStyle.opacity),
   buttonDisabled:button.disabled,
   logoDecoded:!!document.querySelector('.intro-seal img')?.naturalWidth,
   buttonText:button.textContent.trim(),
  }
 })()`)
 await waitFor(()=>paused>0)
 const preparing=await waitFor(async()=>{const s=await state();return s?.preparing?s:null})
 assert.equal(preparing.logoAnimation,'none','Cold logo must stay unanimated until loaded')
 assert.equal(preparing.logoOpacity,0,'Cold logo must not flash or arrive without an animation')
 assert.equal(preparing.buttonOpacity,0,'The enter button must not appear abruptly on cold load')
 assert.equal(preparing.buttonDisabled,true,'Entry must stay disabled before sequence finishes')
 const animating=await waitFor(async()=>{
  const s=await state()
  return s&&!s.preparing&&s.logoAnimation.includes('intro-seal-arrive')?s:null
 },9000)
 assert.equal(animating.logoDecoded,true,'Logo must finish decoding before animation begins')
 assert.equal(animating.buttonDisabled,true,'The button must not activate before its delayed fade')
 await sleep(240)
 const middle=await state()
 assert.ok(middle.logoOpacity>0&&middle.logoOpacity<1,
  'Logo must visibly fade between transparent and opaque on first load')
 assert.ok(middle.buttonOpacity<.1,
  'The button must still be transparent while the logo begins appearing')
 const ready=await waitFor(async()=>{
  const s=await state()
  return s&&!s.buttonDisabled?s:null
 },6000)
 assert.equal(ready.buttonText,'進入狐隱','The entry button must keep its short label')
 assert.ok(ready.buttonOpacity>.98,'Button should finish fading in after the slogan')
 await evaluate("document.querySelector('.intro-entry-action').click()")
 await waitFor(()=>evaluate("!document.querySelector('.entry-intro')"),4500)
 assert.equal(await evaluate("document.querySelectorAll('audio').length"),1,
  'Only the original persistent site-wide BGM player may exist')
 console.log('PASS: first uncached load preps the logo, visibly fades all entrance elements, opens with one click and keeps BGM')
}finally{
 socket?.close()
 const chromeClosed=chrome&&chrome.exitCode===null
  ?new Promise(resolve=>chrome.once('close',resolve)):Promise.resolve()
 chrome?.kill()
 web.kill()
 // Chrome's profile writer can outlive the main window briefly. Wait for
 // process shutdown and retry cleanup instead of failing a passed UI test.
 await Promise.race([chromeClosed,sleep(1800)])
 try{await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:250})}
 catch(error){console.warn('Browser QA passed, but temporary Chrome profile cleanup was incomplete:',error)}
}
