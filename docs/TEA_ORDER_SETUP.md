# 狐隱 KOGAKURE｜茶宴點單與訂單管理

## 旅人點單
- 於公開 **茶宴** `/menu/` 選擇商品、數量，填入 **FFXIV 角色姓名** 與 **所在伺服器**（各 2～48 字），按「確認送出訂單」。
- 送出成功畫面會顯示訂單編號、旅人角色名、所在伺服器、餐點品項及合計 Gil。原本的複製點單、清空功能均保留。
- 「展示菜單」或 Supabase 未連線時不能建立訂單，避免假成功。訂單送出**不等於已付款**，需在遊戲內由館方確認供應及結算。
- 送出價格**由資料庫即時重新計算**，只接受已公開、所屬分類公開、可供應的餐點。商品修改／下架後，歷史訂單保留送出時的名稱及價格快照。
- 每單 1～20 種餐點、各品項 1～99 份、總數最多 100 份；同名同伺服器短時間連續送出會被限制。無可用菜單時不能點單。

## 後台訂單管理
- 管理員或獲 `orders.manage` 權限的員工可從 `/admin/orders/` 檢視最新 200 筆訂單，以及姓名、伺服器、餐點、價格、合計與送出時間。
- 工作流程：**待接單（pending）→ 製作中（preparing）→ 已完成（completed）**，待接單或製作中可以取消（cancelled）。
- 已完成或取消的訂單不允許再次更新。取消需二次確認，訂單明細留作歷史，不清除。
- 後台導覽列「訂單管理」旁顯示精確的**待接單數**（只有 pending）。接單後立即減少，沒有待接單時隱藏；讀取失敗時顯示「!」，不假裝為零。
- 提醒以 Realtime 推播加每 9 秒可見分頁輪詢備援。切回分頁亦會同步。
- 訂單權限獨立於 `menu.manage`（餐點設定）、`booking.manage`（狐姬指名），可由原正式管理員於「員工帳號」自由勾選；舊有員工不會自動取得查看旅人訂單的權限。

## 安全 / 技術
- Migration `supabase/migrations/20261115_05_tea_orders.sql`：`tea_orders`、`tea_order_items` 兩表均啟用 RLS。匿名角色**沒有 SELECT／INSERT／UPDATE／DELETE 的資料表權限**。
- 公開送單使用 `public.submit_tea_order`（SECURITY INVOKER），轉至非 API 暴露 schema 的 `private.submit_tea_order` 僅限白名單 RPC，核對菜單價格、供應、品項唯一性、數量與冷卻時間；不可從瀏覽器任意指定訂單價格與狀態。
- 訂單管理以 RLS 限制 SELECT 給 `orders.manage` 或原正式管理者；改狀態使用受限 RPC `advance_tea_order`，伺服器確認身分及有效轉換。沒有直接的訂單 UPDATE / DELETE 授權。
- 新增 `orders.manage` 至 `employee_accounts` 權限限制、`has_backoffice_permission` 及員工帳號 Edge Function `manage-employee-accounts` 白名單；Edge Function 保持 `verify_jwt=true`。不修改既有員工／預約／茶宴價格資料。
- 維運：套用 migration 後，部署更新的 `manage-employee-accounts` Edge Function；GitHub Actions 編譯及 `qa-tea-orders.mjs` 通過後發布網站。
- 如需從外部查詢歷史訂單、匯出全部訂單、配送或遊戲內 Gil 自動扣款，屬後續功能，現在沒有提供。

## 驗收
1. 使用測試角色在正式茶宴頁點一杯茶、填入角色姓名和伺服器，確認取得成功單號；不應在展示模式送出。
2. 管理員後台左側「訂單管理」顯示 1，檢視餐點與總價；接單後變成「製作中」，側欄待接單數降為 0；點完成保留歷史訂單。
3. 建立一位**只有 orders.manage** 的測試員工，驗證可管理訂單但不能進入員工名帖、編輯菜單、管理預約或帳號；未授權者不能讀取旅人姓名和伺服器。
4. 下架餐點後舊訂單價格不變，新點單禁止送出已下架餐點；短時間同名同伺服器重複送出會遭拒。
5. 此功能的自動測試不會保留任何正式資料庫測試訂單；人工驗收產生的測試訂單請館方以「取消」結束。
