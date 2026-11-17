# 狐隱 KOGAKURE｜網站發布架構與變更必要性

本文僅記錄發布設計、修改原因與未完成事項，不提供 Git、GitHub Actions 或網站部署操作步驟。

## 現有架構

- 網站使用 Vite 建置、GitHub Actions 驗證，現由 GitHub Pages 發布公開靜態檔案。
- `.github/workflows/verify.yml` 負責 PR 的回歸與安全稽核；`.github/workflows/deploy.yml` 負責 `main` 的建置與發布。
- `.github/dependabot.yml` 已減少大量一般依賴升級 PR；高風險漏洞仍需追蹤與人工相容性審核。
- `scripts/prepare-pages.mjs` 為 BrowserRouter 的公開頁面與後台網址產生靜態入口，降低直接開啟頁面時的 404 風險。
- 網站建置與 Supabase migration、Storage/RLS、Edge Function 版本為不同生命週期，前端更新不會自動改變正式資料庫。

## 為什麼需要調整儲存庫可見性

店長希望**訪客可以看到網站，但不能瀏覽完整原始碼、提交歷史及內部維護文件**。目前公開 GitHub 儲存庫不符合此目標。

- GitHub Free 的私人儲存庫不能繼續使用其既有公開 GitHub Pages；直接改成 Private 可能使網站停止發布。
- 可行方向包括支援私人 Pages 儲存庫的 GitHub 付費方案，或由支援私人 GitHub 儲存庫的其他靜態網站平台發布公開站點。
- 目前僅列為**待評估架構變更**；尚未搬遷網站、修改網域、改 GitHub 可見性或撤銷既有部署。
- 原始碼私人不代表前端程式不可被下載；API 授權、RLS 與伺服器秘密仍是獨立的必要保護。

## 變更影響與待確認

- Hosting 變更可能影響 Vite `base` 路徑、直接網址載入、網站網址、快取和 Auth 重導向設定。
- Supabase Publishable Key 可以存在前端，但 service-role、`sb_secret_*`、資料庫密碼及員工密碼不得進入公開建置。
- 必須區分「PR 已合併」「網站已發布」「SQL / Edge Function 已更新」三種不同狀態。
- 多人協作的主要風險是舊工作區覆寫他人變更；現行工作流程保留分支隔離與合併驗證的設計。

其他影響詳見 `docs/ROADMAP.md`、`docs/HANDOFF.md` 與 `docs/SECURITY_REVIEW_20261117.md`。
