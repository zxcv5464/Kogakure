# 狐隱｜店長 GitHub 發布設定

專案來源：`https://github.com/zxcv5464/Kogakure`
預計網站網址：`https://zxcv5464.github.io/Kogakure/`
本機專案：`D:\kogakure`
資料庫：店長的 Supabase，與本機測試使用同一套公開資料。

## 一次性 GitHub 設定（由店長或具管理權限者完成）

1. 儲存庫須是 **Public**（GitHub Free 的 GitHub Pages 需要公開儲存庫）。公開的是程式碼和經過最佳化的網站圖片，不包含 `.env.local`、管理員密碼、Secret Key、原始角色 PNG。
2. 在 Repository **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 在 Repository **Settings → Secrets and variables → Actions → Variables → New repository variable** 建立：
   - `VITE_SUPABASE_URL`：Supabase **Project URL**，與本機 `.env.local` 相同。
   - `VITE_SUPABASE_PUBLISHABLE_KEY`：Supabase 的 **Publishable Key（sb_publishable_...）**，與本機相同。
4. 不要將 `sb_secret_...`、`service_role`、管理員帳號密碼設定成 `VITE_*`，也不需把 `.env.local` 上傳至 GitHub。
5. 在 **Actions** 檢查 `Publish Kogakure website` 工作流程是否完成。首度完成 Pages 設定後，可執行 `workflow_dispatch` 手動發布一次，或日後直接 push `main` 觸發。

設定完成後，推送 `main` 會自動建置並發布至 `https://zxcv5464.github.io/Kogakure/`。如果缺少上面的兩個公開變數，工作流程會**停止部署**，不會誤將示範資料網站發布出去。

## 第一次推送至店長的儲存庫

DevSpace 本機 `origin` 已切換為 `https://github.com/zxcv5464/Kogakure.git`。請確認你的 GitHub 帳號已接受店長的 Collaborator 邀請。

開發機目前 Git 作者可能仍是測試用的 `Your Name <you@example.com>`。首次提交前，請將**本機這個儲存庫**的 Git 作者改成你自己的 GitHub 顯示名稱和已驗證或 noreply Email（不會影響其他專案）。然後：

```bash
cd /d/kogakure
git add -A
git commit -m "Prepare Kogakure for owner GitHub Pages"
git push -u origin main
```

新儲存庫建立時是空的，可以直接推送現有歷史；推送後，如 Pages 或 Variables 尚未設定，Actions 會提示設定缺漏。完成 GitHub Pages 設定後可以在 Actions 重新執行 workflow，不需要修改程式碼。

## 乾淨網址（不需要 #）

網站採用 BrowserRouter，正式執行 `npm run build` 時，會為 `about`、`services`、`staff`、`shifts`、`menu`、`booking`、`admin` 產生各自的 `dist/<頁面>/index.html`，解決 GitHub Pages 無 SPA rewrite 時，直接開啟或重新整理會 404 的問題。

正式網址例如 `https://zxcv5464.github.io/Kogakure/staff`、`https://zxcv5464.github.io/Kogakure/admin`（GitHub Pages 可能在直接載入時補上結尾 `/`）；舊的 `/#/staff` 書籤會自動轉換。未知路徑使用 `404.html` 導回 SPA，不會改變網址列中顯示的乾淨路徑。

## 日常流程

1. 在 DevSpace `D:\kogakure` 修改程式。
2. 用 `npm run dev` 本機測試，資料寫進店長的 Supabase。
3. 確認後提交到 `main` 並推送店長的 GitHub 儲存庫。
4. GitHub Actions 重新建置，公開網站更新。

**注意：** GitHub 部署只負責**前台程式、靜態圖片與管理介面**。從後台新增／修改員工資料會直接更新 Supabase，通常**不需 push 或重新部署網站**；只需訪客重新整理頁面即可看到更新。

## 多個網站與管理員

- 舊測試帳號 `ffxivtesthub/kogakure` 與店長專案是**不同**儲存庫；以店長專案為正式來源。
- 訪客網站與 `/Kogakure/admin`（管理總覽）、`/Kogakure/admin/staff`（員工名帖管理）共用同一個網域，管理員仍須使用 Supabase 帳號登入。
- GitHub Pages 是公開網站，不能將網站登入頁面當作資料安全邊界。資料庫依 Supabase RLS 驗證操作權限。
- GitHub Pages 推送後可能有短暫的 GitHub/CDN 快取延遲，請以 Actions 成功、硬重新整理或無痕模式檢查。

## 尚未上線前

程式碼能推上 GitHub 但**不代表已啟用 Pages**。請先確認 Actions Variables 和 Settings → Pages 設定完成，再分享正式網址給客人。
