# 狐隱 KOGAKURE｜本機開發專案

> 世有百鬼，夜有萬境。循狐而入，借湯忘憂。

本專案採 **DevSpace 本機開發 + 店長 Supabase 資料庫 + 店長 GitHub Pages 公開網站** 的流程。前台與管理後台使用 React + TypeScript + Vite。Supabase 已完成基本連線與管理後台登入測試，後續所有新功能仍須本機驗證後再發布。

## 本機啟動

在 `D:\kogakure` 開啟 PowerShell 或 Git Bash：

```bash
npm install
npm run dev
```

- 首頁：`http://localhost:5173/`
- 人員介紹：`http://localhost:5173/staff`
- 管理後台：`http://localhost:5173/admin`（登入後先顯示管理總覽）
- 員工名帖管理模組：`http://localhost:5173/admin/staff`（獨立功能頁，仍須管理員登入）
- 強制預覽開場動畫：`http://localhost:5173/?intro=1`
- 檢查編譯：`npm run build`

首次安裝或更換原始素材後，執行 `npm run assets:build` 更新網站用 WebP。這個指令會**重建** `public/images`，其中不可放手工新增的原圖。

## 資料夾用途

| 路徑 | 用途 | 是否保留於最終靜態網站 |
|---|---|---|
| `src/` | 前台、員工名片、管理後台原始碼 | 否（編譯成 JS/CSS） |
| `public/images/brand/` | 網站實際使用的 Logo 與開場圖 | 是 |
| `public/images/staff/` | 網站實際使用的員工照及縮圖 | 是 |
| `public/images/scenes/` | 7 張經過壓縮的場景背景照，切頁時按順序輪替 | 是 |
| `狐隱LOGO/` | 原始 Logo（不可覆寫） | 否 |
| `員工圖/` | 原始角色照片（包含暫未使用的備用照） | 否 |
| `場景照/` | 14 張原始室內照（目前取 7 張生成背景 WebP，原圖不變） | 否 |
| `scripts/` | 圖片最佳化及本機 QA 工具 | 否 |
| `supabase/migrations/` | 資料表、RLS 與 Storage 權限設定 | 資料庫使用，非網頁靜態檔 |
| `docs/ROADMAP.md` | 開發與驗收待辦 | 否 |
| `dist/` | `npm run build` 產生的靜態網站成品 | 是（未來交付用） |
| `node_modules/` | 安裝的開發套件 | 否 |

正式網站與後台均需要使用同一個 Supabase 專案。原始素材留在本機，不上傳至前台公開檔案。

## Supabase 資料庫＋本機測試

已連接店長 Supabase 專案，基本表單、資料庫連線、匿名讀取政策及管理員登入測試完成。新功能仍需逐項驗收。**資料庫設定與測試請見 `docs/SUPABASE_SETUP.md`。**

1. 建立 Supabase 專案。
2. 在 Supabase SQL Editor 執行 `supabase/migrations/20261108_01_staff.sql`。
3. Authentication → Users 建立管理員使用者，並在 SQL Editor 加入權限：
   ```sql
   insert into public.admin_users(user_id) values ('YOUR_AUTH_USER_UUID');
   ```
4. 複製 `.env.example` 成 `.env.local`，只填入 **Project URL**、**Publishable Key**。
5. 先執行 `npm run db:check` 驗證資料庫與匿名讀取權限；再啟動 `npm run dev`，登入 `http://localhost:5173/admin` 新增與編輯員工。
6. 前台 `/staff` 由 Supabase 讀取已公開員工；未設定 Supabase 時才使用示範資料。

**安全：** `VITE_*` 只能放允許公開的金鑰，切勿放 Supabase `service_role`、密碼等敏感資訊。資料修改權限由資料庫 RLS 控制，不依賴前端是否隱藏按鈕。

## 開發原則

