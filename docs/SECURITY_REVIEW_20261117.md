# 狐隱 KOGAKURE｜2026-11-17 安全與維護盤查

範圍：GitHub `main` 提交 `65b8559` 的原始碼、Actions、套件鎖定檔、前端及 Supabase SQL／Edge Function。**僅靜態檢查與本機指令，不曾操作正式資料庫、帳號或部署。** 這不是滲透測試，也不能替代 Supabase 上線環境的實測。

## 已檢查與目前正面結果

- `npm audit --audit-level=moderate`、`npm audit --omit=dev --audit-level=moderate`：本次執行結果均為 **0 項已知依賴漏洞**（結果會隨公告變動，請持續重跑）。
- `.github/workflows/deploy.yml`：網站只以 `VITE_SUPABASE_URL` 與 `sb_publishable_*` 公開金鑰建置，並明確拒絕 secret/service-role 作為 Vite 公開金鑰；部署 job 權限限於內容讀取及 Pages 發布需要的項目。
- `.github/workflows/verify.yml`：PR 使用離線預覽進行回歸 QA，不依賴正式 Supabase 密鑰；本次新增 `npm audit --audit-level=high` 安全檢查。另以 `.github/dependabot.yml` 每週對 npm／GitHub Actions 提出更新 PR，仍需人工審核合併。
- 後台員工帳號操作使用帶 JWT 的 Edge Function `manage-employee-accounts`；函式程式碼核對登入者、`accounts.manage`、帳號啟用狀態與委派限制；高權限 Supabase 金鑰在服務端取得。
- SQL 使用 RLS、受控 RPC／`private` schema 隔離公開寫入與私有訂單／預約／帳務明細。**需在正式 Supabase 實測確認 migration 全部已套用。**

## 風險與優先順序

| 優先 | 項目 | 目前觀察 | 建議 |
| --- | --- | --- | --- |
| P1 | 匿名表單濫用 | 公開點單與預約 RPC 可由未登入訪客呼叫；現有冷卻依姓名＋伺服器，可換名字繞過 | 正式開放前加入可信來源的限流／防機器人策略，測試不阻礙正常訪客 |
| P1 | 訪客字串長度無上限 | `20261117_01_tc_world_dropdown_unlimited_guest_name.sql` 移除 2–48 字限制，後端僅驗證非空與控制字元 | 店長決定可接受的請求大小／位元組上限，另行審核相容 SQL；勿直接回改已執行的歷史 migration |
| P1 | 實際 RLS 未能由靜態檢查證明 | 程式碼有保護規則，但不等於正式資料庫即時狀態一致 | 盤點 migration／函式部署版本，使用匿名、一般員工、授權員工及管理員實測 |
| P2 | 永久刪除與歷史資料 | 訂單、預約、帳號可能永久刪除；薪資與帳務需保留可追查紀錄 | 設定備份、可回復測試、刪除權限及保存期間 |
| P2 | 部分照片清理與多人編輯 | 舊 Storage 物件可能殘留；名帖多人編輯有覆寫風險 | 建立安全清理程序，補資料版本衝突機制 |
| P2 | 外部 BGM | 可使用上傳音檔、HTTPS 來源與 YouTube，涉及來源授權、第三方請求 | 只使用有權公開播放的素材並記錄授權／來源 |

## 發布前逐項確認

- [ ] GitHub Actions 變數僅有 Publishable Key，公開建置檔案中不存在 `sb_secret_*`、`service_role` 或其他伺服器憑證。
- [ ] Edge Function 的部署環境保持 JWT 驗證及服務端密鑰設定；匿名、失效 JWT 和越權員工全部拒絕。
- [ ] 公開角色資料與私有訂單、預約、帳務隔離；RLS 檢查不只靠前端隱藏功能入口。
- [ ] 匿名表單有不依賴訪客自填姓名的防濫用機制，且有監控、異常處理與成本警示。
- [ ] 最新 SQL 對所有既有 RPC／函式的權限與防重複邏輯沒有回退。
- [ ] 後台模組權限符合最小授權；停用員工後無法操作；`accounts.manage` 不能提升自身權限。
- [ ] 備份、故障復原、測試資料清理與音樂／照片授權由店長確認。

## 變更界線

本次為避免覆蓋店長最新資料，**不執行任何正式 Supabase migration、不變更密鑰、不寫入正式訂單，也不代替店長 push**。P1 風險涉及公共表單規則及雲端防護，需要先確認營運接受的限制，再由授權人員部署與驗收。文件修正可以先獨立 PR 上線。
