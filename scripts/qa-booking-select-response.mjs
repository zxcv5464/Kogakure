// Chromium mobile regression for public nomination selects; read-only fake data.
// Verifies the live form responds without the 1Hz page-wide redraw/background slides.
import assert from 'node:assert/strict'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const [page,css,gallery,worlds]=await Promise.all([
 'src/pages/BookingPage.tsx','src/pages/booking-page.css',
 'src/components/MysticPhotoGallery.tsx','src/components/TcWorldSelect.tsx'
].map(x=>readFile(x,'utf8')))
assert.ok(!page.includes('setInterval(()=>setNow(Date.now()),1000)')&&
 page.includes('window.setTimeout(()=>setNow(Date.now()),delay)')&&
 page.includes('const bookingCards=useMemo(')&&
 page.includes('const openBooking=useCallback(')&&
 page.includes('paused={isDialogOpen}')&&
 gallery.includes('paused=false')&&gallery.includes('||paused||'),
 'Busy status changes must schedule at actual deadlines and freeze background slides during editing')
const shade=css.match(/\.booking-modal-shade\{[^}]+\}/)?.[0]||''
assert.ok(shade.includes('background:rgba(8,9,14,.92)')&&!shade.includes('backdrop-filter'),
 'Avoid repaint-heavy full-screen backdrop blur beneath native dropdowns')
assert.ok(page.includes('<TcWorldSelect value={world} onChange={setWorld}/>')&&
 worlds.includes('onChange(event.target.value)')&&
 page.includes('setPlanId(e.target.value);setOthers([]);setWithOthers(false)'),
 'Nomination World/plan choices must preserve controlled input and nominee reset behavior')

const browser=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
 '/usr/bin/chromium','/usr/bin/chromium-browser'].find(x=>x&&existsSync(x))
