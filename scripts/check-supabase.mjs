import { createClient } from '@supabase/supabase-js'

// Read-only check. Requires .env.local; no admin password or secret keys.
const url = process.env.VITE_SUPABASE_URL?.trim()
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
if (!url || !key) {
 console.error('尚未填入 .env.local 的 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。')
 process.exit(1)
}
if (key.startsWith('sb_secret_') || key.startsWith('eyJ') || /service_role/i.test(key)) {
 console.error('拒絕使用 Secret / Service Role 金鑰。請使用 Supabase Publishable Key（sb_publishable_...）。')
 process.exit(1)
}
let origin
try {
 const parsed = new URL(url)
 if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error()
 origin = parsed.origin
} catch {
 console.error('Supabase URL 格式不正確。')
 process.exit(1)
}
console.log('檢查 Supabase 專案：' + origin)
const db = createClient(url, key, {
 auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const { data, error, status } = await db.from('staff').select('id,is_published').limit(10)
if (error) {
 console.error('員工資料表查詢失敗（HTTP '+status+'）：'+error.message)
 console.error('請確認 SQL Editor 已執行 supabase/migrations/20261108_01_staff.sql，且專案 URL / 公開金鑰正確。')
 process.exit(1)
}
if (data?.some(row=>row.is_published!==true)) {
 console.error('安全檢查失敗：未登入的訪客讀到了未公開的員工！請重新檢查 staff RLS 政策。')
 process.exit(1)
}
console.log('✓ staff 公開資料表可連線；匿名查詢僅回傳公開紀錄。（目前回傳 '+(data?.length??0)+' 筆）')
const admin = await db.from('admin_users').select('user_id').limit(1)
if (admin.data?.length) {
 console.error('安全檢查失敗：匿名使用者可讀到管理員資料！')
 process.exit(1)
}
console.log('✓ 匿名使用者無法取得管理員名單。')
console.log('✓ 公開連線檢查完成。請至 /admin 測試實際管理員登入、上傳及儲存。')
