// Regression QA for GitHub Pages: static file lookup only, NO Vite SPA fallback.
// Run after: VITE_BASE_PATH=/Kogakure/ npm run build
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import { spawn } from 'node:child_process'

const base = '/Kogakure/'
const port = 5287
const debugPort = 9387
const root = resolve('dist')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const mime = {
 '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
 '.css': 'text/css; charset=utf-8', '.webp': 'image/webp',
 '.json': 'application/json; charset=utf-8',
}
const server = createServer(async (req, res) => {
 const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
 if (!pathname.startsWith(base)) { res.writeHead(404);res.end('not found');return }
 const relative = decodeURIComponent(pathname.slice(base.length))
 let file = resolve(root, relative)
 if (!file.startsWith(root)) { res.writeHead(403);res.end();return }
 try {
  const info = await stat(file)
  if (info.isDirectory()) {
   if (!pathname.endsWith('/')) {
    res.writeHead(301, { Location: pathname + '/' });res.end();return
   }
   file = join(file, 'index.html')
  }
  const data = await readFile(file)
  res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' })
  res.end(data)
 } catch {
  res.writeHead(404, { 'content-type': mime['.html'] })
  res.end(await readFile(join(root, '404.html')))
 }
})
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
 '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
 '--force-prefers-reduced-motion=reduce', '--remote-allow-origins=*',
 '--remote-debugging-port=' + debugPort,
 '--user-data-dir=C:/Windows/Temp/kogakure-routing-qa-' + debugPort,
 'http://127.0.0.1:' + port + '/Kogakure/',
], { stdio:'ignore' })
let socket
try {
 let pages
 for (let i=0;i<90;i++) {
  try {
   const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list')
   if (response.ok) { pages = await response.json();break }
  } catch {}
  await wait(100)
 }
 const tab = pages?.find(item => item.type === 'page')
 if (!tab) throw new Error('Chrome did not start')
 socket = new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once:true })
  socket.addEventListener('error', reject, { once:true })
 })
 let sequence = 0
 const command = (method, params={}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const callback = event => {
   const response = JSON.parse(event.data)
   if (response.id !== id) return
   socket.removeEventListener('message', callback)
   response.error ? reject(Error(JSON.stringify(response.error))) : resolve(response.result)
  }
  socket.addEventListener('message', callback)
  socket.send(JSON.stringify({ id, method, params }))
 })
 const evaluate = async expression => {
  const result = await command('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
 }
 const navigate = async path => {
  await command('Page.navigate', { url: 'http://127.0.0.1:' + port + path })
  await wait(1400)
  const state = await evaluate('({url:location.pathname+location.search+location.hash,title:document.querySelector("main h1")?.textContent,site:!!document.querySelector(".site,.admin-shell"),admin:!!document.querySelector(".admin-shell")})')
  console.log(path, JSON.stringify(state))
  if (!state.site) throw new Error('No React app at ' + path)
  return state
 }
 await command('Page.enable')
 await command('Runtime.enable')
 const admin = await navigate('/Kogakure/admin')
 if (!admin.url.startsWith('/Kogakure/admin') || admin.title !== '狐隱管理後台' || !admin.admin) throw new Error('Clean isolated admin route failed')
 const adminStaff = await navigate('/Kogakure/admin/staff')
 if (!adminStaff.url.startsWith('/Kogakure/admin/staff') || !adminStaff.admin || !adminStaff.site) throw new Error('Nested admin staff URL did not load its protected application shell')
 const staff = await navigate('/Kogakure/staff')
 if (!staff.url.startsWith('/Kogakure/staff') || staff.title !== '狐姬名冊') throw new Error('Clean staff route failed')
 const legacy = await navigate('/Kogakure/#/staff')
 if (!legacy.url.startsWith('/Kogakure/staff') || legacy.url.includes('#')) throw new Error('Old hash link migration failed')
 const unknown = await navigate('/Kogakure/example-missing-path')
 if (unknown.url !== '/Kogakure/example-missing-path') throw new Error('404 fallback failed')

 await command('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
 await navigate('/Kogakure/staff/')
 // A real Supabase staff member is not essential for route tests, but when one
 // exists, test a long biography without writing anything into Supabase.
 const available = await evaluate('!!document.querySelector(".omamori-card")')
 if (available) {
  await evaluate('document.querySelector(".omamori-card").click()')
  await wait(250)
  const modal = await evaluate('({visible:!!document.querySelector(".staff-dialog"),mode:getComputedStyle(document.querySelector(".staff-dialog")).overflowY})')
  if (!modal.visible || modal.mode !== 'auto') throw new Error('Mobile dialog scrolling is unavailable')
  await evaluate('document.querySelector(".detail-bio").textContent = "介紹內容。".repeat(1000);window.dispatchEvent(new Event("resize"))')
  await wait(300)
  const scrolling = await evaluate('({scrollHeight:document.querySelector(".staff-dialog").scrollHeight,height:document.querySelector(".staff-dialog").clientHeight,hint:!!document.querySelector(".dialog-scroll-hint"),bar:getComputedStyle(document.querySelector(".staff-dialog")).scrollbarWidth})')
  console.log('Mobile long biography:',scrolling)
  if (scrolling.scrollHeight <= scrolling.height || !scrolling.hint || scrolling.bar !== 'none') throw new Error('Long biography scrolling failed')
 }
 await command('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false})
 await navigate('/Kogakure/staff/')
 const hasDesktopCard = await evaluate('!!document.querySelector(".omamori-card")')
 if (hasDesktopCard) {
  await evaluate('document.querySelector(".omamori-card").click()')
  await wait(250)
  await evaluate('document.querySelector(".detail-bio").textContent="桌面長篇介紹。".repeat(1000);window.dispatchEvent(new Event("resize"))')
  await wait(300)
  const desktop = await evaluate('({photoHeight:document.querySelector(".dialog-photo").clientHeight,dialogHeight:document.querySelector(".staff-dialog").clientHeight,dialogOverflow:getComputedStyle(document.querySelector(".staff-dialog")).overflowY,textOverflow:getComputedStyle(document.querySelector(".dialog-content")).overflowY,textScroll:document.querySelector(".dialog-content").scrollHeight,textHeight:document.querySelector(".dialog-content").clientHeight,bar:getComputedStyle(document.querySelector(".dialog-content")).scrollbarWidth,hint:!!document.querySelector(".dialog-scroll-hint")})')
  console.log('Desktop long biography:',desktop)
  if (desktop.dialogOverflow!=='hidden' || desktop.textOverflow!=='auto' || desktop.textScroll<=desktop.textHeight || !desktop.hint || desktop.bar!=='none') throw new Error('Desktop biography scrolling failed')
  await evaluate('document.querySelector(".dialog-close").click()')
 }
 await evaluate('document.querySelector(".desktop-nav a[href$=about]")?.click()')
 await wait(1750)
 const afterNav = await evaluate('({url:location.pathname+location.hash,title:document.querySelector("main h1")?.textContent,overlay:document.querySelector(".page-transition-curtain")?.className})')
 console.log('Clean navigation:',afterNav)
 if (!afterNav.url.startsWith('/Kogakure/about') || afterNav.url.includes('#') || afterNav.title!=='館內介紹' || afterNav.overlay!=='page-transition-curtain') throw new Error('BrowserRouter navigation failed')
 console.log('PASS: direct clean URLs, hash migration, static 404 fallback, responsive biography scrolling, page navigation')
} finally {
 socket?.close()
 chrome.kill()
 await new Promise(resolve => server.close(resolve))
}
