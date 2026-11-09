import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// GitHub Pages has no SPA rewrite rules. Output a tiny HTML entry for every
// known BrowserRouter route so direct links and refreshes return HTTP 200.
const routes = ['about', 'services', 'staff', 'shifts', 'menu', 'booking', 'admin']
const routeTitles = {
 about: '館內介紹', services: '服務內容', staff: '狐隱名帖',
 shifts: '值班排班', menu: '點菜', booking: '預約', admin: '後台管理',
}
const dist = resolve('dist')
const entry = await readFile(join(dist, 'index.html'), 'utf8')

for (const route of routes) {
 const folder = join(dist, route)
 await mkdir(folder, { recursive: true })
 await writeFile(join(folder, 'index.html'), entry.replace('<title>狐隱 KOGAKURE｜首頁</title>', `<title>狐隱 KOGAKURE｜${routeTitles[route]}</title>`), 'utf8')
}

const base = process.env.VITE_BASE_PATH || '/'
if (!base.startsWith('/') || !base.endsWith('/')) {
 throw new Error('VITE_BASE_PATH must start and end with /')
}

// Unknown deep links can still recover via a GitHub Pages custom 404.
// The redirect only targets the same origin. The original clean URL is
// restored in main.tsx before React mounts.
const fallback = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>正在開啟狐隱…</title>
<script>
(function () {
 var base = ${JSON.stringify(base)};
 var path = location.pathname + location.search + location.hash;
 if (location.pathname.startsWith(base)) {
  location.replace(base + '?__route=' + encodeURIComponent(path));
 } else {
  location.replace(base);
 }
})();
</script>
</head>
<body><p>正在開啟狐隱…</p><a href="${base}">返回首頁</a></body>
</html>`
await writeFile(join(dist, '404.html'), fallback, 'utf8')
console.log(`Generated ${routes.length} clean route entries and the GitHub Pages 404 fallback for ${base}`)
