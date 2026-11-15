// Verify that the original public service titles wrap by meaningful phrases,
// never as one isolated Chinese character, including on small phone widths.
import assert from 'node:assert/strict'
import {readFile, mkdtemp, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'

const source=await readFile('src/pages/ServicesPage.tsx','utf8')
const css=await readFile('src/pages/services-page.css','utf8')
assert.ok(source.includes('ServiceTitle title={service.title}'),'Service titles must use semantic phrase wrapping')
assert.ok(css.includes('.services-title-clause{display:inline-block;white-space:nowrap'),
 'A short Chinese phrase should never break into one-character lines')
assert.ok(css.includes('text-wrap: balance;'),'Fallback headings should balance their text')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {ServiceTitle}=await vite.ssrLoadModule('/src/pages/ServicesPage.tsx')
 const title='循狐火，探尋心中之願'
 const html=renderToStaticMarkup(createElement(ServiceTitle,{title}))
 assert.ok(html.includes('>循狐火，</span><span class="services-title-clause">探尋心中之願</span>'),
  'Divination title should split after the comma into two meaningful clauses')
 assert.equal(renderToStaticMarkup(createElement(ServiceTitle,{title:'沒有標點的長標題'})),
  '沒有標點的長標題','Admin titles without punctuation remain unmodified')
}finally{await vite.close()}

const chromeBin=[process.env.CHROME_BIN,
 '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
 '/usr/bin/chromium','/usr/bin/chromium-browser',
].find(p=>p&&existsSync(p))
assert.ok(chromeBin,'Chromium is required for responsive service title QA')
const webPort=5388,debugPort=9488
const origin='http://127.0.0.1:'+webPort
const profile=await mkdtemp(join(tmpdir(),'kogakure-title-'))
const web=spawn(process.execPath,[
 'node_modules/vite/bin/vite.js','--host','127.0.0.1',
 '--port',String(webPort),'--strictPort',
],{
 env:{...process.env,VITE_OFFLINE_PREVIEW:'true',VITE_BASE_PATH:'/Kogakure/'},
 stdio:'ignore',
})
let chrome,socket
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(condition,limit=16000){
 const start=Date.now()
 while(Date.now()-start<limit){
  try{const value=await condition();if(value)return value}catch{}
  await sleep(80)
 }
 throw Error('Timed out waiting for responsive service title')
}
try{
 await waitFor(async ()=>(await fetch(origin+'/Kogakure/')).ok)
 chrome=spawn(chromeBin,[
  '--headless=new','--no-sandbox','--disable-gpu',
  '--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--remote-allow-origins=*',
  '--remote-debugging-port='+debugPort,
  '--user-data-dir='+profile,'about:blank',
 ],{stdio:'ignore'})
 const tab=await waitFor(async()=>{
  const response=await fetch('http://127.0.0.1:'+debugPort+'/json/list')
  const pages=await response.json()
  return pages.find(p=>p.type==='page'&&p.webSocketDebuggerUrl)
 })
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true})
  socket.addEventListener('error',reject,{once:true})
 })
 let serial=0
 const pending=new Map()
 function send(method,params={}){
  return new Promise((resolve,reject)=>{
   const id=++serial
   pending.set(id,{resolve,reject})
   socket.send(JSON.stringify({id,method,params}))
  })
 }
 socket.addEventListener('message',event=>{
  const packet=JSON.parse(event.data)
  if(packet.id===undefined)return
  const cb=pending.get(packet.id)
  if(!cb)return
  pending.delete(packet.id)
  packet.error?cb.reject(Error(packet.error.message)):cb.resolve(packet.result)
 })
 await send('Page.enable')
 await send('Runtime.enable')
 await send('Page.navigate',{url:origin+'/Kogakure/#/services'})
 async function evaluate(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true})
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text)
  return r.result.value
 }
 await waitFor(()=>evaluate("document.querySelectorAll('#divination-title .services-title-clause').length===2"))
 for(const width of [320,360,390,430,768,1440]){
  await send('Emulation.setDeviceMetricsOverride',{
   width,height:900,deviceScaleFactor:1,mobile:width<=430,
  })
  await sleep(135)
  const result=await evaluate(`(()=>{
   const heading=document.querySelector('#divination-title')
   if(!heading)return null
   const phrases=[...heading.querySelectorAll('.services-title-clause')]
   const box=heading.getBoundingClientRect()
   const parts=phrases.map(node=>({
    text:node.textContent,rect:node.getBoundingClientRect().toJSON(),
    whiteSpace:getComputedStyle(node).whiteSpace,
   }))
   return {width:window.innerWidth,headingWidth:box.width,parts}
  })()`)
  assert.ok(result,'Divination title missing at viewport '+width)
  assert.deepEqual(result.parts.map(p=>p.text),['循狐火，','探尋心中之願'])
  for(const clause of result.parts){
   assert.equal(clause.whiteSpace,'nowrap','Chinese clause must not wrap at '+width+'px')
   assert.ok(clause.rect.width<=result.headingWidth+2,
    'Chinese clause exceeds heading width at '+width+'px')
  }
  if(width===320){
   assert.ok(result.parts[1].rect.y>result.parts[0].rect.y+2,
    'Mobile divination headline should wrap between phrases, not within a phrase')
  }
 }
 console.log('PASS: public divination service title remains readable and never leaves one Chinese character alone at 320,360,390,430,768,1440px')
}finally{
 socket?.close()
 const chromeClosed=chrome&&chrome.exitCode===null
  ?new Promise(resolve=>chrome.once('close',resolve)):Promise.resolve()
 chrome?.kill()
 web.kill()
 await Promise.race([chromeClosed,sleep(1800)])
 try{await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200})}
 catch(error){console.warn('Chrome QA profile cleanup incomplete:',error)}
}
