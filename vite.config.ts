import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
 plugins: [react()],
 base: process.env.VITE_BASE_PATH || '/',
 build: process.env.VITE_OFFLINE_PREVIEW === 'true'
  ? { rollupOptions: { output: { inlineDynamicImports: true } } }
  : {
    rollupOptions: {
     output: {
      // Stable third-party modules change less often than site content.
      // Separate them for browser caching without delaying the menu shell.
      manualChunks(id: string) {
       const path = id.replaceAll('\\', '/')
       if (path.includes('/node_modules/@supabase/')) return 'vendor-supabase'
       if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path))
        return 'vendor-react'
      },
     },
    },
   },
})
