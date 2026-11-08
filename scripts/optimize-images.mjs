import sharp from 'sharp'
import { buildTransparentLogo } from './logo-alpha.mjs'
import { readdir, mkdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const out = join(root, 'public', 'images')

// public/images is build-generated only. Never put original artwork here.
// Clean the previous output so removed/unused images cannot leak into a release.
await rm(out, { recursive: true, force: true })
for (const category of ['brand', 'staff', 'scenes']) {
 await mkdir(join(out, category), { recursive: true })
}

const report = []
async function exportImage(source, destination, { width, quality = 92 } = {}) {
 const input = join(root, source)
 const output = join(out, destination)
 const before = (await stat(input)).size
 const image = sharp(input).rotate()
 if (width) image.resize({ width, withoutEnlargement: true })
 const meta = await image.webp({ quality, effort: 5, smartSubsample: true }).toFile(output)
 report.push({ destination, input: source, before, after: meta.size })
 console.log(destination + ': ' + (before / 1024).toFixed(0) + ' KB → ' + (meta.size / 1024).toFixed(0) + ' KB')
}

// Only assets currently used by the frontend are published. Keep all original
// scene photos and the spare staff photo in the local source folders.
await buildTransparentLogo(root, '狐隱LOGO/狐隱金彩櫻花物語.png', [
 { path: 'brand/logo-wide.webp', maxWidth: 1150 },
])
await buildTransparentLogo(root, '狐隱LOGO/狐隱之湯：金月白狐徽章.png', [
 { path: 'brand/logo-header.webp', maxWidth: 140 },
 { path: 'brand/logo-intro.webp', maxWidth: 320, quality: 92 },
])

await exportImage('員工圖/FBK2.png', 'staff/staff-01-full.webp', { width: 1900, quality: 94 })
await exportImage('員工圖/FBK2.png', 'staff/staff-01-card.webp', { width: 800, quality: 90 })
await exportImage('員工圖/99.png', 'staff/staff-02-full.webp', { width: 1900, quality: 94 })
await exportImage('員工圖/99.png', 'staff/staff-02-card.webp', { width: 800, quality: 90 })

const scenes = (await readdir(join(root, '場景照')))
 .filter(name => /\.(png|jpe?g|webp)$/i.test(name))
 .sort()
const BACKGROUND_SCENE_COUNT = 7
if (scenes.length < BACKGROUND_SCENE_COUNT) throw new Error('At least seven original scene photos are required')
// Seven lightweight scenes are available for cross-fading on route changes.
// Original screenshots and the other seven scenes remain local and untouched.
for (let i = 0; i < BACKGROUND_SCENE_COUNT; i++) {
 const n = String(i + 1).padStart(2, '0')
 const settings = i < 2 ? { width: 1900, quality: 92 } : { width: 1600, quality: 83 }
 await exportImage(join('場景照', scenes[i]), 'scenes/scene-' + n + '.webp', settings)
}

const total = report.reduce((n, x) => n + x.after, 0)
console.log('Generated ' + (report.length + 3) + ' website assets in three categories.')
console.log('Original source folders unchanged. Optimized photo total: ' + (total / 1024 / 1024).toFixed(2) + ' MB.')
