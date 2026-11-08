import { spawn } from 'node:child_process'
const port = 9394
const origin = process.env.QA_SITE || 'http://127.0.0.1:5233'
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
 '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce', '--remote-allow-origins=*',
 '--remote-debugging-port='+port,
 '--user-data-dir=C:/Windows/Temp/kogakure-staff-layout-qa-'+port,
 origin + '/staff',
],{stdio:'ignore'})
const wait = ms => new Promise(r=>setTimeout(r,ms))
let ws
try {
 let pages
 for (let i=0;i<90;i++) {
  try {const response=await fetch('http://127.0.0.1:'+port+'/json/list');if(response.ok){pages=await response.json();break}}catch{}
  await wait(100)
 }
 const tab=pages?.find(x=>x.type==='page')
 if(!tab)throw Error('Chrome did not start')
 ws=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 let seq=0
 const run=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq
  const receive=e=>{const x=JSON.parse(e.data);if(x.id!==id)return;ws.removeEventListener('message',receive);x.error?reject(Error(JSON.stringify(x.error))):resolve(x.result)}
  ws.addEventListener('message',receive)
  ws.send(JSON.stringify({id,method,params}))
 })
 const evalJS=async expression=>{
  const result=await run('Runtime.evaluate',{expression,returnByValue:true})
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
 }
 await run('Runtime.enable')
 // Allow the public Supabase staff rows to populate before measuring layout.
 for(let i=0;i<50;i++){
  if(await evalJS('document.querySelectorAll(".omamori-card").length>=2'))break
  await wait(150)
 }
 for(const [width,height] of [[1440,980],[1024,768],[768,900],[390,844],[320,640]]) {
  await run('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<851})
  await wait(450)
  const result=await evalJS(`({
   width:innerWidth,rootWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
   height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollCss:getComputedStyle(document.documentElement).scrollbarWidth,
   cards:[...document.querySelectorAll('.omamori-card')].map(x=>({width:Math.round(x.getBoundingClientRect().width),top:Math.round(x.getBoundingClientRect().top),left:Math.round(x.getBoundingClientRect().left)})),
   title:document.querySelector('main h1')?.textContent
  })`)
  console.log(JSON.stringify(result))
  if(result.rootWidth>result.clientWidth+1) throw Error('Horizontal overflow at '+width)
  if(result.scrollCss!=='none')throw Error('Root scrollbar is visible at '+width)
  if(result.cards.length!==2)throw Error('Staff cards missing at '+width)
  if(result.cards.some(x=>x.width<165))throw Error('Cards too narrow at '+width)
  await evalJS('window.scrollTo(0,150)')
  await wait(180)
  const scroll=await evalJS('window.scrollY')
  if(result.scrollHeight>height+150&&scroll<60)throw Error('Page scroll disabled at '+width)
  await evalJS('window.scrollTo(0,0)')
 }
 await run('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await evalJS('document.querySelector(".omamori-card").click()')
 await wait(350)
 const dialog=await evalJS('({open:!!document.querySelector(".staff-dialog"),root:document.documentElement.style.overflow,body:document.body.style.overflow})')
 console.log('Dialog',dialog)
 if(!dialog.open||dialog.body!=='hidden')throw Error('Dialog scroll lock failed')
 await evalJS('document.querySelector(".dialog-close").click()')
 await wait(150)
 const after=await evalJS('({dialog:!!document.querySelector(".staff-dialog"),body:document.body.style.overflow})')
 if(after.dialog||after.body==='hidden')throw Error('Dialog cleanup failed')
 console.log('PASS: staff layout at five viewports, invisible scrollbar, preserved scroll, dialog behavior')
} finally {ws?.close();chrome.kill()}
