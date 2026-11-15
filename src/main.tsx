import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Migrate old bookmarked hash links and GitHub Pages 404 fallbacks before
// BrowserRouter initializes, so neither route ever flashes the wrong page.
const base = import.meta.env.BASE_URL
const offlinePreview = import.meta.env.VITE_OFFLINE_PREVIEW === 'true'
const Router = offlinePreview ? HashRouter : BrowserRouter
const url = new URL(window.location.href)
const redirected = url.searchParams.get('__route')
if (!offlinePreview && redirected) {
 try {
  const target = new URL(redirected, url.origin)
  if (target.origin === url.origin && target.pathname.startsWith(base)) {
   window.history.replaceState(null, '', target.pathname + target.search + target.hash)
  }
 } catch { /* Ignore malformed links. */ }
} else if (!offlinePreview && url.hash.startsWith('#/')) {
 const legacy = url.hash.slice(1)
 if (legacy.startsWith('/') && !legacy.startsWith('//')) {
  window.history.replaceState(null, '', base + legacy.slice(1) + url.search)
 }
}


/**
 * GitHub Pages serves route folders with a trailing slash (e.g. /shifts/).
 * BrowserRouter and every fallback page should receive one canonical path,
 * including after a 404-route restore or a legacy hash redirect.
 */
if(!offlinePreview){
 const current=window.location.pathname
 if(current.startsWith(base)&&current!==base&&current.endsWith('/')){
  const clean=current.slice(0,-1)
  window.history.replaceState(window.history.state,'',clean+window.location.search+window.location.hash)
 }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode><Router basename={offlinePreview ? undefined : base}><App /></Router></React.StrictMode>
)