- 首頁以同一張場景背景串起 Logo、標語、入口按鈕與籌備提示，不再另加割裂的底部橫條；桌面版在一般視窗高度盡量完整顯示，手機保留必要捲動。
- 手機版底部五格導覽；電腦版頂部完整導覽。
- 暗色主題保持高對比，手機基礎字體 17px，桌面 18px，寬螢幕更大。頁面外層捲軸不顯示，但仍保留滑鼠、鍵盤和觸控捲動，以免手機內容被裁切。
- 前台「狐姬名冊」是純展示頁，不附帶預約；每位員工可由後台設定照片、稱號、社群連結與特效。名帖頁採單一連貫背景與置中展廊、精簡標題和適度縮小的卡片；載入階段顯示有柔和光影的御守佔位動畫，滑鼠指向或觸碰人員連結時按需預先載入程式與公開資料，訪客在五分鐘內來回切頁可重用同一份結果，減少 Supabase Egress；後台編輯完成會清除本機快取。長篇介紹採隱藏捲軸的柔和閱讀區，桌面固定照片、手機整張卡可滑動，保留「繼續閱讀」提示。
- 使用 WebP 多尺寸縮圖，原始 PNG/JPG 不修改；`public/images` 只放**現在用得到**的檔案。
- 首次進站的 Logo 開場動畫約 3 秒（比原版延長約 1 秒）；頁面切換以約 1.4 秒的深色背景淡出、換頁、淡入。動畫不下載影片或增加大型套件，尊重 `prefers-reduced-motion`，需要再次預覽可用 `?intro=1`。
- 前台背景使用 7 張館內照片；切換頁面時按順序輪替，以約 1.45 秒的交疊淡入淡出搭配原有的暗色換頁動畫，僅按需載入下一張照片。
- `/admin` 使用獨立的精簡管理版型與共用登入驗證：管理總覽列出可用功能及規劃中的模組；`/admin/staff` 才載入獨立員工名帖編輯器。員工模組提供搜尋、公開狀態篩選、分段編輯、儲存狀態、未儲存離開提醒，以及先在本機預覽照片、按儲存才上傳的流程，避免意外消耗 Storage。清單的「排序」可直接拖曳或按上下箭頭，無須手填排序數字。前台狐姬未滿 6 位不顯示搜尋工具，6 位以上才提供預設收合的簡潔搜尋／服務篩選。相關 BUG 盤查、已知限制及驗收流程見 `docs/STAFF_ADMIN_AUDIT.md`。後續公告、營業資訊、菜單、預約、排班各自新增模組，不會與員工編輯功能共用一大份頁面。前後台不共用背景、導覽、頁尾及動畫；只有左上 Logo 可返回前台，不在前台展示後台入口。權限仍由 Supabase Auth 與 RLS 控制。
- 其他六個頁面持續開發；尚未實作的功能不應讓訪客誤認已可使用。

## GitHub 公開網站與協作

店長儲存庫：`https://github.com/zxcv5464/Kogakure`；預計公開網址：`https://zxcv5464.github.io/Kogakure/`。程式推送至 `main` 後，GitHub Actions 會編譯並部署。需先由儲存庫管理者在 **Settings → Pages** 啟用 **GitHub Actions**，並將 Supabase URL 及 Publishable Key 設為 Actions repository variables。**完整操作請見 `docs/GITHUB_PUBLISH.md`。**

網址已改為不帶 `#` 的乾淨路徑，例如 `/Kogakure/staff`、`/Kogakure/admin`；正式建置會產生每個頁面的靜態入口，直接開啟、重新整理不會 404，舊的 `/#/staff` 書籤可自動轉換。網站程式更新需重新推送；管理員從後台修改員工資訊直接寫入 Supabase，通常不必推送 GitHub。原始素材、`.env.local`、資料庫密碼和 `node_modules` 都不加入儲存庫，也不再以壓縮檔為主要交接方式。

詳細開發階段請查看 `docs/ROADMAP.md`。
