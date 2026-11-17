# 狐隱｜GitHub Pages 發布與多人協作

正式儲存庫：<https://github.com/zxcv5464/Kogakure>

公開網址：<https://zxcv5464.github.io/Kogakure/>

## GitHub Actions 設定

1. 在儲存庫 **Settings → Pages**，將 Build and deployment Source 設為 **GitHub Actions**。
2. 在 **Settings → Secrets and variables → Actions → Variables** 設定：
   - `VITE_SUPABASE_URL`：Supabase Project URL。
   - `VITE_SUPABASE_PUBLISHABLE_KEY`：`sb_publishable_...` 公開金鑰。
3. **禁止**將 service-role、`sb_secret_...`、資料庫密碼或員工密碼放在 `VITE_*` 或提交到儲存庫。
4. `.github/workflows/verify.yml` 負責 PR 的已知高風險依賴漏洞稽核與回歸檢查；`.github/workflows/deploy.yml` 於 `main` 更新後建置、發佈 GitHub Pages。`.github/dependabot.yml` 目前停用大量一般版本升級 PR，僅保留 GitHub 已啟用時的安全更新提醒／PR；避免一次出現多個未經相容性驗證的大版本更新。任何依賴更新都**不會自動合併**。
5. 部署成功後，確認正式網址、各頁直接進入／重新整理、後台登入、網路請求是否指向**預期 Supabase 專案**。

Actions 只發布前端靜態檔案。**SQL migrations、Storage/RLS、Edge Function 必須由授權管理員另外部署**，不可認為 push 就會自動生效。

## 正常更新與防止覆蓋店長修改

在本機 `D:\kogakure`、且工作目錄乾淨時：

```bash
git status -sb
git fetch origin
git log --oneline --max-count=10 origin/main
git switch main
git pull --ff-only origin main
git switch -c docs/or-feature-name
npm ci
npm run check
npm run build
```

修改後執行相關 `node scripts/qa-*.mjs`，檢查差異再提交分支：

```bash
git diff --check
git diff --stat
git add README.md docs/ .github/dependabot.yml .github/workflows/verify.yml
git commit -m "Refresh Kogakure documentation and security checklist"
git push -u origin docs/or-feature-name
```

在 GitHub 開 Pull Request（PR），確認測試通過、店長審查後合併至 `main`。若原工作目錄有未提交改動，**先檢查並保留**，不要直接 pull/覆蓋；若 `--ff-only` 失敗，說明分支歷史已分歧，先看 log 再決定 rebase 或 merge。

**不要使用 `git push --force` 覆蓋店長的 `main`。** 兩人同時修改造成衝突時，應逐檔整合與測試。不同分支或 DevSpace worktree 的修改不會自動出現在 `D:\kogakure` 的主工作目錄。

## GitHub Pages 乾淨網址

專案採 BrowserRouter，`npm run build` 會透過 `scripts/prepare-pages.mjs` 產生公開頁與後台路由的靜態入口，支援網址 `/Kogakure/staff`、`/Kogakure/booking`、`/Kogakure/admin` 等直接開啟或重新整理。

若正式網站呈現舊版，先看 Actions 是否部署成功，並使用無痕視窗確認快取與 Supabase 資料來源。**後台更新內容直接寫入 Supabase，通常不需要新 Git 提交。**

交接與權限詳見 `docs/HANDOFF.md`、`docs/SUPABASE_SETUP.md`。
