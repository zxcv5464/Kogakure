# 狐隱 KOGAKURE｜網站發布架構與變更必要性

本文僅記錄發布設計、修改原因與未完成事項，不提供 Git、GitHub Actions 或網站部署操作步驟。

## 現有架構

- 網站使用 Vite 建置、GitHub Actions 驗證，現由 GitHub Pages 發布公開靜態檔案。
- `.github/workflows/verify.yml` 負責 PR 的回歸與安全稽核；`.github/workflows/deploy.yml` 負責 `main` 的建置與發布。
- `.github/dependabot.yml` 已減少大量一般依賴升級 PR；高風險漏洞仍需追蹤與人工相容性審核。
- `scripts/prepare-pages.mjs` 為 BrowserRouter 的公開頁面與後台網址產生靜態入口，降低直接開啟頁面時的 404 風險。
- 網站建置與 Supabase migration、Storage/RLS、Edge Function 版本為不同生命週期，前端更新不會自動改變正式資料庫。

## 程式碼存放與網站掛載的必要性

- GitHub 保留版本歷史、功能變更及必要的技術說明；GitHub Pages 提供公開網站的靜態檔案掛載。
- 儲存庫文件只記錄已實作的變更、原因、相容性與風險，不包含逐步部署或員工後台操作教學。
- 程式碼和文件不得夾帶密碼、存取權杖、雲端高權限金鑰、真實帳務明細或未經同意的個人資料。
- 前端程式碼與公開素材本來就可能被瀏覽器取得；任何私人資料保護必須由 Supabase RLS、受控 RPC 與服務端驗證完成。

## 維護影響與待確認

- 現有 Vite `base` 路徑、直接網址入口、網站快取及 Auth 來源必須維持與 GitHub Pages 相容。
- Supabase Publishable Key 可以存在前端，但 service-role、`sb_secret_*`、資料庫密碼及員工密碼不得進入公開建置。
- 必須區分「PR 已合併」「網站已發布」「SQL / Edge Function 已更新」三種不同狀態。
- 多人協作的主要風險是舊工作區覆寫他人變更；現行工作流程保留分支隔離與合併驗證的設計。

其他影響詳見 `docs/ROADMAP.md`、`docs/HANDOFF.md` 與 `docs/SECURITY_REVIEW_20261117.md`。
