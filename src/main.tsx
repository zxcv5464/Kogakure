import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Migrate old bookmarked hash links and GitHub Pages 404 fallbacks before
// BrowserRouter initializes, so neither route ever flashes the wrong page.
const base = import.meta.env.BASE_URL
const url = new URL(window.location.href)
const redirected = url.searchParams.get('__route')
if (redirected) {
 try {
  const target = new URL(redirected, url.origin)
  if (target.origin === url.origin && target.pathname.startsWith(base)) {
   window.history.replaceState(null, '', target.pathname + target.search + target.hash)
  }
 } catch { /* Ignore malformed links. */ }
} else if (url.hash.startsWith('#/')) {
 const legacy = url.hash.slice(1)
 if (legacy.startsWith('/') && !legacy.startsWith('//')) {
  window.history.replaceState(null, '', base + legacy.slice(1) + url.search)
 }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode><BrowserRouter basename={base}><App /></BrowserRouter></React.StrictMode>
)
