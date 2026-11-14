// The sidebar and booking inbox alert must derive from ONE authenticated
// exact-count query. Render the notice independently without live credentials.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const [admin,notification,css] = await Promise.all([
 'src/pages/AdminPage.tsx',
 'src/pages/admin/BookingNotification.tsx',
 'src/pages/admin/admin-workspace.css',
].map(path => readFile(path, 'utf8')))

assert.ok(admin.includes("usePendingBookings(allowed(access,'booking'))"), 'The admin frame must own the shared pending state')
assert.ok(admin.includes("module.id === 'booking'"), 'The badge must only appear beside booking management')
assert.ok(admin.includes('pendingCount > 0'), 'Never show a zero pending-count badge')
assert.ok(admin.includes('hasPending && <span className="admin-nav-booking-badge"'), 'The sidebar badge must show the current count')
assert.ok(admin.includes('admin-nav-booking-warning'), 'Failed updates must be distinguishable from zero bookings')
assert.ok(admin.includes('pendingCount={pendingCount} unread={unread} onDismiss={dismiss}'), 'The banner must receive the very same count')
assert.ok(notification.includes("{ count: 'exact' }"), 'The badge must use the database exact row count')
assert.ok(notification.includes(".eq('status', 'pending')"), 'Only pending applications should be counted')
assert.ok(notification.includes('.limit(20)'), 'Lightweight preview is allowed only when exact count is separate')
assert.ok(notification.includes('setPendingCount(count)'), 'Displayed number must use returned count, not preview length')
assert.ok(!notification.includes('setPendingCount(rows.length)'), 'Never cap the badge at 20 bookings')
assert.ok(notification.includes('watchBookingChanges'), 'Realtime updates should remain enabled')
assert.ok(notification.includes('window.setInterval'), 'Reconnect polling must remain enabled')
assert.ok(notification.includes("document.visibilityState === 'visible'"), 'A hidden tab should avoid unnecessary polling')
assert.ok(notification.includes('window.removeEventListener'), 'All watchers must clean up after unmount')
assert.ok(notification.includes('setPendingCount(null)'), 'Do not present stale numbers as live after a fetch failure')
assert.ok(css.includes('.admin-nav-booking-badge'), 'The badge must be visible beside its navigation item')
assert.ok(css.includes('@media (max-width: 850px)'), 'Booking count must fit mobile navigation')
const badgeRegion = admin.slice(admin.indexOf("const bookingItem = module.id === 'booking'"), admin.indexOf('</NavLink>',admin.indexOf("const bookingItem = module.id === 'booking'")))
assert.ok(!badgeRegion.includes('guest_name') && !badgeRegion.includes('guest_world'), 'Sidebar may not reveal guest details')

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
 const { default: BookingNotification } = await vite.ssrLoadModule('/src/pages/admin/BookingNotification.tsx')
 const { AdminEditGuardProvider } = await vite.ssrLoadModule('/src/pages/admin/AdminEditGuard.tsx')
 const render = (pendingCount, unread = null) => renderToStaticMarkup(
  createElement(MemoryRouter, { initialEntries: ['/admin'] },
   createElement(AdminEditGuardProvider, null,
    createElement(BookingNotification, { pendingCount, unread, onDismiss: () => {} })))
 )
 assert.match(render(37), /37 筆待審核預約/, 'Banner must use exact counts above the 20-row preview limit')
 assert.match(render(37), /前往預約管理/, 'Banner must link to booking administration')
 assert.equal(render(0), '', 'No empty booking notification when count is zero')
 assert.match(render(1, { id: 'test', guest_name: '測試旅人', guest_world: 'Leviathan', plan_name: '測試方案' }), /測試旅人/, 'Existing incoming booking toast must remain')
 console.log('PASS: one exact count for sidebar and inbox, responsive badge, nonzero display and realtime fallback')
} finally {
 await vite.close()
}
