import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const build = path.join(root, 'dist-offline-build')
const output = path.join(root, 'dist-offline-preview')
let html = await readFile(path.join(build, 'index.html'), 'utf8')

const script = html.match(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*><\/script>/)
const style = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+\.css)"[^>]*>/)
if (!script || !style) throw new Error('離線打包失敗：找不到已編譯的主程式或樣式。')

const loadOutput = (asset) => readFile(path.join(build, asset.replace(/^\.\//, '')), 'utf8')
const [javascript, css] = await Promise.all([loadOutput(script[1]), loadOutput(style[1])])

// Browsers reject local file:// module imports. Keep the app in one inline
// module and CSS in the same HTML, with images stored in a sibling folder.
// Use a replacement callback: bundled JavaScript includes $& / $' text,
// which String.replace would otherwise expand and corrupt the app bundle.
html = html.replace(script[0], () => `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`)
html = html.replace(style[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow"/></head>')

await mkdir(output, { recursive: true })
await cp(path.join(build, 'images'), path.join(output, 'images'), { recursive: true })
await writeFile(path.join(output, 'index.html'), html)
await writeFile(path.join(output, '使用說明.txt'), [
 '狐隱 KOGAKURE — 離線展示版',
 '',
 '1. 請先完整解壓縮 ZIP。',
 '2. 在解壓後的資料夾，直接雙擊 index.html。',
 '3. 使用網站選單切換頁面，點選人員卡片可檢查名帖。',
 '4. 人員資料使用內建的展示角色，與正式資料庫無關。',
 '5. 此版不連接 Supabase；管理後台、上傳與編輯資料不可使用。',
 '6. 保留開場、頁面淡入、選單滑動、每 5 秒背景圖片輪播及卡片動態。',
 '',
 '這是僅供檢查外觀的離線版本，未更新正式 GitHub Pages 網站。',
].join('\n'))

console.log(`已建立離線展示版：${output}`)
