import { supabase } from './supabase'

export type UploadedStaffImages = {
 full: string
 thumb: string
 paths: [string, string]
}

async function webp(file: File, maxWidth: number, quality: number): Promise<Blob> {
 const bitmap = await createImageBitmap(file)
 try {
  if (!bitmap.width || !bitmap.height) throw new Error('圖片尺寸無效')
  const scale = Math.min(1, maxWidth / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('此瀏覽器無法處理圖片')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
   blob => blob ? resolve(blob) : reject(new Error('無法轉換 WebP')),
   'image/webp', quality,
  ))
 } finally {
  bitmap.close()
 }
}

export function validateStaffImage(file: File): void {
 if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('只支援 PNG、JPG、WebP 或 AVIF 圖片')
 if (file.size > 24 * 1024 * 1024) throw new Error('來源圖片不可超過 24 MB')
 if (file.size === 0) throw new Error('圖片檔案是空的')
}

export async function removeUploadedStaffImages(paths: string[]): Promise<void> {
 if (!supabase || paths.length === 0) return
 const { error } = await supabase.storage.from('staff-media').remove(paths)
 if (error) throw error
}

export async function uploadStaffImage(file: File, staffId: string): Promise<UploadedStaffImages> {
 if (!supabase) throw new Error('尚未設定 Supabase')
 validateStaffImage(file)
 const [full, thumb] = await Promise.all([webp(file, 2000, .94), webp(file, 760, .89)])
 const stamp = Date.now() + '-' + crypto.randomUUID().slice(0, 8)
 const fullPath = 'staff/' + staffId + '/' + stamp + '-full.webp'
 const thumbPath = 'staff/' + staffId + '/' + stamp + '-thumb.webp'
 const uploaded: string[] = []
 try {
  for (const [path, blob] of [[fullPath, full], [thumbPath, thumb]] as const) {
   const { error } = await supabase.storage.from('staff-media').upload(path, blob, {
    contentType: 'image/webp', upsert: false, cacheControl: '31536000',
   })
   if (error) throw error
   uploaded.push(path)
  }
 } catch (error) {
  // Failed halfway through uploading: do not keep the first orphan image.
  try { await removeUploadedStaffImages(uploaded) } catch { /* Preserve original error. */ }
  throw error
 }
 return {
  full: supabase.storage.from('staff-media').getPublicUrl(fullPath).data.publicUrl,
  thumb: supabase.storage.from('staff-media').getPublicUrl(thumbPath).data.publicUrl,
  paths: [fullPath, thumbPath],
 }
}
