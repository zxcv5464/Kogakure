# 狐隱 KOGAKURE｜員工登入帳號與權限管理

## 使用方式
- 正式管理者使用原有 Supabase 帳號登入 `/admin`，左側進入 **「員工帳號」**（`/admin/accounts`）。
- 填寫員工顯示名稱與 **本人可收信的 Email**，勾選需要的後台功能，按「建立並寄送邀請」。
- 員工打開 Email 的 Supabase 邀請連結，進入 `/admin/` 完成身分驗證，在「帳號安全」設定個人密碼，後續使用自己的 Email 與密碼登入。
- 管理者可以在同一頁修改員工權限及停用／恢復。停用不會刪除員工名帖、茶宴菜單或預約歷史。

## 可設定權限
| 權限 | 管理員工 | 員工權限 |
| --- | --- | --- |
| 員工名帖 | 全部功能 | `staff.manage`：管理名帖、照片、順序和公開 |
| 茶宴菜單 | 全部功能 | `menu.manage`：管理分類、品項和價格 |
| 預約管理 | 全部功能 | `booking.manage`：查看私密預約、接取與婉拒、方案、計時及歷史紀錄 |
| 員工帳號／權限 | 僅原正式管理者 | **不可授予員工** |
| 公告／營業／排班等尚未實作模組 | 尚未開放 | 不會顯示虛假的權限 |

員工獲授權的是每個模組的完整管理權限，而非細分的唯讀權限。請只開放工作真正需要的模組。所有權限判斷在 PostgreSQL RLS 和受控 RPC 內進行，不能單靠隱藏前端選單。

## 安全
- 原有 `admin_users` **完全不變**。員工獨立存放於新資料表 `public.employee_accounts`，僅本人和正式管理者可查閱。
- 只有管理者可呼叫 `manage-employee-accounts` Edge Function 發送員工邀請或修改授權；使用 Supabase Auth 檢驗 JWT，並再次查詢管理者身分。瀏覽器不含 `service_role` 或 secret key。
- 只有受信任的 Edge Function 使用服務端角色金鑰更新員工授權；員工即使直接呼叫 Supabase REST API，也沒有寫入授權資料的 RLS policy/table GRANT。
- 停用後所有 module RLS 會立即拒絕該帳號讀寫；但其 Auth session 可能仍存在，建議員工重新登入或重新整理頁面查看最新授權。
- 獲得預約權限者會接觸遊戲角色姓名、伺服器、備註等預約個資，應只授權需要處理訂單的員工。
- 員工不會自動變更 GitHub、Supabase 專案的管理權限，也不會被加入 `admin_users`。

## 佈署及啟用
1. 依序套用三份 migration：`20261115_01_employee_accounts_permissions.sql`、`20261115_02_employee_permission_invoker.sql`、`20261115_03_booking_operator_staff_read.sql`（均位於 `supabase/migrations/`）。第二份令員工權限驗證函式以登入者身分和 RLS 執行；第三份讓有預約權限的館員可**唯讀**尚未公開的人員資料，以確保接單時能阻止指名被關閉的人員，但不能編輯名帖。
2. 部署 Edge Function：`supabase/functions/manage-employee-accounts/index.ts`，**verify_jwt=true**。依賴 Supabase 平台內建 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 服務端環境變數。
3. 在 **Supabase Dashboard → Authentication → URL Configuration** 中確認允許 `https://zxcv5464.github.io/Kogakure/admin/` 作為 Auth Redirect URL；邀請信會使用此網址。
4. 確認 Auth 已開啟 Email，且有寄送邀請信的郵件配額／SMTP 設定。
5. GitHub Pages 發布新版前端，登入原管理員並驗收建立邀請、員工接受邀請、設定密碼、權限登入、停用即時撤銷。
6. 沒有提供真實員工 Email 前，不主動寄出測試邀請，也不自動建立真實員工帳號。

## 限制
- 首版採**電子郵件邀請**，不是管理者直接設定員工密碼；不在管理後台儲存、展示任何員工密碼。
- **尚不提供**細粒度同一模組中的唯讀／編輯分開授權、員工權限交付給其他管理者或複雜的多層級審批。
- 若收到「已註冊 Email」錯誤，須由管理者先協調該信箱已存在的 Supabase 身分，不會直接接管其他使用者帳號。
