import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { watchBookingChanges } from '../../lib/bookings'
import { useAdminEditGuard } from './AdminEditGuard'
import './booking-notification.css'

type PendingInfo = { id: string; guest_name: string; guest_world: string; plan_name: string }

/**
 * Single authenticated source for the sidebar count and the existing
 * incoming-request notice. The exact count is not capped by the 20 rows
 * fetched for detecting a new arrival.
 */
export function usePendingBookings() {
 const [pendingCount, setPendingCount] = useState<number | null>(null)
 const [unread, setUnread] = useState<PendingInfo | null>(null)
 const [failed, setFailed] = useState(false)
 const ids = useRef(new Set<string>())
 const initialized = useRef(false)

 useEffect(() => {
  if (!supabase) return
  const client = supabase
  let active = true
  let requestVersion = 0

  async function refresh() {
   const version = ++requestVersion
   try {
    const { data, count, error } = await client.from('booking_requests')
     .select('id,guest_name,guest_world,plan_name', { count: 'exact' })
     .eq('status', 'pending')
     .order('created_at', { ascending: false })
     .limit(20)

    if (!active || version !== requestVersion) return
    if (error || count === null) {
     setFailed(true)
     setPendingCount(null)
     setUnread(null)
     return
    }
    const rows = data as PendingInfo[]
    const nextArrival = initialized.current
     ? rows.find(row => !ids.current.has(row.id)) ?? null
     : null

    setPendingCount(count)
    setFailed(false)
    setUnread(previous => nextArrival ?? (
     previous && rows.some(row => row.id === previous.id) ? previous : null
    ))
    ids.current = new Set(rows.map(row => row.id))
    initialized.current = true
   } catch {
    if (active && version === requestVersion) {
     setFailed(true)
     setPendingCount(null)
     setUnread(null)
    }
   }
  }

  void refresh()
  const unwatch = watchBookingChanges(() => { void refresh() }, true)
  const poll = window.setInterval(() => {
   if (document.visibilityState === 'visible') void refresh()
  }, 9000)
  const onVisible = () => {
   if (document.visibilityState === 'visible') void refresh()
  }
  const onFocus = () => { void refresh() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onFocus)

  return () => {
   active = false
   unwatch()
   window.clearInterval(poll)
   document.removeEventListener('visibilitychange', onVisible)
   window.removeEventListener('focus', onFocus)
  }
 }, [])

 return { pendingCount, unread, failed, dismiss: () => setUnread(null) }
}

export default function BookingNotification({
 pendingCount, unread, onDismiss,
}: {
 pendingCount: number | null
 unread: PendingInfo | null
 onDismiss: () => void
}) {
 const { confirmNavigation } = useAdminEditGuard()
 if (!pendingCount && !unread) return null

 return <div className="admin-booking-notify" role={unread ? 'alert' : 'status'}>
  <Bell size={18}/><span>
   <strong>{unread
    ? '新指名申請 · ' + unread.guest_name + '（' + unread.guest_world + '）'
    : '目前有 ' + pendingCount + ' 筆待審核預約'}</strong>
   <small>{unread
    ? unread.plan_name + '，請查看完整指名資訊並決定是否接取'
    : '館方接取或婉拒後，側邊欄數量會同步更新'}</small>
  </span>
  <Link to="/admin/booking" onClick={event => {
   confirmNavigation(event)
   if (!event.defaultPrevented) onDismiss()
  }}>前往預約管理</Link>
  {unread && <button type="button" aria-label="關閉新預約提示" onClick={onDismiss}>×</button>}
 </div>
}
