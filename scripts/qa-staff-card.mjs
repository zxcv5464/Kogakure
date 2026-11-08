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
   return {width:Math.round(b.width),height:Math.round(b.height),bodyTop:b.top,captionStart:Math.round(panel.top-b.top),captionHeight:Math.round(panel.height),photoBottom:Math.round(photo.bottom-b.top),captionBottom:Math.round(panel.bottom),captionBg:getComputedStyle(card.querySelector('.card-text')).backgroundImage,captionBorder:getComputedStyle(card.querySelector('.card-text')).borderTopWidth,font:getComputedStyle(card.querySelector('.card-name')).fontSize,elements}
  })`)
  console.log('VIEWPORT',width,JSON.stringify(rows))
  if(rows.length!==2)throw Error('Missing cards at '+width)
  for(const card of rows){
   if(card.photoBottom < card.height*.99)throw Error('Portrait no longer fills the whole card at '+width)
   if(card.captionBorder!=='0px'||!card.captionBg.includes('rgba(0, 0, 0, 0)'))throw Error('Hard caption seam remains at '+width)
   const e=card.elements
   if(e[0].top-card.bodyTop<card.height*.51)throw Error('Text starts too close to the face at '+width)
   if(e.some(row=>row.bottom>card.captionBottom+1))throw Error('Text overflows card at '+width)
  }
 }
 // Long labels should be elided inside the panel, never pushed over the face.
 await run('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false})
 await delay(180)
 await evaluate('document.querySelector(".card-name").textContent="測試超級長的名字以及不可換行的員工稱號測試測試";document.querySelector(".card-tagline").textContent="這是一段非常非常非常長的個人簡介文字".repeat(18)')
 const longCard=await evaluate(`(()=>{
  const card=document.querySelector('.staff-entry')
  const panel=card.querySelector('.card-text').getBoundingClientRect()
    const name=card.querySelector('.card-name')
  const tagline=card.querySelector('.card-tagline')
  return {panelTop:panel.top,nameTop:name.getBoundingClientRect().top,nameBottom:name.getBoundingClientRect().bottom,taglineBottom:tagline.getBoundingClientRect().bottom,panelBottom:panel.bottom,nameEllipsis:getComputedStyle(name).textOverflow,taglineEllipsis:getComputedStyle(tagline).textOverflow,taglineWhiteSpace:getComputedStyle(tagline).whiteSpace}
 })()`)
 console.log('LONG TEXT',JSON.stringify(longCard))
 if(longCard.nameTop<longCard.panelTop || longCard.taglineBottom>longCard.panelBottom || longCard.nameEllipsis!=='ellipsis'||longCard.taglineEllipsis!=='ellipsis'||longCard.taglineWhiteSpace!=='nowrap')throw Error('Long text escapes caption panel')
 console.log('PASS: continuous portrait, soft text scrim and contained captions at five screen sizes, long labels')
}finally{ws?.close();chrome.kill()}
