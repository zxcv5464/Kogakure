# 狐隱 KOGAKURE｜網站維護交接與共同編輯規範

> 本文件是持續維護的入口；每次工作都應重新讀取 GitHub 最新 `main`，不要以此文件內的日期、截圖或過去對話作為「最新版本」的證明。

## 正式來源與架構
- **正式網站**：https://zxcv5464.github.io/Kogakure/
- **正式儲存庫**：https://github.com/zxcv5464/Kogakure
- **預設分支**：`main`
- **技術**：React、TypeScript、Vite、GitHub Pages / GitHub Actions。
- **公開資料與後台**：Supabase（Auth / PostgreSQL RLS / Storage）。網頁代碼部署和資料庫內容更新是兩種不同操作。
- **發佈工作流程**：`.github/workflows/deploy.yml`。推送至 `main` 後由 Actions 建置及發佈。
- **主要檔案**：`src/App.tsx`（路由）、`src/pages/StaffPage.tsx`（名冊）、`src/pages/admin/`（後台）、`src/lib/staff.ts`（資料存取）、`supabase/migrations/`（資料庫結構）。

## 每次更新的標準流程
1. 先讀取遠端 `main` 的最新 SHA、最近提交及未合併 PR，確認其他夥伴的變動；**不要從以前下載的網站 HTML 或舊資料夾直接覆寫**。
2. 針對單一功能／修正建立新分支；修改前先讀相關原始碼與 `docs/ROADMAP.md`、`docs/STAFF_ADMIN_AUDIT.md`。
3. 依需要執行 `npm ci`、`npm run check`、`npm run build`，並驗證相關 QA 腳本；瀏覽器腳本中部分 Chrome 路徑是 Windows 專用，換系統需要調整。
4. 驗證手機與桌面畫面：首次載入、直接網址開啟／重新整理、頁面動畫、名帖、後台操作與空白／錯誤狀態。
5. 優先提出 PR 供檢視：寫清楚**修改項目、影響路徑、測試證據、是否改動 Supabase、可能回歸風險**；核准後再合併至 `main`。
6. 合併後確認 GitHub Actions 成功，且正式網站的畫面與 API 行為符合預期；若出現問題，可根據提交紀錄回復。
7. 完成一項功能後更新 `docs/ROADMAP.md` 及必要的技術文件。

## 安全與資料相容性
- 不將 `.env.local`、管理員密碼、Supabase service_role 或 secret key 提交到公開儲存庫。
- 前端只使用允許公開的 Supabase URL 與 publishable key；實際寫入權限依賴 RLS。
- **不可直接在正式 Supabase 新增／刪除／修改資料、改 migration、清理 Storage，除非該項操作有明確授權及備份／回復計畫。**
- 員工名帖讀取、管理、照片上傳與舊資料相容性都需納入測試。沒有設定資料庫時的示範資料不能代替正式環境驗收。
- 不覆蓋其他夥伴在同一檔案的更新；若 `main` 前進，先確認差異並處理衝突。

## 已知待辦與風險（以當次實際檢查為準）
- **多人編輯**：現有員工管理尚未加入版本衝突偵測；最後儲存者可能覆蓋先前修改。
- **瀏覽器歷史紀錄**：後台未儲存內容的上一頁／下一頁保護仍需跨瀏覽器驗證。
- **照片 Storage**：名帖替換或刪除後的舊檔尚無安全孤兒檔案清理流程。
- **正式資料庫驗收**：管理員登入、RLS、CRUD、上傳、公開狀態仍需有權限者實測。
- **測試覆蓋**：目前 GitHub Pages 發佈工作流程包含建置，但尚未將完整瀏覽器 QA 納入跨平台 CI；部分本機 QA 依賴 Windows Chrome 路徑。
- **前台功能**：公告、館內、服務、排班、菜單與預約仍依 `docs/ROADMAP.md` 分階段建置，不應將規劃頁誤示為正式可用。
- **視覺回歸**：人員名帖的邊框／頂端裝飾、首次開啟時短暫閃爍、載入與進場動畫，任何修改都應檢查桌面／手機與首次載入／重整兩種情境。

## 每次更新的交付紀錄建議
- 日期與 `main` 基準 SHA：
- 分支／PR：
- 修改內容與檔案：
- 編譯／QA／手動驗收：
- Supabase 資料／Schema 是否受影響：
- 正式部署結果或尚未部署的原因：

## 對照文件
- `README.md`：專案啟動與架構
- `docs/ROADMAP.md`：功能規劃與進度
- `docs/STAFF_ADMIN_AUDIT.md`：後台已知限制及驗收流程
- `docs/SUPABASE_SETUP.md`：資料庫設定
- `docs/GITHUB_PUBLISH.md`：網站部署設定
