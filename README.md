# 狐隱 KOGAKURE｜網站開發與維護

> 世有百鬼，夜有萬境。循狐而入，借湯忘憂。

狐隱是 FF14 RP 店鋪的公開展示與館務管理網站。前端採 React、TypeScript、Vite，靜態頁面由 GitHub Pages 發布；Supabase 提供 Auth、PostgreSQL／RLS、Storage 及員工帳號管理 Edge Function。

**本文件對照 GitHub `main` 於 2026-11-17 的原始碼。**「程式已實作」不代表店長的正式 Supabase 已執行每一份 migration，亦不代表已經過正式環境驗收。

## 本機開始

```bash
npm ci
npm run dev
```

- 公開首頁：`http://localhost:5173/`
- 狐姬名冊：`/staff`
- 茶宴：`/menu`；預約：`/booking`；四週值班：`/shifts`
- 後台登入與總覽：`/admin`
- 型別檢查：`npm run check`
- 正式建置：`npm run build`
- 依功能執行 `scripts/qa-*.mjs`；CI 清單見 `.github/workflows/verify.yml`

如需產出原始素材的 WebP，才執行 `npm run assets:build`。此指令會**重建** `public/images`；先確認未將手工新增圖片放在該目錄，原始圖片必須另行備份。

## 現有功能（程式碼層級）

公開網站包含首頁、入館須知、服務內容、狐姬名冊、值班排班、狐之茶宴（可建立正式訂單）、預約，以及共用開場、公告與 BGM。

後台採獨立版型、模組化路由及分別授權：

| 後台網址 | 模組 |
| --- | --- |
| `/admin/accounts` | 員工帳號與權限 |
| `/admin/staff` | 人員名帖、照片、公開狀態、拖曳排序 |
| `/admin/announcements` | 公告管理 |
| `/admin/bgm` | 背景音樂管理 |
| `/admin/accounting` | Gil 帳務與薪資紀錄 |
| `/admin/menu` | 茶宴菜單與價格 |
| `/admin/services` | 服務內容與相簿 |
| `/admin/orders` | 茶宴訂單處理 |
| `/admin/booking` | 指名方案、預約與計時 |
| `/admin/shifts` | 營業日與館員出勤 |

員工權限細節見 `docs/STAFF_ACCOUNTS.md`；各模組的操作與限制見 `docs/` 對應文件。公開名冊與後台員工帳號是不同資料，不應混為一談。

## 設定 Supabase

將 `.env.example` 複製為 `.env.local`，僅填**公開**欄位：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

`VITE_*` 會編譯進公開網站；**絕對不可放** `sb_secret_*`、`service_role`、資料庫密碼或使用者密碼。員工管理所需的高權限金鑰只能存於 Supabase Edge Function 的伺服器端環境。

資料庫 migration 在 `supabase/migrations/`，須依實際已套用版本、備份與相依順序處理。**GitHub Pages 部署不會自動套用 SQL migration 或 Edge Function。** 步驟見 `docs/SUPABASE_SETUP.md`。

正式資料與權限需使用具備授權的測試帳號、訪客無痕視窗分開驗證；`npm run db:check` 與離線 QA 不能代替實際的 RLS／CRUD 測試。

## 專案目錄

- `src/`：公開頁、後台、元件與 Supabase 資料操作。
- `public/images/`：公開網站使用的最佳化素材。
- `scripts/`：圖片處理、建置入口、靜態與瀏覽器 QA。
- `supabase/migrations/`：資料庫結構與權限（須另外部署）。
- `supabase/functions/`：伺服器端 Edge Function（須另外部署）。
- `docs/`：交接、部署、安全及各功能說明。
- `dist/`：建置輸出，不手動維護。

原始大型素材、`.env.local`、`node_modules` 和密碼都不應加入 GitHub 儲存庫。

## 發布與協作

正式原始碼：<https://github.com/zxcv5464/Kogakure>

網站：<https://zxcv5464.github.io/Kogakure/>

推送 `main` 後，GitHub Actions 會建置並發布靜態網站。後台改動資料時直接寫入 Supabase，通常不需要重新推送程式。多人協作**先 fetch、核對遠端差異、建立分支／PR、通過驗證再合併**，不要強制推送覆蓋店長更新。

- `docs/GITHUB_PUBLISH.md`：GitHub Pages、Actions 與 Git 協作。
- `docs/ROADMAP.md`：目前實作與待驗收進度。
- `docs/HANDOFF.md`：共同維護規範。
- `docs/SECURITY_REVIEW_20261117.md`：本次安全盤查、風險與待辦。
