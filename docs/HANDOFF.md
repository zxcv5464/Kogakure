# 狐隱 KOGAKURE｜維護變更與交接風險

本文件聚焦既有設計的理由、資料相容性及未解風險，不包含 Git 操作、部署或後台使用教學。功能狀態仍以當次 GitHub 原始碼及實際環境為準。

## 維護架構

- 前端：React、TypeScript、Vite；公開網站與後台共用部分基礎設施，但各管理模組獨立。
- 發布：GitHub Actions 管理建置與靜態站點；資料庫、Storage 和 Edge Function 不會跟著靜態網站自動升級。
- 資料：Supabase Auth、PostgreSQL RLS、受控 RPC、Storage。
- 相關區域：`src/App.tsx`、`src/pages/admin/`、`src/lib/`、`supabase/migrations/`、`supabase/functions/`。

## 近期重要變更及必要性

| 變更 | 必要性 |
| --- | --- |
| 後台採獨立版型與模組權限 | 避免前台展示與敏感管理功能混用 |
| 員工名帖加入排序、未儲存提醒和圖片暫存 | 減少誤操作、孤兒上傳與資料遺失 |
| 公開茶宴與指名預約改為受控 RPC | 防止訪客自行決定價格、預約狀態或讀取他人資料 |
| 支援可委派員工權限 | 讓職責分工不必共享最高權限帳號 |
| 公開頁面分割載入、BGM 前景刷新 | 降低初始下載量及無效背景請求 |
| 保留變更紀錄與自動回歸驗證 | 追蹤互相依賴的功能，降低跨模組回歸風險 |

## 尚待處理

- 名帖多人同時編輯缺少完整的資料版本衝突保護。
- 已替換照片的 Storage 舊檔可能殘留；不能直接依 URL 變化判定可刪。
- 瀏覽器上一頁／下一頁時的未儲存草稿保護仍需實機確認。
- 正式資料庫的 migration、RLS、員工權限、敏感 RPC 及 Edge Function 版本需要個別核對。
- 對匿名提交、使用者輸入長度與第三方音樂授權，仍有安全及營運風險。
- 自動化與 Chromium QA 不等於真實手機瀏覽器或正式 Supabase 的完整驗收。

## 文件對照

- `docs/ROADMAP.md`：實作進度與待辦。
- `docs/STAFF_ADMIN_AUDIT.md`：名帖管理修正。
- `docs/SUPABASE_SETUP.md`：資料與身分權限的設計界線。
- `docs/GITHUB_PUBLISH.md`：部署架構與儲存庫隱私考量。
- `docs/SECURITY_REVIEW_20261117.md`：已查核項目與風險優先順序。
