import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const root = process.env.QA_SITE || 'http://127.0.0.1:5266'
const debugPort = 9389
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
 '--headless=new', '--disable-gpu','--no-first-run','--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce','--remote-allow-origins=*',
 '--remote-debugging-port=' + debugPort,
 '--user-data-dir=C:/Windows/Temp/kogakure-dialog-qa-' + debugPort,
 root + '/staff',
], {stdio:'ignore'})

let socket
try {
 let tabs
 for (let n=0;n<100;n++) {
  try {
   const r=await fetch('http://127.0.0.1:' + debugPort + '/json/list')
   if (r.ok) { tabs = await r.json(); break }
  } catch {}
  await sleep(100)
 }
 const tab = tabs?.find(item => item.type === 'page')
 if (!tab) throw new Error('Chrome did not start')
 socket = new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true})
  socket.addEventListener('error',reject,{once:true})
 })
 let seq=0
 const command=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq
  const listener=e=>{
   const v=JSON.parse(e.data)
   if(v.id!==id)return
   socket.removeEventListener('message',listener)
   v.error?reject(new Error(JSON.stringify(v.error))):resolve(v.result)
  }
  socket.addEventListener('message',listener)
  socket.send(JSON.stringify({id,method,params}))
 })
 const evaluate=async expression=>{
  const r=await command('Runtime.evaluate',{expression,returnByValue:true})
  if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
 }
 const details=()=>evaluate(`(()=>{
  const shell=document.querySelector('.dialog-shell')
  const area=document.querySelector('.staff-dialog')
  const footer=document.querySelector('.dialog-scroll-footer')
  const hint=document.querySelector('.dialog-scroll-hint')
  const close=document.querySelector('.dialog-close')
  const rect=e=>e?{top:Math.round(e.getBoundingClientRect().top),bottom:Math.round(e.getBoundingClientRect().bottom),left:Math.round(e.getBoundingClientRect().left)}:null
  return {
   viewportHeight:innerHeight,shell:rect(shell),scrollPane:rect(area),footer:rect(footer),hint:rect(hint),close:rect(close),
   scrollTop:area?.scrollTop,scrollHeight:area?.scrollHeight,clientHeight:area?.clientHeight,
   hasMore:!!hint,footerText:footer?.textContent.trim(),bodyLocked:document.body.style.overflow==='hidden'
  }
 })()`)
 await command('Runtime.enable')
 await command('Page.enable')
 for (const [width,height] of [[390,844],[375,667],[320,568],[1440,900]]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<571})
  await command('Page.navigate',{url:root+'/staff'})
  for(let n=0;n<80;n++){
   if(await evaluate('document.querySelectorAll(".omamori-card").length>=2'))break
   await sleep(150)
  }
  const ready=await evaluate('document.querySelectorAll(".omamori-card").length')
  if(ready<2)throw new Error('Staff data unavailable')
  await evaluate('document.querySelectorAll(".omamori-card")[1].click()')
  await sleep(250)
  // Test real staff text, extended only in the browser for stress testing.
  await evaluate('document.querySelector(".detail-bio").textContent += ("　狐隱的故事仍在繼續，每位訪客都是新的緣分。\\n\\n").repeat(120)')
  await sleep(350)
  const before=await details()
  console.log('BEFORE',width,JSON.stringify(before))
  if(!before.hasMore||!before.bodyLocked)throw new Error('Expected an active reading hint')
  if(width<571) {
   if(before.hint.top<before.scrollPane.bottom-2)throw new Error('Reading button overlaps scrollable text')
   if(before.footer.bottom>height+1 || before.footer.top<before.scrollPane.bottom-2)throw new Error('Footer is not anchored below scroll pane')
  }
  // A swipe-equivalent scroll moves the text but must not move the controls.
  await evaluate('document.querySelector(".staff-dialog").scrollTop=450;document.querySelector(".staff-dialog").dispatchEvent(new Event("scroll"))')
  await sleep(300)
  const mid=await details()
  console.log('MID',width,JSON.stringify(mid))
  if(width<571) {
   if(!mid.hint||Math.abs(mid.hint.top-before.hint.top)>2)throw new Error('The hint moved with the biography')
   if(!mid.close||Math.abs(mid.close.top-before.close.top)>2)throw new Error('The close button moved with the biography')
  }
  // Simulate tapping the hint.
  await evaluate('document.querySelector(".dialog-scroll-hint")?.click()')
  await sleep(450)
  const tapped=await details()
  console.log('TAPPED',width,JSON.stringify(tapped))
  if(width<571&&tapped.scrollTop<=mid.scrollTop)throw new Error('Continue reading button did not advance the text')
  const target=width<571?'.staff-dialog':'.dialog-content'
  await evaluate(`document.querySelector('${target}').scrollTop=1000000;document.querySelector('${target}').dispatchEvent(new Event('scroll'))`)
  await sleep(320)
  const bottom=await details()
  console.log('BOTTOM',width,JSON.stringify(bottom))
  if(bottom.hasMore)throw new Error('Hint should disappear when everything is read')
  if(width<571 && bottom.footer.bottom>height+1)throw new Error('Footer runs under phone viewport')
  await evaluate('document.querySelector(".dialog-close").click()')
  await sleep(160)
  if(await evaluate('!!document.querySelector(".staff-dialog")')) throw new Error('Close did not work')
  if(width===390){
   // Store a non-user-facing screenshot for visual QA at a natural scroll point.
   await evaluate('document.querySelectorAll(".omamori-card")[1].click()')
   await sleep(180)
   await evaluate('document.querySelector(".staff-dialog").scrollTop=430')
   await sleep(180)
   const shot=await command('Page.captureScreenshot',{format:'jpeg',quality:70,fromSurface:true})
   await writeFile(join(tmpdir(),'kogakure-dialog-scroll-fixed.jpg'),Buffer.from(shot.data,'base64'))
  }
 }
 console.log('PASS: mobile anchored reading controls, no text overlap, scroll actions, end state and close across four viewports')
} finally {
 socket?.close()
 chrome.kill()
}
