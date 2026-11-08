# 狐隱 KOGAKURE｜本機開發專案

> 世有百鬼，夜有萬境。循狐而入，借湯忘憂。

本專案採 **DevSpace 本機開發 + 店長 Supabase 資料庫 + 店長 GitHub Pages 公開網站** 的流程。前台與管理後台使用 React + TypeScript + Vite。Supabase 已完成基本連線與管理後台登入測試，後續所有新功能仍須本機驗證後再發布。

## 本機啟動

在 `D:\kogakure` 開啟 PowerShell 或 Git Bash：

```bash
npm install
npm run dev
```

- 首頁：`http://localhost:5173/#/`
- 人員介紹：`http://localhost:5173/#/staff`
- 管理後台：`http://localhost:5173/#/admin`（必須先連線 Supabase 才能登入）
- 強制預覽開場動畫：`http://localhost:5173/?intro=1#/`
- 檢查編譯：`npm run build`

首次安裝或更換原始素材後，執行 `npm run assets:build` 更新網站用 WebP。這個指令會**重建** `public/images`，其中不可放手工新增的原圖。

## 資料夾用途

| 路徑 | 用途 | 是否保留於最終靜態網站 |
|---|---|---|
| `src/` | 前台、員工名片、管理後台原始碼 | 否（編譯成 JS/CSS） |
| `public/images/brand/` | 網站實際使用的 Logo 與開場圖 | 是 |
| `public/images/staff/` | 網站實際使用的員工照及縮圖 | 是 |
| `public/images/scenes/` | 目前頁面使用的場景照 | 是 |
| `狐隱LOGO/` | 原始 Logo（不可覆寫） | 否 |
| `員工圖/` | 原始角色照片（包含暫未使用的備用照） | 否 |
| `場景照/` | 14 張原始室內照（未使用者日後再產生 WebP） | 否 |
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
5. 先執行 `npm run db:check` 驗證資料庫與匿名讀取權限；再啟動 `npm run dev`，登入 `http://localhost:5173/#/admin` 新增與編輯員工。
6. 前台 `/#/staff` 將改成由 Supabase 讀取已公開員工；未設定 Supabase 時只會顯示兩筆示範資料。

**安全：** `VITE_*` 只能放允許公開的金鑰，切勿放 Supabase `service_role`、密碼等敏感資訊。資料修改權限由資料庫 RLS 控制，不依賴前端是否隱藏按鈕。

## 開發原則

- 手機版底部五格導覽；電腦版頂部完整導覽。
- 暗色主題保持高對比，手機基礎字體 17px，桌面 18px，寬螢幕更大。
- 人員介紹是純展示頁，不附帶預約；每位員工可由後台設定照片、稱號、社群連結與特效。
- 使用 WebP 多尺寸縮圖，原始 PNG/JPG 不修改；`public/images` 只放**現在用得到**的檔案。
- 降低動畫與圖片流量，尊重 `prefers-reduced-motion`。
- 其他六個頁面持續開發；尚未實作的功能不應讓訪客誤認已可使用。

## GitHub 公開網站與協作

店長儲存庫：`https://github.com/zxcv5464/Kogakure`；預計公開網址：`https://zxcv5464.github.io/Kogakure/`。程式推送至 `main` 後，GitHub Actions 會編譯並部署。需先由儲存庫管理者在 **Settings → Pages** 啟用 **GitHub Actions**，並將 Supabase URL 及 Publishable Key 設為 Actions repository variables。**完整操作請見 `docs/GITHUB_PUBLISH.md`。**

網站程式更新需重新推送；管理員從後台修改員工資訊直接寫入 Supabase，通常不必推送 GitHub。原始素材、`.env.local`、資料庫密碼和 `node_modules` 都不加入儲存庫，也不再以壓縮檔為主要交接方式。

詳細開發階段請查看 `docs/ROADMAP.md`。
