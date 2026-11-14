import { createClient } from '@supabase/supabase-js'
import { configured, supabaseUrl, supabaseKey } from './config'
export const supabase = configured ? createClient(supabaseUrl, supabaseKey, {
 auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true},
}) : null
