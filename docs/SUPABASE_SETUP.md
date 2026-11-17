# 狐隱 KOGAKURE｜Supabase 架構變更與必要性

本文僅記錄資料模型、版本相容性和安全邊界；不提供專案建立、SQL 執行、環境變數或帳號操作教學。文件修改**沒有變更正式 Supabase 資料庫**。

## 系統分工及必要性

| 元件 | 職責 | 必要性 |
| --- | --- | --- |
| 公開 React/Vite 網站 | 顯示公開資訊並發出受控請求 | 前端不能持有伺服器秘密 |
| PostgreSQL／RLS | 區分公開資料與訂單、預約、帳務及員工隱私 | 防止未授權資料讀寫 |
| Supabase Auth | 正式管理員及員工身分 | 避免所有人共用同一帳號 |
| Storage | 名帖、服務及背景音樂公開素材 | 圖片可讀不代表可以寫入／刪除 |
| 受控 RPC | 公開提交與敏感狀態變更 | 避免客戶端任意修改價格、狀態或他人資料 |
| `manage-employee-accounts` Edge Function | 受限管理員工 Auth 帳號 | 高權限動作留在伺服器端 |

## 已有版本與相容性考量

- `supabase/migrations/` 從 `20261108_01_staff.sql` 基礎版本發展出菜單、茶宴訂單、預約、四週排班、服務、公告、BGM、帳務及權限變更。
- migration 具有先後相依性；`IF NOT EXISTS` 不代表整份舊 SQL 可以安全重複套用，因為後續 RPC、欄位與權限可能已替換。
- 2026-11-17 的繁中服世界及訪客姓名驗證版本影響公開訂單與預約函式；重新套用舊定義可能讓安全檢查回退。
- 靜態站點版本、資料庫 schema/RLS、Storage 規則及 Edge Function 版本彼此獨立，不可由 GitHub 合併狀態推論全部同步。
- 前端的 `VITE_*` 設定會進入公開建置，僅能使用公開 URL 與 Publishable Key；service-role、`sb_secret_*`、資料庫密碼及簽章秘密只能留在受控服務端。

## 未解風險

- 匿名點單與預約 RPC 有基本冷卻規則，但缺乏完整、可信來源的限流與防機器人防護。
- 旅人姓名不再受舊 2～48 字限制，需另行評估合理請求大小與資源耗用上限。
- 員工的停用、撤權、帳號委派與 Edge Function JWT 邊界需對照正式執行版本。
- 訂單、預約、帳務等歷史資料涉及保存期限、永久刪除、備份及復原責任。
- 適用於匿名、普通員工、受限管理員及正式管理員的 RLS/RPC 隔離，需要正式環境證據；離線 QA 不能證明實際雲端規則一致。

相關變更說明：`docs/SECURITY_REVIEW_20261117.md`、`docs/STAFF_ACCOUNTS.md`、`docs/BOOKING_SETUP.md`、`docs/TEA_ORDER_SETUP.md`。
