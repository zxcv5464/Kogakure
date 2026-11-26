// Actual Chromium regression: measured full names, immediate dialog and delayed originals.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const browser=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
 '/usr/bin/chromium','/usr/bin/chromium-browser','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>p&&existsSync(p))
assert.ok(browser,'Chromium is required for staff detail regression')
const port=5399,debugPort=9499,origin='http://127.0.0.1:'+port
const profile=await mkdtemp(join(tmpdir(),'kogakure-staff-detail-'))
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {env:{...process.env,VITE_OFFLINE_PREVIEW:'false',VITE_BASE_PATH:'/Kogakure/',
 VITE_SUPABASE_URL:'https://staff-detail-test.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'test_public_browser_key'},stdio:'ignore'})
let chrome,socket
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(check,label,maxMs=15000){
 const start=Date.now()
 while(Date.now()-start<maxMs){
  try{const value=await check();if(value)return value}catch{}
  await sleep(75)
 }
 throw Error('Timed out: '+label)
}
const names=['月詠','吹雪｜朝武芳乃・狐隱名冊長姓名測試用角色','狐隱名帖長姓名測試'.repeat(6)]
const rows=names.map((name,i)=>({id:'staff-qa-'+i,display_name:name,role:'星詠',tagline:'願今夜有幸與你同行。',bio:'名帖測試介紹。',
 image_url:'https://portrait-qa.invalid/full-'+i+'.svg',thumbnail_url:'https://portrait-qa.invalid/thumb-'+i+'.svg',
 theme_color:'#82c8bc',effect:'none',socials:[],services:[],is_published:true,is_booking_visible:true,
 booking_allowed_plan_ids:null,booking_allow_joint:true,booking_plan_caps:{},sort_order:i,photo_display_mode:'single'}))
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#756689"/><circle cx="150" cy="110" r="65" fill="#ddc7a5"/></svg>').toString('base64')
try{
 await waitFor(async()=>(await fetch(origin+'/Kogakure/')).ok,'Vite server')
 chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--remote-allow-origins=*','--remote-debugging-port='+debugPort,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
 const tab=await waitFor(async()=>(await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl),'browser')
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 let id=0;const handlers=new Map(),held=[]
 let releaseOriginal=false
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;handlers.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}))})
 const fulfill=requestId=>send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[
  {name:'Content-Type',value:'image/svg+xml'},{name:'Cache-Control',value:'max-age=600'}],body:svg})
 socket.addEventListener('message',event=>{
  const packet=JSON.parse(event.data)
  if(packet.id!==undefined){const h=handlers.get(packet.id);if(h){handlers.delete(packet.id);packet.error?h.reject(Error(packet.error.message)):h.resolve(packet.result)}}
  if(packet.method==='Fetch.requestPaused'){
   const {requestId,request}=packet.params
   if(!releaseOriginal&&request.url.includes('full-1.svg'))held.push(requestId)
   else void fulfill(requestId).catch(()=>{})
  }
 })
 async function evaluate(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true})
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text)
  return r.result.value
 }
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable')
 await send('Fetch.enable',{patterns:[{urlPattern:'https://portrait-qa.invalid/*',requestStage:'Request'}]})
 await send('Page.addScriptToEvaluateOnNewDocument',{source:
  '(()=>{const old=window.fetch.bind(window);const rows='+JSON.stringify(rows)+';window.fetch=(input,options)=>{const url=typeof input==="string"?input:input?.url||"";if(url.includes("staff-detail-test.invalid/rest/v1/"))return Promise.resolve(new Response(JSON.stringify(url.includes("/staff?")?rows:[]),{status:200,headers:{"content-type":"application/json"}}));return old(input,options)}})()'})
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await send('Page.navigate',{url:origin+'/Kogakure/staff'})
 await waitFor(()=>evaluate("!!document.querySelector('.intro-entry-action:not(:disabled)')"),'entry')
 await evaluate("document.querySelector('.intro-entry-action').click()")
 await waitFor(()=>evaluate("!document.querySelector('.entry-intro') && document.querySelectorAll('.card-name-text').length===3"),'staff cards')
 for(const [width,height] of [[320,640],[390,844],[768,900],[1440,900]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<571})
  await sleep(400)
  const measurements=await evaluate(`[...document.querySelectorAll('.card-name')].map(box=>{
   const t=box.querySelector('.card-name-text')
   return {name:t.textContent,font:parseFloat(getComputedStyle(t).fontSize),base:parseFloat(getComputedStyle(box).fontSize),
    width:box.clientWidth,scroll:t.scrollWidth,ellipsis:getComputedStyle(box).textOverflow}
  })`)
  assert.deepEqual(measurements.map(x=>x.name),names)
  assert.ok(measurements.every(x=>x.scroll<=x.width+1&&x.ellipsis!=='ellipsis'),'Name must fit without truncation at '+width+': '+JSON.stringify(measurements))
  assert.ok(measurements[1].font<measurements[1].base,'Longer name should shrink at '+width)
  assert.ok(measurements[2].font>=11.9,'Very long name must wrap rather than become tiny')
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await evaluate("document.querySelectorAll('.omamori-card')[1].scrollIntoView({block:'center'})")
 await waitFor(()=>evaluate("!!document.querySelectorAll('.omamori-card')[1].querySelector('img.is-visible')?.naturalWidth"),'cached card thumbnail')
 await evaluate("document.querySelectorAll('.omamori-card')[1].click()")
 await waitFor(()=>held.length>0,'paused high-resolution photo')
 await waitFor(()=>evaluate("!!document.querySelector('.staff-dialog .staff-detail-preview')?.naturalWidth"),'visible thumbnail')
 await sleep(500)
 const pending=await evaluate(`(()=>{const d=document.querySelector('.dialog-shell'),p=document.querySelector('.staff-detail-preview'),o=document.querySelector('.staff-detail-original');return {animation:getComputedStyle(d).animationName,opacity:Number(getComputedStyle(d).opacity),thumb:p.naturalWidth,original:o.naturalWidth,photoOpacity:Number(getComputedStyle(o).opacity),fit:getComputedStyle(o).objectFit,title:document.querySelector('#detail-name').textContent}})()`)
 assert.equal(pending.title,names[1]);assert.ok(pending.opacity>.95&&pending.thumb>0&&pending.original===0&&pending.photoOpacity===0,'Detail must open with preview before full image: '+JSON.stringify(pending))
 assert.equal(pending.animation,'staffDialogEntrance');assert.equal(pending.fit,'contain')
 releaseOriginal=true;await Promise.all(held.splice(0).map(fulfill))
 await waitFor(()=>evaluate("document.querySelector('.staff-detail-original')?.naturalWidth>0 && Number(getComputedStyle(document.querySelector('.staff-detail-original')).opacity)>.98 && !document.querySelector('.staff-detail-preview')"),'decoded original crossfade')
 await evaluate("document.querySelector('.dialog-close').click()")
 await waitFor(()=>evaluate("!document.querySelector('.staff-dialog') && document.body.style.overflow!=='hidden'"),'dialog closed')
 console.log('PASS: complete responsive staff names at four viewports, readable wrapped fallback, dialog opens while full image is held, cached thumbnail remains until decoded original fades in')
}finally{
 socket?.close();const closed=chrome&&chrome.exitCode===null?new Promise(resolve=>chrome.once('close',resolve)):Promise.resolve()
 chrome?.kill();vite.kill();await Promise.race([closed,sleep(1800)])
 try{await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:250})}catch(error){console.warn('Temporary browser profile cleanup incomplete:',error)}
}
