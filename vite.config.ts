import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
 plugins: [react()],
 base: process.env.VITE_BASE_PATH || '/',
 build: process.env.VITE_OFFLINE_PREVIEW === 'true'
  ? { rollupOptions: { output: { inlineDynamicImports: true } } }
  : undefined,
})
