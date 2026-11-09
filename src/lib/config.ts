export const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
export const supabaseKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
// The downloadable preview is intentionally read-only and uses local sample data.
export const configured=import.meta.env.VITE_OFFLINE_PREVIEW !== 'true' && Boolean(supabaseUrl && supabaseKey)
