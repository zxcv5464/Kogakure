# 狐隱｜Supabase 設定、遷移與安全驗收

對照 2026-11-17 GitHub 原始碼。**本說明不會自動變更正式 Supabase**；在操作 SQL Editor、帳號、Storage 或 Edge Function 前，先確認店長授權與可還原備份。

## 系統分工

- GitHub Pages：公開 React/Vite 網頁與後台介面，**不執行資料庫 migration**。
- Supabase PostgreSQL：公開資料、訂單／預約、帳務與權限（RLS、受控 RPC）。
- Supabase Auth：正式管理員與員工登入身分。
- Supabase Storage：員工、服務、BGM 等公開素材；寫入權限由 Storage RLS 檢查。
- Supabase Edge Function `manage-employee-accounts`：以**伺服器端**權限管理員工 Auth 使用者。

## 首次建立專案（只在空白環境使用）

1. 在 Supabase Dashboard 建立專案，保管資料庫密碼，關閉不需要的訪客自助註冊。
2. 由正式負責人確認 `supabase/migrations/` 中全部 SQL 的順序與相依。最初基準為 `20261108_01_staff.sql`，其後已增加多份菜單、訂單、預約、排班、服務、公告、BGM、帳務及權限 migration；**不能只套用第一份**。
3. 由有權限的操作人員逐份套用尚未執行的 migration，記錄檔名、時間、結果和回復方式。**不要因 SQL 使用 `IF NOT EXISTS` 就假定可以任意重跑**；後續函式與權限可能已被新版替換。
4. 在 Authentication → Users 建立第一位正式管理員，確認 UID 後，在 SQL Editor 執行：
   ```sql
   insert into public.admin_users (user_id)
   values ('YOUR_AUTH_USER_UUID')
   on conflict (user_id) do nothing;
   ```
5. 配置 Edge Function `manage-employee-accounts` 並啟用 JWT 驗證（`verify_jwt=true`）。Supabase URL 和 service-role/secret 權限只留在**函式服務端**，不得進入 Vite 或 GitHub 前端變數。
6. 依模組文件驗證 Storage buckets、公開 SELECT 限制、編輯者與匿名者的隔離，以及上傳後的實際公開效果。

若是**已在營運的專案**，跳過「首次建立」；先盤點目前 schema、函式定義、migrations 已套用紀錄，對比最新 GitHub 內容。尤其 2026-11-17 公開表單名稱檢查的 migration 會替換既有函式片段，含安全前置檢查，**不適合在未知版本上盲目執行**。

## 本機環境

建立 `.env.local`（Git 忽略此檔）：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

```bash
npm ci
npm run db:check
npm run dev
npm run check
npm run build
```

`VITE_*` 一定會公開到網頁。**只用 Publishable Key**，不得放 `sb_secret_*`、`service_role`、JWT signing secret、資料庫密碼、帳號密碼。管理員登錄密碼僅於正常登入流程輸入。

## 權限與功能驗收（正式環境須人工操作）

| 身分 | 必測情境 |
| --- | --- |
| 無痕／匿名 | 只能看到公開名帖、菜單、服務、公告與已公開排班；不得讀取他人訂單、預約明細、帳務及員工帳號 |
| 未授權登入員工 | 無法使用不屬於自己的後台模組，也不能直接呼叫敏感 RPC |
| 特定權限員工 | 僅能操作授權模組，停用或撤權後應立即被拒絕；`accounts.manage` 不得任意提升本人權限 |
| 正式管理員 | 已授權流程可正常新增／修改；敏感的永久刪除與薪資紀錄須確認正確性 |
| Storage | 匿名不可上傳或刪除；授權者只能操作其模組允許的 bucket |
| Edge Function | 缺少／無效 JWT、已停用員工、越權操作應被拒絕；service-role 不出現在前端回應 |

測試資料請事先規劃清理方式，**不要直接刪除正式營運訂單、預約或歷史帳務來測試**。

## 高風險維運事項

- 公開茶宴、預約使用匿名 RPC；同名同伺服器冷卻機制不等於可靠的網路速率限制。正式公開前評估 Edge/WAF 限流、CAPTCHA 等防垃圾機制。
- 最新 2026-11-17 migration 移除旅人姓名／世界的 2–48 字限制；只有非空白與控制字元檢查。若輸入超長內容，可能造成儲存與請求資源濫用。需要在不破壞使用需求下決定合理**位元組或請求大小上限**，再另行審核 migration。
- 服務角色權限、資料庫備份、員工 Auth 密碼、帳務與個資的保存期限，都應由店長控管。
- 資料庫回滾不是 `git revert`：改回前端版本不會自動倒轉 SQL 與已寫入資料。

相關：`docs/STAFF_ACCOUNTS.md`、`docs/SECURITY_REVIEW_20261117.md`、`docs/GITHUB_PUBLISH.md`。
