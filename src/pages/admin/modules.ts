import type { LucideIcon } from 'lucide-react'
import { CalendarDays, ClipboardList, FileText, Soup, UsersRound, ShieldCheck, ShoppingBag, ScrollText, Wallet } from 'lucide-react'

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
 { id: 'accounts', title: '員工帳號', summary: '建立員工登入帳號、密碼、管理權限與刪除帳號', icon: ShieldCheck, path: '/admin/accounts', status: 'available' },
 { id: 'staff', title: '員工名帖', summary: '管理人員介紹、照片、顯示順序與公開狀態', icon: UsersRound, path: '/admin/staff', status: 'available' },
 { id: 'announcements', title: '公告管理', summary: '編輯館內公告與最新消息、置頂及發布狀態（管理員）', icon: FileText, path: '/admin/announcements', status: 'available' },
 { id: 'accounting', title: '帳務管理', summary: '每日／每月 Gil 收支登錄、結餘統計與明細匯出（管理員）', icon: Wallet, path: '/admin/accounting', status: 'available' },
 { id: 'menu', title: '菜單管理', summary: '茶宴分類、品項、Gil 金額、供應狀態與公開排序', icon: Soup, path: '/admin/menu', status: 'available' },
 { id: 'services', title: '服務內容管理', summary: '新增服務、上傳多張照片、調整輪播順序與公開狀態（管理員）', icon: ScrollText, path: '/admin/services', status: 'available' },
 { id: 'orders', title: '訂單管理', summary: '按日期查看茶宴點單、接單、完成與取消訂單', icon: ShoppingBag, path: '/admin/orders', status: 'available' },
 { id: 'booking', title: '預約管理', summary: '指名人員開放設定、預約審核、方案與即時計時', icon: ClipboardList, path: '/admin/booking', status: 'available' },
 { id: 'shifts', title: '值班排班', summary: '管理員設定營業日期，館員登記出勤；四週自動滾動', icon: CalendarDays, path: '/admin/shifts', status: 'available' },
]
