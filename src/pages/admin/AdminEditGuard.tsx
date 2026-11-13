import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

type EditGuard = {
 dirty: boolean
 busy: boolean
 setEditing: (dirty: boolean, busy: boolean) => void
 canLeave: () => boolean
 confirmNavigation: (event: MouseEvent<HTMLAnchorElement>) => void
}
const Context = createContext<EditGuard | null>(null)

export function AdminEditGuardProvider({ children }: { children: ReactNode }) {
 const [editing, setEditingState] = useState({ dirty: false, busy: false })
 const setEditing = useCallback((dirty: boolean, busy: boolean) => {
  setEditingState(previous => previous.dirty === dirty && previous.busy === busy ? previous : { dirty, busy })
 }, [])
 const canLeave = useCallback(() => {
  if (editing.busy) {
   window.alert('正在處理後台資料，請完成後再切換頁面。')
   return false
  }
  return !editing.dirty || window.confirm('目前有尚未儲存的後台修改。確定要放棄這些變更？')
 }, [editing])
 const confirmNavigation = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
  // Do not interfere with opening a different tab, download, or the same route.
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
  const destination = new URL(event.currentTarget.href, window.location.href)
  if (destination.pathname.replace(/\/+$/, '') === window.location.pathname.replace(/\/+$/, '')) return
  if (!canLeave()) event.preventDefault()
 }, [canLeave])
 useEffect(() => {
  if (!editing.dirty && !editing.busy) return
  const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
  window.addEventListener('beforeunload', beforeUnload)
  return () => window.removeEventListener('beforeunload', beforeUnload)
 }, [editing])
 const value = useMemo(() => ({ ...editing, setEditing, canLeave, confirmNavigation }), [editing, setEditing, canLeave, confirmNavigation])
 return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAdminEditGuard() {
 const context = useContext(Context)
 if (!context) throw new Error('Admin edit guard is missing')
 return context
}
