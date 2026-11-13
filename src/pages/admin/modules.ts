import type { LucideIcon } from 'lucide-react'
import { CalendarDays, ClipboardList, Clock3, FileText, Soup, UsersRound } from 'lucide-react'

// The admin catalog is the extension point for future, separately permissioned
// features. Planned entries are deliberately not links until implemented.
export type AdminModule = {
 id: string
 title: string
 summary: string
 icon: LucideIcon
 path?: string
 status: 'available' | 'planned'
}
export const ADMIN_MODULES: AdminModule[] = [
 { id: 'staff', title: '員工名帖', summary: '管理人員介紹、照片、顯示順序與公開狀態', icon: UsersRound, path: '/admin/staff', status: 'available' },
 { id: 'announcements', title: '公告管理', summary: '館內公告、最新消息與首頁資訊', icon: FileText, status: 'planned' },
 { id: 'hours', title: '營業資訊', summary: '營業時間、館內說明與基本資料', icon: Clock3, status: 'planned' },
 { id: 'menu', title: '菜單管理', summary: '茶宴分類、品項、Gil 金額、供應狀態與公開排序', icon: Soup, path: '/admin/menu', status: 'available' },
 { id: 'booking', title: '預約管理', summary: '預約時段、訂單與通知', icon: ClipboardList, status: 'planned' },
 { id: 'shifts', title: '值班排班', summary: '接待人員排班及值班資訊', icon: CalendarDays, status: 'planned' },
]
