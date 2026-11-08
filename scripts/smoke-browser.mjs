import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const chrome=process.platform==='win32'
 ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
 : '/usr/bin/google-chrome'
const port=9368
const url=process.argv[2] || 'http://127.0.0.1:5194/staff'
const proc=spawn(chrome,[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--remote-allow-origins=*','--remote-debugging-port='+port,
 '--user-data-dir=C:\\Windows\\Temp\\kogakure-cdp-smoke-'+port,
 url,
],{stdio:'ignore'})
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
let socket
try {
 let pages
 for(let n=0;n<80;n++){
  try{const res=await fetch('http://127.0.0.1:'+port+'/json/list');if(res.ok){pages=await res.json();break}}catch{}
  await delay(100)
 }
 const tab=pages?.find(x=>x.type==='page')
 if(!tab)throw Error('Browser tab not ready')
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true})
  socket.addEventListener('error',reject,{once:true})
 })
 let seq=1
 function run(method,params={}){
  const id=seq++
  return new Promise((resolve,reject)=>{
   const onMessage=e=>{
    try{
     const msg=JSON.parse(e.data)
     if(msg.id!==id)return
     socket.removeEventListener('message',onMessage)
     if(msg.error)reject(Error(JSON.stringify(msg.error)))
     else resolve(msg.result)
    }catch(err){reject(err)}
   }
   socket.addEventListener('message',onMessage)
   socket.send(JSON.stringify({id,method,params}))
  })
 }
 await run('Runtime.enable')
 await run('Page.enable')
 if(process.argv.includes('--mobile')) {
  await run('Emulation.setDeviceMetricsOverride',{width:process.argv.includes('--small')?320:390,height:844,deviceScaleFactor:1,mobile:true})
 } else {
  await run('Emulation.setDeviceMetricsOverride',{width:1440,height:980,deviceScaleFactor:1,mobile:false})
 }
 await delay(4500)
 if(process.argv.includes('--more')){
  await run('Runtime.evaluate',{expression:'document.querySelector(".mobile-bottom-nav button")?.click()'})
  await delay(400)
 }
 const result=await run('Runtime.evaluate',{
  expression:'JSON.stringify({path:location.href,ready:document.readyState,images:Array.from(document.images).map(i=>({src:i.currentSrc,loaded:i.complete && i.naturalWidth>0,width:i.naturalWidth,loading:i.loading})),title:document.querySelector("h1")?.textContent,staffCards:document.querySelectorAll(".omamori-card").length,bottomNav:(()=>{const n=document.querySelector(".mobile-bottom-nav");return n?{display:getComputedStyle(n).display,labels:Array.from(n.querySelectorAll("span")).map(x=>x.textContent),bottom:n.getBoundingClientRect().bottom,viewport:innerHeight}:null})(),moreOpen:!!document.querySelector(".mobile-more-panel"),moreLinks:Array.from(document.querySelectorAll(".mobile-more-panel a")).map(x=>x.textContent)})',
  returnByValue:true,
 })
 const payload=JSON.parse(result.result.value)
 console.log(JSON.stringify(payload,null,2))
 if(process.argv.includes('--screenshot')){
  const snap=await run('Page.captureScreenshot',{format:'jpeg',quality:80,fromSurface:true})
  const file=join(tmpdir(),'kogakure-cdp-'+(process.argv.includes('--mobile')?'mobile':'desktop')+'.jpg')
  await writeFile(file,Buffer.from(snap.data,'base64'))
  console.log('Screenshot:',file)
 }
 if(payload.images.some(img=>!img.loaded))process.exitCode=2
} finally {
 socket?.close()
 proc.kill()
}
