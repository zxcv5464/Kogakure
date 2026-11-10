import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.QA_SITE || 'http://127.0.0.1:5279/Kogakure/'
const port = 9399
const pause = ms => new Promise(resolve => setTimeout(resolve,ms))
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce','--remote-allow-origins=*',
 '--remote-debugging-port='+port,
 '--user-data-dir=C:/Windows/Temp/kogakure-admin-shell-qa-'+port,
 base+'admin'
],{stdio:'ignore'})
let ws
try{
 let tabs
 for(let i=0;i<90;i++){
  try {const r=await fetch('http://127.0.0.1:'+port+'/json/list');if(r.ok){tabs=await r.json();break}} catch{}
  await pause(100)
 }
 const tab=tabs?.find(t=>t.type==='page')
 if(!tab)throw Error('Browser unavailable')
 ws=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 let id=0
 const command=(method,params={})=>new Promise((resolve,reject)=>{
  const seq=++id
  const fn=e=>{const r=JSON.parse(e.data);if(r.id!==seq)return;ws.removeEventListener('message',fn);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result)}
  ws.addEventListener('message',fn)
  ws.send(JSON.stringify({id:seq,method,params}))
 })
 const evaluate=async expression=>{
  const r=await command('Runtime.evaluate',{expression,returnByValue:true})
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
 }
 await command('Runtime.enable')
 await command('Page.enable')
 const go=async url=>{
  await command('Page.navigate',{url})
  for(let n=0;n<50;n++){
   if(await evaluate('document.querySelector(".admin-shell-main,.site") !== null'))break
   await pause(120)
  }
  await pause(450)
 }
 const snap=()=>evaluate(`({
  path:location.pathname,
  admin:!!document.querySelector('.admin-shell'),
  publicSite:!!document.querySelector('.site'),
  header:!!document.querySelector('.admin-shell-header'),
  mainNav:!!document.querySelector('.desktop-nav'),
  mobileNav:!!document.querySelector('.mobile-bottom-nav'),
  footer:!!document.querySelector('.site-footer'),
  intro:!!document.querySelector('.entry-intro'),
  scene:!!document.querySelector('.scene-backdrop'),
  logoLink:document.querySelector('.admin-shell-brand')?.getAttribute('href'),
  logoName:document.querySelector('.admin-shell-brand')?.getAttribute('aria-label'),
  loginTitle:document.querySelector('.admin-gate h1')?.textContent,
  horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
  viewport:innerWidth
 })`)
 for(const [width,height] of [[1440,900],[768,900],[390,844],[320,640]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<851})
  await go(base+'admin')
  const state=await snap()
  console.log('ADMIN',width,JSON.stringify(state))
  if(!state.admin || state.publicSite || state.mainNav || state.mobileNav || state.footer || state.intro || state.scene || !state.header || state.logoLink!=='/Kogakure/' || state.horizontalOverflow)throw Error('Admin is not isolated at '+width)
  if(width===1440||width===390){
   const shot=await command('Page.captureScreenshot',{format:'jpeg',quality:78,fromSurface:true})
   await writeFile(join(tmpdir(),'kogakure-admin-'+width+'.jpg'),Buffer.from(shot.data,'base64'))
  }
 }
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await evaluate('document.querySelector(".admin-shell-brand").click()')
 await pause(850)
 const home=await snap()
 console.log('RETURN FRONTEND',JSON.stringify(home))
 if(home.admin||!home.publicSite||!home.mobileNav||!home.footer || home.path!=='/Kogakure/')throw Error('Brand link did not return to frontend')
 const hasAdminLink=await evaluate('!!document.querySelector("a[href*=admin]")')
 if(hasAdminLink)throw Error('Unexpected public admin link')
 await go(base+'admin')
 const direct=await snap()
 if(!direct.admin||direct.mainNav)throw Error('Direct admin link failed after frontend navigation')
 await go(base+'admin/staff')
 const nested = await snap()
 console.log('PROTECTED MODULE WITHOUT LOGIN',JSON.stringify(nested))
 if (!nested.admin || nested.publicSite || !nested.loginTitle || nested.mainNav || nested.mobileNav || nested.path !== '/Kogakure/admin/staff') throw Error('Staff management URL bypassed the admin login gate')
 // Visual fixture for the authorized editor layout; never bypass Auth or
 // write actual Supabase records. Tests only responsive CSS of existing classes.
 const fixture = `<section class="admin-page container">
  <div class="admin-top"><div><p class="eyebrow">KOGAKURE · CONTENT MANAGEMENT</p><h1>人員名帖管理</h1><p>共 3 位員工 · 管理公開資料</p></div><button class="text-button">登出</button></div>
  <div class="admin-layout">
   <aside class="admin-roster"><div class="roster-title"><strong>名帖列表</strong><button>＋ 新增</button></div>
    <button class="roster-item"><span class="avatar-placeholder">狐</span><span><strong>朝武芳乃</strong><small>接待者 · 已公開</small></span></button>
    <button class="roster-item"><span class="avatar-placeholder">狐</span><span><strong>古嘿嘿</strong><small>接待者 · 已公開</small></span></button>
    <button class="roster-item"><span class="avatar-placeholder">狐</span><span><strong>第三位員工</strong><small>草稿</small></span></button>
   </aside>
   <div class="admin-editor"><div class="editor-title"><div><p class="eyebrow">EDIT PROFILE</p><h2>朝武芳乃</h2></div></div>
    <form><div class="form-grid">
     <label>姓名<input value="朝武芳乃"/></label><label>職稱<input value="接待者"/></label>
     <label class="span-2">名片短句<input value="循狐而入，借湯忘憂。"/></label>
     <label class="span-2">完整自我介紹<textarea rows="5">你好，歡迎來到狐隱。</textarea></label>
    </div><div class="editor-footer"><label class="publish-toggle"><input type="checkbox" checked/>對訪客公開名帖</label>
    <div class="editor-actions"><button class="action-button">儲存名帖</button></div></div></form>
   </div>
  </div></section>`
 for (const [width,height] of [[1440,900],[390,844],[320,640]]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<851})
  await go(base+'admin')
  await evaluate('document.querySelector(".admin-shell-main").innerHTML = '+JSON.stringify(fixture))
  await pause(100)
  const layout=await evaluate(`({
    viewport:innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    editorWidth:Math.round(document.querySelector('.admin-editor').getBoundingClientRect().width),
    rosterWidth:Math.round(document.querySelector('.admin-roster').getBoundingClientRect().width),
    columnCount:getComputedStyle(document.querySelector('.admin-layout')).gridTemplateColumns.split(' ').length,
    logoVisible:!!document.querySelector('.admin-shell-brand')
  })`)
  console.log('EDITOR FIXTURE',JSON.stringify(layout))
  if(layout.documentWidth>width+1 || !layout.logoVisible || layout.editorWidth<width*.55)throw Error('Editor layout overflow at '+width)
  if (width===390) {
   const shot=await command('Page.captureScreenshot',{format:'jpeg',quality:75,fromSurface:true})
   await writeFile(join(tmpdir(),'kogakure-admin-editor-mobile.jpg'),Buffer.from(shot.data,'base64'))
  }
 }
 console.log('PASS: isolated admin on 4 viewports, logo home navigation, public UI restored, hidden admin entry, responsive editor CSS')
} finally {ws?.close();chrome.kill()}
