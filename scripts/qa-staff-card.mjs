import { spawn } from 'node:child_process'

const origin=process.env.QA_SITE || 'http://127.0.0.1:5249'
const port=9397
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce','--remote-allow-origins=*',
 '--remote-debugging-port='+port,
 '--user-data-dir=C:/Windows/Temp/kogakure-card-qa-'+port,
 origin+'/staff'
],{stdio:'ignore'})
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let ws
try{
 let tabs
 for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/json/list');if(r.ok){tabs=await r.json();break}}catch{}await delay(100)}
 const tab=tabs?.find(t=>t.type==='page')
 if(!tab)throw Error('Chrome did not start')
 ws=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 let sequence=0
 const run=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++sequence
  const handler=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',handler);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)}
  ws.addEventListener('message',handler);ws.send(JSON.stringify({id,method,params}))
 })
 const evaluate=async exp=>{
  const r=await run('Runtime.evaluate',{expression:exp,returnByValue:true})
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
 }
 await run('Runtime.enable')
 for(let i=0;i<80;i++){
  if(await evaluate('document.querySelectorAll(".omamori-card").length>=2'))break
  await delay(150)
 }
 for(const [width,height] of [[1440,980],[1024,768],[768,900],[390,844],[320,640]]){
  await run('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<850})
  await delay(240)
  const rows=await evaluate(`[...document.querySelectorAll('.omamori-card')].map(card=>{
   const b=card.querySelector('.omamori-body').getBoundingClientRect()
   const photo=card.querySelector('.omamori-art').getBoundingClientRect()
   const panel=card.querySelector('.card-text').getBoundingClientRect()
   const elements=[...card.querySelectorAll('.card-role,.card-name,.card-tagline,.card-cta')].map(e=>({kind:e.className,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}))
   return {width:Math.round(b.width),height:Math.round(b.height),panelY:Math.round(panel.top-b.top),panelHeight:Math.round(panel.height),photoBottom:Math.round(photo.bottom-b.top),panelBottom:Math.round(panel.bottom),font:getComputedStyle(card.querySelector('.card-name')).fontSize,elements}
  })`)
  console.log('VIEWPORT',width,JSON.stringify(rows))
  if(rows.length!==2)throw Error('Missing cards at '+width)
  for(const card of rows){
   if(card.panelY<=card.height*.53||card.panelY>=card.height*.7)throw Error('Wrong panel region at '+width)
   const e=card.elements
   if(e.some(row=>row.top<e[0].top-1||row.bottom>card.panelBottom+1))throw Error('Text overflows card at '+width)
   if(e[0].top<e[0].bottom-card.panelHeight-3)throw Error('Text starts outside panel at '+width)
  }
 }
 // Long labels should be elided inside the panel, never pushed over the face.
 await run('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false})
 await delay(180)
 await evaluate('document.querySelector(".card-name").textContent="測試超級長的名字以及不可換行的員工稱號測試測試";document.querySelector(".card-tagline").textContent="這是一段非常非常非常長的個人簡介文字".repeat(18)')
 const longCard=await evaluate(`(()=>{
  const card=document.querySelector('.staff-entry')
  const panel=card.querySelector('.card-text').getBoundingClientRect()
  const role=card.querySelector('.card-role').getBoundingClientRect()
  const name=card.querySelector('.card-name')
  const tagline=card.querySelector('.card-tagline')
  return {panelTop:panel.top,nameTop:name.getBoundingClientRect().top,nameBottom:name.getBoundingClientRect().bottom,taglineBottom:tagline.getBoundingClientRect().bottom,panelBottom:panel.bottom,nameEllipsis:getComputedStyle(name).textOverflow,taglineClamp:getComputedStyle(tagline).webkitLineClamp}
 })()`)
 console.log('LONG TEXT',JSON.stringify(longCard))
 if(longCard.nameTop<longCard.panelTop || longCard.taglineBottom>longCard.panelBottom || longCard.nameEllipsis!=='ellipsis'||longCard.taglineClamp!=='2')throw Error('Long text escapes caption panel')
 console.log('PASS: dedicated portrait region and contained text at five screen sizes, long labels')
}finally{ws?.close();chrome.kill()}
