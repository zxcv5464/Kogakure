import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const origin = process.env.QA_SITE || 'http://127.0.0.1:5361/Kogakure/'
const port = 9411
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce','--remote-allow-origins=*',
 '--remote-debugging-port='+port,
 '--user-data-dir=C:/Windows/Temp/kogakure-catalog-qa-'+port,
 'about:blank',
],{stdio:'ignore'})
let socket
try {
 let tabs
 for(let n=0;n<100;n++){
  try {const response=await fetch('http://127.0.0.1:'+port+'/json/list');if(response.ok){tabs=await response.json();break}}catch{}
  await wait(100)
 }
 const tab=tabs?.find(item=>item.type==='page')
 if(!tab)throw Error('Chrome unavailable')
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 let seq=0
 const command=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq
  const fn=e=>{const response=JSON.parse(e.data);if(response.id!==id)return;socket.removeEventListener('message',fn);response.error?reject(Error(JSON.stringify(response.error))):resolve(response.result)}
  socket.addEventListener('message',fn)
  socket.send(JSON.stringify({id,method,params}))
 })
 const evaluate=async expression=>{
  const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
 }
 const until=async expression=>{
  for(let n=0;n<90;n++){
   if(await evaluate(expression))return
   await wait(125)
  }
  console.log('DEBUG',await evaluate('({url:location.href,body:document.body.innerText.slice(0,500)})'))
  throw Error('Timeout: '+expression)
 }
 const bootstrap=`(() => {
  const names=['朝武芳乃','古嘿嘿','狐姬丙','狐姬丁','狐姬戊','狐姬己','狐姬庚']
  const many=new URLSearchParams(location.search).get('qa')==='many'
  const size=many?7:2
  window.__qaCalls=0
  const native=window.fetch.bind(window)
  window.fetch=(input,options={})=>{
   const url=String(typeof input==='string'?input:input.url)
   if(url.includes('/rest/v1/staff')){
    window.__qaCalls++
    const rows=Array.from({length:size},(_,i)=>({
     id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
     display_name:names[i],role:i===0?'星詠':'接待者',
     tagline:'靜靜在狐隱與你相遇',bio:'一段狐姬的小故事',
     image_url:location.origin+'/Kogakure/images/staff/staff-'+(i%2+1).toString().padStart(2,'0')+'-full.webp',
     thumbnail_url:location.origin+'/Kogakure/images/staff/staff-'+(i%2+1).toString().padStart(2,'0')+'-card.webp',
     theme_color:'#82c8bc',effect:'none',socials:[],
     services:[i%2===0?'接待':'占卜'],is_published:true,sort_order:(i+1)*1024
    }))
    return Promise.resolve(new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}}))
   }
   return native(input,options)
  }
 })()`
 await command('Page.enable')
 await command('Runtime.enable')
 await command('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap})
 const go=async suffix=>{
  await command('Page.navigate',{url:origin+'staff'+suffix})
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 await go('?qa=small')
 await until('document.querySelectorAll(".omamori-card").length===2')
 const small=await evaluate(`({
  title:document.querySelector('.staff-hero h1')?.textContent,
  eyebrow:document.querySelector('.staff-list-heading')?.textContent,
  toolbar:!!document.querySelector('.staff-catalog-toggle'),
  count:document.querySelectorAll('.omamori-card').length,
  queries:window.__qaCalls
 })`)
 console.log('SMALL ROSTER',small)
 if(small.title!=='狐姬名冊'||small.toolbar||small.count!==2||small.queries!==1)throw Error('Small roster should not show search controls')
 const shotSmall=await command('Page.captureScreenshot',{format:'jpeg',quality:75,fromSurface:true})
 await writeFile(join(tmpdir(),'kogakure-catalog-small.jpg'),Buffer.from(shotSmall.data,'base64'))
 await go('?qa=many')
 await until('document.querySelectorAll(".omamori-card").length===7')
 const before=await evaluate(`({
  title:document.title,
  toggle:document.querySelector('.staff-catalog-toggle')?.getAttribute('aria-expanded'),
  expanded:!!document.querySelector('.staff-catalog-panel'),
  queryCount:window.__qaCalls
 })`)
 console.log('LARGE ROSTER',before)
 if(!before.title.includes('狐姬名冊')||before.toggle!=='false'||before.expanded||before.queryCount!==1)throw Error('Large roster toolbar should start folded')
 await evaluate('document.querySelector(".staff-catalog-toggle").click()')
 await until('!!document.querySelector(".staff-catalog-panel")')
 await evaluate(`(()=>{
  const input=document.querySelector('.staff-catalog-input input')
  input.focus();input.select();document.execCommand('insertText',false,'古嘿嘿')
 })()`)
 await until('document.querySelectorAll(".omamori-card").length===1')
 const searched=await evaluate(`({
  result:document.querySelector('.staff-grid .card-name')?.textContent,
  count:document.querySelector('.staff-catalog-count')?.textContent
 })`)
 console.log('SEARCHED',searched)
 if(searched.result!=='古嘿嘿'||!searched.count.includes('1 / 7'))throw Error('Expanded search failed')
 await evaluate('document.querySelector(".staff-catalog-reset").click()')
 await until('document.querySelectorAll(".omamori-card").length===7')
 await evaluate(`(()=>{
  const menu=document.querySelector('.staff-catalog-select select')
  menu.value='占卜';menu.dispatchEvent(new Event('change',{bubbles:true}))
 })()`)
 await until('document.querySelectorAll(".omamori-card").length===3')
 const category=await evaluate('document.querySelector(".staff-catalog-count")?.textContent')
 console.log('FILTERED CATEGORY',category)
 if(!category.includes('3 / 7'))throw Error('Category filter failed')
 await evaluate('document.querySelector(".staff-catalog-toggle").click()')
 await until('document.querySelectorAll(".omamori-card").length===7 && !document.querySelector(".staff-catalog-panel")')
 if(await evaluate('window.__qaCalls')!==1)throw Error('Filtering caused additional Supabase requests')
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await evaluate('document.querySelector(".staff-catalog-toggle").click()')
 await until('!!document.querySelector(".staff-catalog-panel")')
 await wait(300)
 const mobile=await evaluate(`({
  viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
  cards:document.querySelectorAll('.omamori-card').length,
  panel:document.querySelector('.staff-catalog-panel').getBoundingClientRect().toJSON(),
  toolbar:document.querySelector('.staff-catalog-toggle').getBoundingClientRect().toJSON()
 })`)
 console.log('MOBILE EXPANDED',mobile)
 if(mobile.documentWidth>mobile.viewport+1||mobile.cards!==7||mobile.panel.width>mobile.viewport-12)throw Error('Mobile catalog filter overflows')
 const shotMobile=await command('Page.captureScreenshot',{format:'jpeg',quality:72,fromSurface:true})
 await writeFile(join(tmpdir(),'kogakure-catalog-mobile.jpg'),Buffer.from(shotMobile.data,'base64'))
 console.log('PASS: 2 staff have no toolbar; 7 staff have a folded search; search, category filters, reset, mobile responsiveness and single DB request')
} finally {socket?.close();chrome.kill()}
