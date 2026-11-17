# 狐隱 KOGAKURE｜茶宴菜單與 Supabase 上線手冊

## 目前進度（原始菜單功能建於 2026-11-13；2026-11-17 校訂）

- 前台 `/menu`：深墨金色「狐之茶宴 · 御品目錄」，茶飲／和菓／御膳三分類，共 11 道品項。
- 可在畫面增減數量、計算 Gil 合計，並填寫角色姓名與繁中服世界後**送出真實茶宴訂單**至 Supabase；訂單可在 `/admin/orders` 接單、完成、取消。**不提供線上付款**，也不會因點單自動建立預約。完整規則見 `docs/TEA_ORDER_SETUP.md`。
- 後台 `/admin/menu`：正式管理員或獲 `menu.manage` 的員工可編輯分類、品項、價格、排序與供應狀態；`/admin/orders` 由獨立的 `orders.manage` 管理，兩種權限互不包含。
- 前台只讀已發布分類與品項；未供應仍顯示「暫停供應」且不可加入點單。
- 前端含只讀範例資料：當資料庫未配置或查詢失敗時顯示「展示菜單」，**不是正式資料庫成功同步的證明**；管理後台不使用範例假儲存。

## 啟用資料庫（正式專案管理員執行）

**重要：在任何正式資料庫變更前確認 Supabase 專案、儲存當前 schema 及相關表格備份**。本專案已有 `20261108_01_staff.sql` 的 `public.is_site_admin()` 和 `public.set_updated_at()`，新 migration 依賴這兩個函式。

1. 開啟 Supabase Dashboard，確認是現有狐隱網站使用的同一專案。
2. 到 **SQL Editor**，檢查 `public.admin_users`、`public.is_site_admin()`、`public.set_updated_at()` 已存在。
3. 備份目前 schema 與相關資料；檢查 `public.menu_categories` 及 `public.menu_items` 是否早已由其他人建立。如已有不同結構，**停止並先人工比對**，勿直接執行新 migration。
4. 僅在**尚未建立菜單資料表**的新環境，依序套用 `supabase/migrations/20261113_01_menu.sql` 及後續相關 migration；既有正式環境應先核對已套用紀錄，不要重跑舊版 SQL 覆蓋新的權限或函式。詳見 `docs/SUPABASE_SETUP.md`。
5. 到 Table Editor 驗證 `menu_categories` 共 3 筆、`menu_items` 共 11 筆；兩表 RLS 已開啟。
6. 用正式管理員登入 `/admin/menu`，修改測試品項描述、價格或公開狀態，儲存後重新載入 `/menu`，確認最新資料。
7. 使用無痕／未登入的瀏覽器確認未公開的分類／品項不可讀，訪客不能寫入或刪除。

**SQL 安全設計**：建表使用 `if not exists`；正式預設菜單使用固定 ID 加 `on conflict (id) do nothing`，重新執行不會重設已存在 ID 的內容。注意已有不同 ID 的同名分類／菜單可能產生重複，請先檢查現有資料。

## 前端部署

- GitHub Actions 建置需設定 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`（只可使用**公開 publishable key**）；請勿將 Secret Key 或 service_role 放進 GitHub 程式碼、公開變數或對話。
- 正式部署後，前台會向 `menu_categories`、`menu_items` 查詢發布內容，送單另走受控 RPC；後台須有正式管理員身分或對應的 `menu.manage` 權限才可編輯。
- 若出現「展示菜單」警示，代表當下沒有讀取到正式菜單（包括環境變數未設、migration 尚未套用或連線失敗），應依瀏覽器錯誤、Network 或 Supabase logs 查核。
- 管理頁若顯示找不到 relation 或權限錯誤，優先核對 schema、RLS、publishable key 及正確的 Supabase 專案。
- `updated_at` 比對可避免舊編輯覆蓋其他管理員更新；遇到「未寫入」時先重新整理資料再編輯。

## 測試與故障排除

```bash
npm ci
npm run build
VITE_OFFLINE_PREVIEW=true node scripts/qa-menu.mjs
```

以上驗證前端編譯、3 分類 11 項、Gil 定價及只讀展示；**不等同於正式資料庫寫入與 RLS 實測**。完成 Supabase migration 後，需依前述管理員及無痕操作流程進行上線驗收。

## 以後調整菜單

菜單分類：章節標示、名稱、卷名、說明、排序、公開狀態。

菜單品項：所屬分類、品名、描述、Gil 價格、排序、公開／是否供應。

所有更新由 `/admin/menu` 儲存到 Supabase；前台重開或重新整理後顯示最新發布內容。若有分類仍包含品項，資料庫會禁止刪除該分類，避免孤兒資料。
