# 狐隱｜Supabase 正式資料庫與本機管理後台設定

目前開發方式：`D:\kogakure` 本機 Vite + 雲端 Supabase。**不需要把網站部署到 GitHub**，也不需要下載 PostgreSQL 伺服器。

## A. 建立雲端資料庫（只做一次）

1. 登入 https://supabase.com/dashboard 。
2. 選擇 New project（建立新專案）；專案名稱可用 `kogakure`。
3. 選擇你預計使用的組織、方案和較近的地區；設定**資料庫密碼**並自行安全保管（不要貼進對話或 `.env.local`）。
4. 等待 Supabase 顯示專案正常可用。
5. 左側選 **SQL Editor → New query**。
6. 開啟本專案 `supabase/migrations/20261108_01_staff.sql`，把**完整 SQL 內容**貼到 SQL Editor 並按 Run。
7. SQL 執行成功後，到 Table Editor 應能看到 `public.staff` 和 `public.admin_users`；Storage 應能看到 `staff-media` bucket。

這一輪先建立**員工資料、管理員權限、員工圖片**三項。排班、菜單與預約的表會在規則確認後分階段新增，不會現在一次建一堆空表。

## B. 建立第一個後台管理員（只做一次）

1. 打開 **Authentication → Users**。
2. 使用 Dashboard 的 **Add user** 建立一個 Email + 密碼的使用者；完成後請確認使用者可以登入（必要時完成 Email 驗證）。
3. 在 Users 清單中點選剛建立的使用者，複製其 **User UID（UUID）**。
4. 到 **SQL Editor → New query**，執行：

```sql
insert into public.admin_users (user_id)
values ('貼上你剛剛複製的 User UID')
on conflict (user_id) do nothing;
```

5. 可再執行下面的查詢驗證（應有一筆 User UID，**不包含密碼**）：

```sql
select user_id, created_at from public.admin_users;
```

只有被加入 `admin_users` 的登入者才具有管理權限。一般訪客只能讀取 `is_published = true` 的員工名帖。

**建議：** Authentication → Settings / General configuration 將 **Allow new users to sign up** 關閉；此網站管理員由 Dashboard 手動建立，訪客不需要註冊。

## C. 將本機網站連到資料庫

1. 在 Supabase 專案頂部找到 **Connect**，取得 **Project URL** 和 **Publishable Key**（格式約為 `sb_publishable_...`）。也可以到 **Settings → API Keys**。
2. 在 `D:\kogakure` 將 `.env.example` 複製成 `.env.local`，只填兩個值：

```dotenv
VITE_SUPABASE_URL=https://你的專案ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_你的公開金鑰
```

3. 在專案資料夾啟動終端機，執行：

```bash
npm run db:check
npm run dev
```

4. 進入本機管理後台 `http://localhost:5173/admin`（如果 Vite 顯示其他埠號，就依終端機顯示的網址）。
5. 用 B 步驟建立的 Email 和密碼登入。

**安全注意：** **絕不使用 Secret Key（sb_secret_...）或舊 service_role Key**。網站的 Vite 變數會被放進瀏覽器程式裡，只有 Publishable Key 適合使用。管理員密碼只在登入頁填寫，絕不寫入設定檔或交給他人。

本專案的 `.gitignore` 已排除 `.env.local`。請不要將內容截圖公開，也不要把它放入未來交付包。

## D. 後台第一輪實際測試

1. 在 `/admin` 按 **新增**。
2. 填入姓名、職稱、短句、完整介紹。
3. 設定個人主題色、狐火／落櫻等特效、服務分類。
4. 上傳一張員工圖片。系統會轉成兩種高品質 WebP 並存至 Supabase `staff-media`。
5. 選擇 **對訪客公開名帖**，再按 **儲存名帖**。
6. 用**無痕視窗**打開 `http://localhost:5173/staff`，確認公開名帖。
7. 回到後台，取消公開並儲存；在無痕視窗重新整理，確認該名帖已隱藏。
8. 測試社群連結、照片替換、角色姓名修改後是否同步。
9. 退出管理後台，再檢查一般訪客不能存取草稿或修改資料。

若看到空白人員名錄是正常的：**新的正式資料庫預設沒有員工**，既有的兩位示範人物尚未匯入 Supabase。

## E. 常見狀況

| 狀況 | 最常見原因／處理 |
|---|---|
| 後台仍顯示預覽模式 | `.env.local` 不存在、值為空、Vite 未重啟 |
| `npm run db:check` 回傳找不到 `staff` | SQL migration 尚未成功執行 |
| 登入後提示沒有管理權限 | 尚未將 Auth UID 加入 `public.admin_users` |
| Email 無法登入 | 帳密不符、未完成 Email 驗證或 Auth 使用者未建立 |
| 圖片上傳權限錯誤 | `staff-media` 未建立，或 Storage RLS 沒有設成功 |
| 前台看不到員工 | 沒勾選公開、沒按儲存，或沒有建立任何資料 |
| 新圖沒立刻更新 | 前台需重新整理；圖片版本會使用不同路徑避免舊快取 |
| 手機在同 Wi-Fi 直接開 `localhost` 無法連 | `localhost` 指手機自己；目前只允許本機監聽，如需真機測試另設定區網測試方式 |

## F. 後續工作界線

- SQL Editor 建表與帳號建立是**雲端專案操作**，在你建立並提供授權連線方式前，不會自動執行。
- 我會在 DevSpace 內負責本機前後台程式、SQL migration、圖片與串接錯誤的修正。
- 等人員介紹整個流程穩定，繼續擴充館內介紹、營業公告、排班、點菜與預約的資料表和管理後台。
- 專案告一段落才製作最終交付壓縮檔；不用設定 GitHub Pages 自動部署。
