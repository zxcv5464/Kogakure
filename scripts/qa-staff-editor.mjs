import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.QA_SITE || 'http://127.0.0.1:5307/Kogakure/'
const port = 9407
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
 '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce', '--remote-allow-origins=*',
 '--remote-debugging-port=' + port,
 '--user-data-dir=C:/Windows/Temp/kogakure-staff-editor-qa-' + port,
 'about:blank',
], {stdio:'ignore'})
let socket

try {
 let tabs
 for (let n=0;n<100;n++) {
  try {
   const response = await fetch('http://127.0.0.1:' + port + '/json/list')
   if (response.ok) { tabs = await response.json(); break }
  } catch {}
  await pause(100)
 }
 const tab = tabs?.find(item => item.type === 'page')
 if (!tab) throw Error('Chrome did not start')
 socket = new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject) => {
  socket.addEventListener('open', resolve, {once:true})
  socket.addEventListener('error', reject, {once:true})
 })
 let seq = 0
 const call=(method, params={})=>new Promise((resolve,reject)=>{
  const id=++seq
  const handle=event=>{
   const result=JSON.parse(event.data)
   if (result.id !== id) return
   socket.removeEventListener('message',handle)
   result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result)
  }
  socket.addEventListener('message',handle)
  socket.send(JSON.stringify({id,method,params}))
 })
 const run=async expression=>{
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
 }
 const until=async expression=>{
  for(let n=0;n<70;n++) {
   if(await run(expression))return
   await pause(100)
  }
  console.log('DEBUG', await run(`({url:location.href,body:document.body.innerText.slice(0,850),requests:window.__qa?.requests,qaReady:!!window.__qa})`))
  throw Error('Timed out: ' + expression)
 }
 const text=async (selector,value)=>{
  const ok=await run(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.focus();el.select();return document.execCommand('insertText',false,${JSON.stringify(value)})})()`)
  if(!ok)throw Error('Could not type into '+selector)
  await pause(90)
 }
 await call('Page.enable')
 await call('Runtime.enable')
 const bootstrap=`(() => {
  const uid='00000000-0000-4000-8000-000000000123'
  const now=Math.floor(Date.now()/1000)
  const user={id:uid,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',
   app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
  const token=[btoa(JSON.stringify({alg:'HS256',typ:'JWT'})).replace(/=/g,''),btoa(JSON.stringify({
   sub:uid,role:'authenticated',aud:'authenticated',exp:now+3600})).replace(/=/g,''),'fake'].join('.')
  localStorage.setItem('sb-akocsanwytansrdptaho-auth-token',JSON.stringify({
   access_token:token,refresh_token:'fake-refresh',expires_in:3600,expires_at:now+3600,token_type:'bearer',user
  }))
  const make=(id,name,published,order)=>({
   id,display_name:name,role:'接待者',tagline:'歡迎來到狐隱',bio:'原始介紹',
   image_url:null,thumbnail_url:null,theme_color:'#82c8bc',effect:'foxfire',
   socials:[],services:['接待'],is_published:published,sort_order:order
  })
  const qa=window.__qa={
   rows:[make('00000000-0000-4000-8000-000000000001','芳乃',true,10),
         make('00000000-0000-4000-8000-000000000002','小狐',false,20)],
   requests:[],confirmations:[],allowConfirm:false,failSave:false,emptySave:false,uploads:[],deletes:[],
  }
  window.confirm=(value)=>{qa.confirmations.push(value);return qa.allowConfirm}
  const nativeFetch=window.fetch.bind(window)
  window.fetch=(input,options={})=>{
   const url=String(typeof input==='string'?input:input.url)
   const method=(options.method||(typeof input==='string'?'GET':input.method)||'GET').toUpperCase()
   const response=(payload,status=200,more={})=>Promise.resolve(new Response(JSON.stringify(payload),{
     status,headers:{'content-type':'application/json',...more}}))
   if(url.includes('supabase.co/auth/v1/user'))return response(user)
   if(url.includes('supabase.co/rest/v1/admin_users'))return response([{user_id:uid}])
   if(url.includes('supabase.co/rest/v1/staff')){
    qa.requests.push({method,url,body:options.body?String(options.body):''})
    if(method==='GET')return response(qa.rows.sort((a,b)=>a.sort_order-b.sort_order))
    if(method==='POST'||method==='PATCH'){
     if(qa.failSave)return response({code:'QA_FAIL',message:'mock save failure'},400)
     const body=JSON.parse(options.body)
     if(method==='PATCH'&&Object.keys(body).length===1&&'sort_order' in body){
      const id=new URL(url).searchParams.get('id')?.replace(/^eq\./,'')
      const found=qa.rows.find(r=>r.id===id)
      qa.requests.push({method:'ORDER_WRITE',id,body:JSON.stringify(body)})
      if(qa.emptySave || !found)return response([])
      found.sort_order=body.sort_order
      return response([{id}])
     }
     qa.requests.push({method:'WRITTEN',body:JSON.stringify(body)})
     if(qa.emptySave)return response([])
     if(method==='PATCH'){
      const id=new URL(url).searchParams.get('id')?.replace(/^eq\./,'')
      const found=qa.rows.find(r=>r.id===id)
      if(!found)return response([])
      Object.assign(found,body)
      return response([{id}])
     }
     const next=qa.rows.filter(r=>r.id!==body.id)
     next.push({...body})
     qa.rows=next
     return response([{id:body.id}])
    }
    if(method==='DELETE'){
     const id=new URL(url).searchParams.get('id')?.replace(/^eq\./,'')
     qa.deletes.push(id)
     qa.rows=qa.rows.filter(r=>r.id!==id)
     return response([{id}])
    }
   }
   if(url.includes('supabase.co/storage/v1/object/')){
    qa.uploads.push({method,url})
    return response({Key:url.split('/').slice(-2).join('/')})
   }
   return nativeFetch(input,options)
  }
 })()`
 await call('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap})
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 await call('Page.navigate',{url:base+'admin/staff'})
 await until('document.querySelectorAll(".staff-roster-list .roster-item").length===2')
 console.log('INITIAL',await run('({rows:document.querySelectorAll(".staff-roster-list .roster-item").length,auth:!!document.querySelector(".admin-workspace"),widgets:!!document.querySelector(".staff-roster-search"),queries:window.__qa.requests.length})'))
 // The sort mode must move a card without rewriting the whole profile.
 await run('document.querySelector(".staff-order-toggle").click()')
 await until('document.querySelector(".staff-roster-list.is-ordering")!==null')
 const sortDesktop=await call('Page.captureScreenshot',{format:'jpeg',quality:72,fromSurface:true})
 await writeFile(join(tmpdir(),'kogakure-staff-sorting-desktop.jpg'),Buffer.from(sortDesktop.data,'base64'))
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await run('document.querySelector(".staff-admin-roster").scrollIntoView({block:"start"})')
 await pause(260)
 const sortMobile=await call('Page.captureScreenshot',{format:'jpeg',quality:74,fromSurface:true})
 await writeFile(join(tmpdir(),'kogakure-staff-sorting-mobile.jpg'),Buffer.from(sortMobile.data,'base64'))
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 await run('window.scrollTo(0,0)')
 await pause(160)
 if(await run('!!document.querySelector(".staff-roster-tools")'))throw Error('Search controls should hide while ordering')
 await run('document.querySelectorAll(".staff-roster-line")[1].querySelector(".staff-roster-move-buttons button").click()')
 await until('document.querySelector(".staff-roster-line .staff-roster-person strong")?.textContent==="小狐"')
 const order=await run(`({
  names:[...document.querySelectorAll(".staff-roster-person strong")].map(x=>x.textContent),
  writes:window.__qa.requests.filter(x=>x.method==="ORDER_WRITE"),
  values:window.__qa.rows.map(x=>({name:x.display_name,sort:x.sort_order}))
 })`)
 console.log('SORT ARROWS',order)
 if(order.writes.length!==1||order.names.join(',')!=='小狐,芳乃')throw Error('Sort buttons did not persist order')
 // Return to the starting list for the remaining editor regressions.
 await run('document.querySelectorAll(".staff-roster-line")[1].querySelector(".staff-roster-move-buttons button").click()')
 await until('document.querySelector(".staff-roster-line .staff-roster-person strong")?.textContent==="芳乃"')
 // DnD with the browser DragEvent API also exercises React's drop handler.
 await run(`(()=>{
  const transfer=new DataTransfer()
  document.querySelectorAll('.staff-roster-line')[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}))
  window.__qaDragTransfer=transfer
 })()`)
 await pause(80)
 await run(`(()=>{
  const target=document.querySelectorAll('.staff-roster-line')[1]
  target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.__qaDragTransfer}))
  target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__qaDragTransfer}))
 })()`)
 await until('document.querySelector(".staff-roster-line .staff-roster-person strong")?.textContent==="小狐"')
 await run('document.querySelectorAll(".staff-roster-line")[1].querySelector(".staff-roster-move-buttons button").click()')
 await until('document.querySelector(".staff-roster-line .staff-roster-person strong")?.textContent==="芳乃"')
 await run('document.querySelector(".staff-order-toggle").click()')
 if(await run('document.querySelector(".staff-roster-list.is-ordering")!==null'))throw Error('Sort mode did not close')

 await text('.staff-roster-search input','芳乃')
 if(await run('document.querySelectorAll(".staff-roster-list .roster-item").length')!==1)throw Error('Search filter failed')
 await text('.staff-roster-search input','')
 await run('document.querySelector(".staff-roster-list .roster-item").click()')
 await until('!!document.querySelector(".staff-editor-fields")')
 const servicesSelector='input[placeholder*="接待、占卜"]'
 await text(servicesSelector,'接待、占卜、湯屋')
 const afterTyping=await run(`({
  value:document.querySelector(${JSON.stringify(servicesSelector)}).value,
  dirty:document.querySelector('.staff-edit-status')?.textContent
 })`)
 console.log('TAG INPUT',afterTyping)
 if(afterTyping.value!=='接待、占卜、湯屋'||!afterTyping.dirty.includes('未儲存'))throw Error('Services delimiter was removed')

 await run('document.querySelector(".admin-nav-link[href$=admin]").click()')
 if(!(await run('location.pathname.endsWith("/admin/staff")')))throw Error('Unsaved changes escaped without permission')
 await run('document.querySelectorAll(".staff-roster-list .roster-item")[1].click()')
 const blocked=await run('({name:document.querySelector(".staff-editor-title h2").textContent,confirms:window.__qa.confirmations.length})')
 console.log('UNSAVED BLOCKED',blocked)
 if(blocked.name!=='芳乃'||blocked.confirms<2)throw Error('Unsaved change guard failed')
 await run('window.__qa.allowConfirm=true;document.querySelectorAll(".staff-roster-list .roster-item")[1].click()')
 if(!(await run('document.querySelector(".staff-editor-title h2").textContent==="小狐"')))throw Error('Switch after confirm failed')
 await run('document.querySelectorAll(".staff-roster-list .roster-item")[0].click()')
 await text(servicesSelector,'接待、占卜、湯屋')
 await run('document.querySelector(".staff-editor-footer button[type=submit]").click()')
 await until('document.querySelector(".staff-admin-notice.is-success")!==null')
 const saved=await run(`({
  saved:window.__qa.requests.filter(x=>x.method==='WRITTEN').map(x=>JSON.parse(x.body)),
  dirty:document.querySelector('.staff-edit-status')?.textContent,
  message:document.querySelector('.staff-admin-notice')?.textContent
 })`)
 console.log('SAVED',saved)
 if(saved.saved.length!==1||saved.saved[0].services.length!==3||!saved.dirty.includes('沒有待儲存'))throw Error('Saving/parsing services failed')
 await text('.staff-admin-editor input[placeholder="員工角色名稱"]','試著失敗')
 await run('window.__qa.failSave=true;document.querySelector(".staff-editor-footer button[type=submit]").click()')
 await until('!!document.querySelector(".staff-admin-notice.is-error")')
 const failed=await run('({error:document.querySelector(".staff-admin-notice")?.textContent,dirty:document.querySelector(".staff-edit-status")?.textContent})')
 console.log('FAILED SAVE',failed)
 if(!failed.dirty.includes('未儲存') || !failed.error.includes('mock save failure')) throw Error('Failed save lost edits or hid the actual Supabase error')
 await run('window.__qa.failSave=false;document.querySelector(".staff-editor-title .icon-button").click()')
 if(!(await run('document.querySelector(".editor-empty")!==null')))throw Error('Close editor failed')
 // Photo selection is intentionally local until Save. Cancel leaves Storage untouched.
 await run('document.querySelector(".roster-title button:last-child").click()')
 await until('document.querySelector(".staff-editor-fields")!==null')
 await run(`(()=>{
  const base64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
  const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0))
  const file=new File([bytes],'staged.png',{type:'image/png'})
  const transfer=new DataTransfer();transfer.items.add(file)
  const input=document.querySelector('.staff-editor-photo input[type=file]')
  input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))
 })()`)
 await until('!!document.querySelector(".staff-editor-photo-actions .staff-admin-secondary")')
 const stage=await run('({uploads:window.__qa.uploads.length,preview:!!document.querySelector(".staff-editor-photo-preview img"),dirty:document.querySelector(".staff-edit-status")?.textContent})')
 console.log('STAGED PHOTO',stage)
 if(stage.uploads||!stage.dirty.includes('未儲存'))throw Error('Photo uploaded prematurely')
 await run('window.__qa.allowConfirm=true;document.querySelector(".staff-editor-title .icon-button").click()')
 if(await run('window.__qa.uploads.length')!==0)throw Error('Cancel uploaded staged photo')
 await run('document.querySelector(".roster-title button:last-child").click()')
 await text('.staff-admin-editor input[placeholder="員工角色名稱"]','測試新角色')
 await run('document.querySelector(".staff-editor-footer button[type=submit]").click()')
 await until('!!document.querySelector(".staff-admin-notice.is-success")')
 const created=await run('({rows:window.__qa.rows.length,draft:window.__qa.rows.some(x=>x.display_name==="測試新角色"&&!x.is_published),notice:document.querySelector(".staff-admin-notice").textContent})')
 console.log('CREATE',created)
 if(created.rows!==3||!created.draft)throw Error('New staff creation failed')
 // A photo must not reach Storage until Save; simulate browser-generated PNG.
 await run(`(async()=>{
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  canvas.getContext('2d').fillRect(0,0,64,64);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
  const file=new File([blob],'upload-on-save.png',{type:'image/png'})
  const transfer=new DataTransfer();transfer.items.add(file)
  const input=document.querySelector('.staff-editor-photo input[type=file]')
  input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))
 })()`)
 await until('document.querySelector(".staff-editor-photo-actions .staff-admin-secondary")!==null')
 await until('!!document.querySelector(".staff-crop-selection")')
 if(await run('window.__qa.uploads.length')!==0) throw Error('Selected photo uploaded before Save')
 // An unconfirmed crop must never upload (nor silently use object-fit:cover).
 await run('document.querySelector(".staff-editor-footer button[type=submit]").click()')
 await until('!!document.querySelector(".staff-admin-notice.is-error")')
 if(await run('window.__qa.uploads.length')!==0) throw Error('Unconfirmed photo was uploaded')
 await run('document.querySelector(".staff-crop-confirm").click()')
 await until('!!document.querySelector(".staff-crop-applied")')
 await run('document.querySelector(".staff-editor-footer button[type=submit]").click()')
 await until('!!document.querySelector(".staff-admin-notice.is-success")')
 const photoSave=await run(`({
   uploads:window.__qa.uploads.length,
   photo:window.__qa.rows.find(r=>r.display_name==='測試新角色')?.image_url,
   stageCleared:!document.querySelector('.staff-editor-photo-actions .staff-admin-secondary')
 })`)
 console.log('PHOTO UPLOAD ON SAVE',photoSave)
 if(photoSave.uploads!==2 || !photoSave.photo?.includes('staff-media') || !photoSave.stageCleared) throw Error('Photo-save transaction failed')

 // RLS or server anomalies returning 0 rows should not report success.
 await text('.staff-admin-editor input[placeholder="員工角色名稱"]','權限測試')
 await run('window.__qa.emptySave=true;document.querySelector(".staff-editor-footer button[type=submit]").click()')
 await until('!!document.querySelector(".staff-admin-notice.is-error")')
 const missingRow=await run('document.querySelector(".staff-admin-notice").textContent')
 console.log('ZERO ROW SAVE',missingRow)
 if(!missingRow.includes('沒有成功寫入任何名帖')) throw Error('Zero affected rows were reported as success')
 await run('window.__qa.emptySave=false;window.__qa.allowConfirm=true')
 await run('document.querySelector(".staff-editor-title .icon-button").click()')

 // Delete is double-confirmed; it must remove the row and leave other records.
 await run(`[...document.querySelectorAll('.staff-roster-list .roster-item')].find(el=>el.textContent.includes('測試新角色')).click()`)
 await until('!!document.querySelector(".staff-editor-footer .danger-button")')
 await run('document.querySelector(".staff-editor-footer .danger-button").click()')
 await until('window.__qa.deletes.length===1')
 const afterDelete=await run('({rows:window.__qa.rows.length,empty:!!document.querySelector(".editor-empty"),confirm:window.__qa.confirmations.at(-1)})')
 console.log('DELETE',afterDelete)
 if(afterDelete.rows!==2 || !afterDelete.empty || !afterDelete.confirm.includes('無法復原'))throw Error('Delete workflow failed')

 // Verify public/draft filter.
 await run('(()=>{const select=document.querySelector(".staff-roster-tools select");select.value="draft";select.dispatchEvent(new Event("change",{bubbles:true}))})()')
 await pause(140)
 if(await run('document.querySelectorAll(".staff-roster-list .roster-item").length')!==1)throw Error('Draft status filter failed')
 await run('(()=>{const select=document.querySelector(".staff-roster-tools select");select.value="all";select.dispatchEvent(new Event("change",{bubbles:true}))})()')
 await run('document.querySelector(".staff-roster-list .roster-item").click()')
 await until('!!document.querySelector(".staff-editor-fields")')
 await run('document.querySelector(".staff-editor-social .editor-block-header button").click()')
 await until('document.querySelectorAll(".staff-editor-social .social-edit-row").length===1')

 // Verify responsive roster and editor do not overflow or hide actions.
 for (const [width,height] of [[1440,900],[768,900],[390,844],[320,640]]) {
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<851})
  await pause(180)
  const state=await run(`({
   width:innerWidth,doc:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,
   saveVisible:!!document.querySelector('.staff-editor-footer button[type=submit]'),
   searchVisible:!!document.querySelector('.staff-roster-search input'),
   panelWidth:Math.round(document.querySelector('.staff-admin-editor').getBoundingClientRect().width),
   socialFields:document.querySelectorAll('.staff-editor-social .social-edit-row input').length,
   pickerDisplay:getComputedStyle(document.querySelector('.staff-editor-photo input[type=file]')).display
  })`)
  console.log('RESPONSIVE',state)
  if(state.doc>state.client+1||!state.saveVisible||!state.searchVisible||state.socialFields!==2||state.pickerDisplay==='none')throw Error('Overflow or missing controls at '+width)
  if(width===390||width===1440){
   const shot=await call('Page.captureScreenshot',{format:'jpeg',quality:77,fromSurface:true})
   await writeFile(join(tmpdir(),'kogakure-staff-admin-'+width+'.jpg'),Buffer.from(shot.data,'base64'))
  }
 }
 console.log('PASS: search, service delimiter, unsaved warnings, selection, save, failure, local photo staging, create, responsive UI (mocked auth+DB)')
} finally {
 socket?.close()
 browser.kill()
}