assert.ok(browser,'Chromium is required for native-select interaction regression')
const port=5397,debugPort=9497,origin='http://127.0.0.1:'+port
const profile=await mkdtemp(join(tmpdir(),'kogakure-booking-select-'))
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {env:{...process.env,VITE_OFFLINE_PREVIEW:'false',VITE_BASE_PATH:'/Kogakure/',
 VITE_SUPABASE_URL:'https://booking-select-test.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'test_public_browser_key'},stdio:'ignore'})
let chrome,socket
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(check,label,maxMs=16000){
 const since=Date.now()
 while(Date.now()-since<maxMs){
  try{const result=await check();if(result)return result}catch{}
  await sleep(65)
 }
 throw Error('Timed out: '+label)
}
const photo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="580"><rect width="400" height="580" fill="#453f63"/></svg>').toString('base64')
const photo2='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="580"><rect width="400" height="580" fill="#59445a"/></svg>').toString('base64')
const staffId='11111111-1111-4111-8111-111111111111'
const planOne='22222222-2222-4222-8222-222222222222'
const planTwo='33333333-3333-4333-8333-333333333333'
const staff=[{id:staffId,display_name:'測試狐姬',role:'狐姬',tagline:'測試名帖',bio:'',image_url:'',
 thumbnail_url:'',theme_color:'#ad8e7b',effect:'none',socials:[],services:[],sort_order:1,
 is_published:true,is_booking_visible:true,booking_allowed_plan_ids:null,booking_allow_joint:true,booking_plan_caps:{}}]
const plans=[
 {id:planOne,name:'湯浴之儀',description:'舒適湯浴',duration_minutes:30,price_gil:null,sort_order:1,is_active:true,allow_joint_nomination:true,max_accepted_bookings:null,updated_at:'2026-11-28T00:00:00Z'},
 {id:planTwo,name:'占卜之儀',description:'星詠指引',duration_minutes:45,price_gil:null,sort_order:2,is_active:true,allow_joint_nomination:true,max_accepted_bookings:null,updated_at:'2026-11-28T00:00:00Z'},
]
const bookingPhotos=[{staff_id:staffId,image_url:photo,object_path:null,photo_gallery:[
 {id:'1',image_url:photo,thumbnail_url:photo,image_path:null,thumbnail_path:null},
 {id:'2',image_url:photo2,thumbnail_url:photo2,image_path:null,thumbnail_path:null}],
 photo_display_mode:'gallery',secondary_image_url:null,secondary_object_path:null,updated_at:'2026-11-28T00:00:00Z'}]
try{
 await waitFor(async()=>(await fetch(origin+'/Kogakure/')).ok,'local test server')
 chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--disable-background-networking','--remote-allow-origins=*',
  '--remote-debugging-port='+debugPort,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
 const tab=await waitFor(async()=>(await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json())
  .find(x=>x.type==='page'&&x.webSocketDebuggerUrl),'Chromium debugging page')
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 let id=0;const handlers=new Map()
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;handlers.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}))})
 socket.addEventListener('message',event=>{
  const packet=JSON.parse(event.data);if(packet.id===undefined)return
  const handler=handlers.get(packet.id);if(!handler)return;handlers.delete(packet.id)
  packet.error?handler.reject(Error(packet.error.message)):handler.resolve(packet.result)
 })
 async function evaluate(expression){
  const result=await send('Runtime.evaluate',{expression,returnByValue:true})
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text)
  return result.result.value
 }
 await send('Runtime.enable');await send('Page.enable')
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 const mock='(()=>{const original=window.fetch.bind(window);const staff='+JSON.stringify(staff)+
  ';const plans='+JSON.stringify(plans)+';const photos='+JSON.stringify(bookingPhotos)+
  ';window.fetch=(input,options)=>{const url=typeof input==="string"?input:input?.url||"";'+
  'if(!url.includes("booking-select-test.invalid/rest/v1/"))return original(input,options);'+
  'const body=url.includes("/staff?")?staff:url.includes("/booking_plans?")?plans:'+
  'url.includes("/booking_staff_photos?")?photos:url.includes("/rpc/get_booking_quota_usage")?{plans:{},staff:{}}:[];'+
  'return Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}}));};})()'
 await send('Page.addScriptToEvaluateOnNewDocument',{source:mock})
 await send('Page.navigate',{url:origin+'/Kogakure/booking'})
 await waitFor(()=>evaluate("!!document.querySelector('.intro-entry-action:not(:disabled)')"),'entry')
 await evaluate("document.querySelector('.intro-entry-action').click()")
 await waitFor(()=>evaluate("!document.querySelector('.entry-intro')&&!!document.querySelector('.booking-profile-action')"),'booking cards')
 await evaluate("document.querySelector('.booking-profile-action').click()")
 await waitFor(()=>evaluate("document.querySelectorAll('.booking-form select').length===2"),'world and plan selectors')
 const initial=await evaluate("(()=>({worlds:document.querySelectorAll('.booking-form select')[0].options.length,plans:document.querySelectorAll('.booking-form select')[1].options.length,blur:getComputedStyle(document.querySelector('.booking-modal-shade')).backdropFilter,photoCount:document.querySelectorAll('.booking-grid .mystic-photo-gallery').length}))()")
 assert.equal(initial.worlds,8)
 assert.equal(initial.plans,3)
 assert.equal(initial.blur,'none')
 assert.ok(initial.photoCount>0,'Background photos should still appear, just not rotate while choosing')

 const startWorld=Date.now()
 await evaluate("(()=>{const select=document.querySelectorAll('.booking-form select')[0];const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,'利維坦');select.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await waitFor(()=>evaluate("document.querySelectorAll('.booking-form select')[0]?.value==='利維坦'"),'World selection')
 const worldMs=Date.now()-startWorld

 const startPlan=Date.now()
 await evaluate("(()=>{const select=document.querySelectorAll('.booking-form select')[1];const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,'"+planTwo+"');select.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await waitFor(()=>evaluate("document.querySelector('.booking-plan-note')?.textContent?.includes('星詠指引')"),'plan description refresh')
 const planMs=Date.now()-startPlan
 await evaluate("(()=>{const input=document.querySelector('.booking-form input[required]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'測試旅人');input.dispatchEvent(new Event('input',{bubbles:true}))})()")
 await sleep(1250)
 const final=await evaluate("(()=>({world:document.querySelectorAll('.booking-form select')[0].value,plan:document.querySelectorAll('.booking-form select')[1].value,note:document.querySelector('.booking-plan-note')?.textContent,preview:!!document.querySelector('.booking-selected-gallery'),modal:!!document.querySelector('.booking-modal')}))()")
 assert.equal(final.world,'利維坦','World must remain selected after input updates and idle time')
 assert.equal(final.plan,planTwo,'Plan must remain selected after input updates and idle time')
 assert.ok(final.note?.includes('星詠指引'),'Plan description should reflect chosen option')
 assert.ok(final.modal&&final.preview)
 assert.ok(worldMs<700&&planMs<700,'World/plan selection update should respond without slow page-wide rendering: '+worldMs+'ms / '+planMs+'ms')
 console.log('PASS: mobile 390px world/plan selectors respond in '+worldMs+'ms / '+planMs+'ms; no full-screen backdrop blur, idle 1.25s preserves values, background gallery paused')
}finally{
 socket?.close()
 const closed=chrome&&chrome.exitCode===null?new Promise(resolve=>chrome.once('close',resolve)):Promise.resolve()
 chrome?.kill();vite.kill()
 await Promise.race([closed,sleep(1800)])
 try{await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:250})}catch(error){console.warn('Temporary Chromium profile cleanup incomplete:',error)}
}
