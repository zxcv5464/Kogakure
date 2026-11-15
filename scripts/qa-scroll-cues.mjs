// Shared scroll affordance regression: read-only, no DB writes.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
const files=[
 'src/components/ScrollCue.tsx','src/components/scroll-cue.css',
 'src/components/StaffDialog.tsx','src/components/staff-dialog-scroll.css',
 'src/components/Layout.tsx','src/components/EntryIntro.tsx',
 'src/pages/BookingPage.tsx','src/pages/admin/BookingManagement.tsx',
 'src/pages/admin/AdminBookingCreate.tsx','src/pages/admin/AccountingManagement.tsx',
 'src/pages/admin/AnnouncementManagement.tsx','src/pages/admin/MenuManagement.tsx',
 'src/pages/admin/StaffManagement.tsx','src/pages/admin/ShiftManagement.tsx',
 'src/pages/admin/ServicePhotoCropEditor.tsx',
]
const content=Object.fromEntries(await Promise.all(files.map(async p=>[p,await readFile(p,'utf8')])))
const get=p=>content[p]
assert.ok(get(files[0]).includes("className={'shared-scroll-cue'")&&
 get(files[0]).includes('new ResizeObserver(schedule)')&&
 get(files[0]).includes('new MutationObserver(schedule)')&&
 get(files[0]).includes("area.addEventListener('scroll',schedule")&&
 get(files[0]).includes('area.scrollBy(')&&
 get(files[0]).includes("'(prefers-reduced-motion: reduce)'")&&
 get(files[0]).includes("direction==='right'")&&
 get(files[0]).includes('tabIndex={hasMore?0:-1}')&&
 get(files[0]).includes('disabled={!hasMore}'),
 'Only show and enable the correct directional arrow while more content exists')
assert.ok(get(files[1]).includes('body *{scrollbar-width:none!important')&&
 get(files[1]).includes('body *::-webkit-scrollbar')&&
 get(files[1]).includes('display:none!important')&&
 get(files[1]).includes('.shared-scroll-cue.is-sticky')&&
 get(files[1]).includes('.shared-scroll-cue.is-below')&&
 get(files[1]).includes('.shared-scroll-cue:focus-visible')&&
 get(files[1]).includes('prefers-reduced-motion:reduce'),
 'Native scroll bars must be hidden but arrows retain keyboard operation')
assert.ok(!get(files[2]).includes('繼續閱讀')&&
 get(files[2]).includes('<ChevronDown size={21}')&&
 get(files[2]).includes('aria-label="向下閱讀更多狐姬介紹"')&&
 get(files[2]).includes('hasMore&&<button')&&
 get(files[3]).includes('@keyframes staffScrollArrow'),
 'Staff detail must replace the continue-reading text button with a gold down arrow')
for(const [path,fragment] of [
 ['src/components/Layout.tsx','<ScrollCue/>'],
 ['src/components/EntryIntro.tsx','<ScrollCue/>'],
 ['src/pages/BookingPage.tsx','<ScrollCue/>'],
 ['src/pages/admin/BookingManagement.tsx','<ScrollCue/>'],
 ['src/pages/admin/AdminBookingCreate.tsx','<ScrollCue/>'],
 ['src/pages/admin/AccountingManagement.tsx','<ScrollCue target=".accounting-entry-list"/>'],
 ['src/pages/admin/AnnouncementManagement.tsx','<ScrollCue target=".announcement-admin-list"/>'],
 ['src/pages/admin/MenuManagement.tsx','<ScrollCue target=".menu-admin-list"/>'],
 ['src/pages/admin/StaffManagement.tsx','<ScrollCue target=".staff-roster-list"/>'],
 ['src/pages/admin/ShiftManagement.tsx','<ScrollCue target=".shift-calendar-scroll" direction="right"/>'],
 ['src/pages/admin/ServicePhotoCropEditor.tsx','<ScrollCue/>'],
 ]){
 assert.ok(get(path).includes(fragment),
  'Missing contextual scrollbar replacement in '+path+': '+fragment)
 assert.ok(get(path).includes("import ScrollCue from "),
  'Shared hint should be imported explicitly in '+path)
}
assert.ok(get('src/pages/admin/ShiftManagement.tsx').includes(
 'onRename={rename} onRemove={remove}/>\n     <ScrollCue/>'),
 'Shift editor body should have a downward scroll arrow as well as a right-facing calendar hint')
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {default:ScrollCue}=await vite.ssrLoadModule('/src/components/ScrollCue.tsx')
 const html=renderToStaticMarkup(createElement('section',{},
  createElement(ScrollCue),
  createElement(ScrollCue,{direction:'right',target:'.calendar'})))
 assert.ok(html.includes('向下滑動查看更多內容')&&
 html.includes('向右滑動查看更多內容')&&
 html.includes('shared-scroll-cue')&&
 html.includes('disabled=""'),
 'Server-rendered controls must start inactive without a flash')
 console.log('PASS: no visible native bars, contextual down/right arrows across public and admin, staff reading hint, keyboard and reduced motion')
}finally{await vite.close()}
