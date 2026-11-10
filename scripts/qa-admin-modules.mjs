import { spawn } from 'node:child_process'

const root = process.env.QA_SITE || 'http://127.0.0.1:5291/Kogakure/'
const port = 9401
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
 '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce', '--remote-allow-origins=*',
 '--remote-debugging-port=' + port,
 '--user-data-dir=C:/Windows/Temp/kogakure-admin-module-qa-' + port,
 'about:blank',
], {stdio:'ignore'})
let socket
try {
 let tabs
 for (let i=0;i<90;i++) {
  try {
   const response=await fetch('http://127.0.0.1:' + port + '/json/list')
   if(response.ok) { tabs=await response.json(); break }
  } catch {}
  await wait(100)
 }
 const tab = tabs?.find(item => item.type === 'page')
 if (!tab) throw new Error('Headless browser unavailable')
 socket = new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject) => {
  socket.addEventListener('open',resolve,{once:true})
  socket.addEventListener('error',reject,{once:true})
 })
 let seq=0
 const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq
  const fn=event=>{
   const response=JSON.parse(event.data)
   if(response.id!==id)return
   socket.removeEventListener('message',fn)
   response.error?reject(new Error(JSON.stringify(response.error))):resolve(response.result)
  }
  socket.addEventListener('message',fn)
  socket.send(JSON.stringify({id,method,params}))
 })
 const evaluate=async expression=>{
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
 }
 await call('Page.enable')
 await call('Runtime.enable')
 // Exercise the actual React auth gate in an isolated browser with synthetic,
 // locally intercepted responses. No production credentials or writes used.
 const bootstrap=`(() => {
  const uid='00000000-0000-4000-8000-000000000123'
  const now=Math.floor(Date.now()/1000)
  const user={id:uid,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',
   app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
  const token=[
   btoa(JSON.stringify({alg:'HS256',typ:'JWT'})).replace(/=/g,''),
   btoa(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:now+3600})).replace(/=/g,''),
   'fakesignature'].join('.')
  const session={access_token:token,refresh_token:'qa-fake-refresh',
   expires_in:3600,expires_at:now+3600,token_type:'bearer',user}
  localStorage.setItem('sb-akocsanwytansrdptaho-auth-token',JSON.stringify(session))
  const nativeFetch=window.fetch.bind(window)
  window.__qaQueries=[]
  window.fetch = (input,options={}) => {
   const url=String(typeof input==='string'?input:input.url)
   const data=(body,headers={})=>Promise.resolve(new Response(JSON.stringify(body),{
    status:200,headers:{'content-type':'application/json',...headers}}))
   if(url.includes('supabase.co/auth/v1/user')){window.__qaQueries.push('auth');return data(user)}
   if(url.includes('supabase.co/rest/v1/admin_users')){window.__qaQueries.push('permission');return data([{user_id:uid}])}
   if(url.includes('supabase.co/rest/v1/staff')){window.__qaQueries.push('staff');return data([])}
   return nativeFetch(input,options)
  }
 })()`
 await call('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap})
 const navigate=async path=>{
  await call('Page.navigate',{url:root+path})
  await wait(800)
 }
 const until=async expression=>{
  for(let i=0;i<50;i++){
   if(await evaluate(expression))return
   await wait(130)
  }
  throw Error('UI did not become ready: '+expression)
 }
 await navigate('admin')
 await until('!!document.querySelector(".admin-overview") || !!document.querySelector(".admin-gate .admin-message")')
 const overview=await evaluate(`({
  path:location.pathname,
  total:document.querySelectorAll('.admin-module-card').length,
  available:document.querySelectorAll('a.admin-module-card.is-available').length,
  planned:document.querySelectorAll('.admin-module-card.is-planned').length,
  links:[...document.querySelectorAll('.admin-nav-link')].map(x=>x.getAttribute('href')),
  loginVisible:!!document.querySelector('.admin-gate'),
  publicNav:!!document.querySelector('.desktop-nav'),
  queries:window.__qaQueries,
  error:document.querySelector('.admin-message')?.textContent
 })`)
 console.log('OVERVIEW',overview)
 if(overview.loginVisible||overview.available!==1||overview.planned!==5||overview.publicNav||overview.links.length!==2)throw Error('Overview or auth did not work')
 await evaluate('document.querySelector("a.admin-module-card.is-available").click()')
 await until('!!document.querySelector(".admin-staff-module")')
 const staff=await evaluate(`({
  url:location.pathname,
  header:document.querySelector('.admin-staff-module h1')?.textContent,
  nav:document.querySelector('.admin-nav-link.is-active')?.textContent,
  formReady:!!document.querySelector('.roster-title button'),
  queries:window.__qaQueries
 })`)
 console.log('STAFF MODULE',staff)
 if(!staff.url.endsWith('/admin/staff')||staff.header!=='員工名帖管理'||!staff.formReady)throw Error('Staff module did not load')
 await evaluate('document.querySelector(".roster-title button:last-child").click()')
 const editor = await evaluate('({edit:!!document.querySelector(".admin-editor form"),name:!!document.querySelector(".admin-editor input[required]"),save:!!document.querySelector(".editor-actions .action-button"),photo:!!document.querySelector(".upload-control input[type=file]")})')
 console.log('NEW STAFF EDITOR',editor)
 if(!editor.edit||!editor.name||!editor.save||!editor.photo)throw Error('Extracted staff editor lost its creation controls')
 await evaluate('document.querySelector(".admin-nav-link[href$=admin]").click()')
 await until('!!document.querySelector(".admin-overview")')
 for(const [width,height] of [[1440,900],[768,900],[390,844],[320,640]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<851})
  await wait(200)
  const ui=await evaluate(`({
   screen:innerWidth, width:document.documentElement.scrollWidth, client:document.documentElement.clientWidth,
   columns:getComputedStyle(document.querySelector('.admin-module-grid')).gridTemplateColumns,
   cards:document.querySelectorAll('.admin-module-card').length,
   nav:document.querySelectorAll('.admin-nav-link').length,
   logout:!!document.querySelector('.admin-nav-logout'),
   publicBottom:!!document.querySelector('.mobile-bottom-nav')
  })`)
  console.log('RESPONSIVE',ui)
  if(ui.width>ui.client+1||ui.cards!==6||ui.nav!==2||!ui.logout||ui.publicBottom)throw Error('Bad module dashboard at '+width)
 }
 await navigate('admin/staff/')
 await until('!!document.querySelector(".admin-staff-module")')
 const deep=await evaluate('({path:location.pathname,isStaff:!!document.querySelector(".admin-staff-module")})')
 console.log('DEEP LINK',deep)
 if(!deep.isStaff)throw Error('Direct module link failed')
 console.log('PASS: authorized dashboard, separate staff module, responsive layout, module links, direct nested route, no real Supabase writes')
} finally {socket?.close();chrome.kill()}
