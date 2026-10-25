# UNKNOWN — 關於未知的我們

SAKURAI_TK 的非官方二次創作閱讀網站，採用純靜態 HTML/CSS/JavaScript，適用於 Cloudflare Pages。風格：深藍雨夜、城市的兩扇窗、暖白小說書頁；初版仍使用原創 SVG 作為**暫時視覺占位**，尚未替換為使用者偏好的免費真實攝影；不使用官方劇照。

## 作品架構

1. **The Distance Between Us**（`serial`）：**連續劇情**。依 `章節順序` 由小到大顯示，提供「從第一章開始閱讀」、本機「接續閱讀」、上一篇／下一篇。未讀章節標題預設隱藏，可點選「顯示章節篇名」。
2. **獨立短篇集**（`shorts`）：預計約 47 篇，實際篇數以 Notion 公開結果為準。各篇獨立，提供標題搜尋、CP、分級、發布日期／自訂排序。

共通：Notion 內文格式（含原生超連結）、成人內容提醒、YouTube 配樂連結、文章圖片、明暗閱讀、字級記憶。**不含任何真實故事內容；初始 `data/chapters.json` 為空。**

## Notion 同步：已依目前真實資料結構調整（2026/10/26）

繼續使用共用「📖 章節資料庫」，不搬移、不複製正文。

**現有 The Distance Between Us 十章**：依你提供的 Notion 截圖確認，它們每一篇的 **「所屬作品」都是獨立作品 `The Distance Between Us`**，**「故事篇章」為空白**。因此同步程式現在**不要求故事篇章**，而是用 `所屬作品` Relation 的完整 Notion Page ID 進行安全分流：

- `NOTION_SERIAL_PAGE_ID` → The Distance Between Us 十章，顯示於連載，依 `章節順序` 排序。
- `NOTION_SHORTS_PAGE_ID` → 已核對「短篇集」作品，其 `作品識別碼` 是 **`unknown_shorts`**。此 Secret 應填寫「短篇集」**Notion 作品頁面的真正 Page ID（32 位）**，並非 `unknown_shorts` 字串。只有其下文章的「所屬作品」Relation 真正指向「短篇集」時才會被匯入。

其他欄位：

| Notion 欄位 | 型態 | 功能 |
|---|---|---|
| 文章名稱 | Title | 小說中文正式篇名 |
| 副標題 | Text | 英文篇名（如 `Separate`），會顯示在閱讀器標題下 |
| 所屬作品 | Relation | **精確對應已授權的作品頁面 ID** |
| 章節順序 | Number | 連載必填、發布章節不可重複，範圍依照已建立的 1–10 |
| 網站章節識別碼 | Text | 如 `separate`、`wont_lonely`、`switch`，只能英文小寫、數字、底線、連字號 |
| 章節類型 | Select | 現有連載章節為「連載」 |
| CP / 配對 | Multi-select | 依 Notion 設定，如「魏之遠 × 魏謙」 |
| 閱讀分級 | Select | 一般／18+ |
| 發布狀態 | Select | 只有「已發布」才匯出 |
| 網站公開 | Checkbox | 只有勾選才匯出，草稿狀態仍不會公開 |

**根據目前的截圖，十章都為草稿、公開核取方塊皆未勾選，所以第一次同步 `0` 篇是正確結果。** 此外，最新「短篇集」作品頁面的章節關聯顯示 `Empty`，只代表尚未從該頁反向看到短篇章節；必須逐篇或批次核對各篇文章的「所屬作品」Relation，不能把約 47 篇當成已連結成功。 此時測試成功僅表示連上資料庫和公開門檻運作；要驗證連載關聯配對須在確認可公開的文章後，將至少一章正式公開再測試。

## GitHub Repository 與 Secrets

1. 在 GitHub 建立新公開儲存庫，建議名稱：`unknown-archive`。
2. 上傳本 ZIP 解壓縮的**全部檔案**到新 repo 的根目錄；**包含隱藏路徑 `.github/workflows/sync-notion.yml`**。若 GitHub 網頁拖曳沒有上傳隱藏檔，請手動建立相同檔案路徑並貼入 YAML。
3. 到 `https://github.com/<帳號>/unknown-archive/settings/secrets/actions` → New repository secret，新增**三個必填 Secret + 一個選填**：
   - `NOTION_TOKEN`：專用 Notion Integration 的 Token；勿貼到聊天、JS 或 GitHub 公開檔案。
   - `NOTION_DATABASE_ID`：共用章節資料庫 ID（之前 Top Gun 用的是 `3f59214c53e3805f8153fab9b3367d2d`，**確認仍是同一個才使用**）。
   - `NOTION_SERIAL_PAGE_ID`：在「我的作品」打開 **The Distance Between Us** 那一筆作品，Copy link；取頁面 URL 的 **32 位頁面 ID**（不是資料庫 ID，也不是 `v=` view ID）。
   - `NOTION_SHORTS_PAGE_ID`：在「我的作品」打開 **短篇集**，確認 `作品識別碼=unknown_shorts`，複製作品頁面連結取其中的 32 位 Page ID；即使短篇尚未全部建立，也可以先設定此 Secret。
4. 在 Notion 分享「章節資料庫」給新的 Integration；建議同時連接「我的作品」，方便之後擴充。此版本依 Relation Page ID 篩選，不會讀取草稿內文。
5. 開啟 `Actions → Sync UNKNOWN public stories → Run workflow → main`。目前十章都是草稿且網站未公開，因此輸出 `0` 章是預期結果；之後發布測試篇再核對關聯及章數。

**注意**：這是新網站自己的 GitHub Actions 和 Secrets，與已完成的 Top Gun / 其他網站互不共用、互不修改。

## Cloudflare Pages

在 Cloudflare `Workers & Pages → Create application → Pages → Connect to Git`，選擇新 repo：

| 選項 | 設定 |
|---|---|
| Framework preset | None |
| Build command | （留空） |
| Build output directory | `.` |
| Production branch | `main` |

若 Cloudflare 沒有列出新 repo，到 `https://github.com/settings/installations` → **Cloudflare Workers and Pages → Configure**，為該 app 增加新 repo 存取權限（不要取消其他三個站的授權）。

## 自訂

- `config.js`：網站作者、連載狀態（預設中性 `連載`；確認後可改為 `連載中` / `已完結`）和是否預設展示全部章節篇名。
- `index.html`：首頁主標、副標等靜態文字。
- `styles.css`：色票、手機版與小說閱讀排版。
- `assets/hero-city.svg`、`assets/serial-window.svg`、`assets/short-stories.svg`：暫時 SVG 場景。正式公開前，優先從 `PHOTO_SOURCES.md` 選定免費真實攝影，取得圖檔並替換素材。
- `scripts/sync_notion.py`：Notion 欄位名稱或 `故事篇章` 選項若與本版本不同，請先修正再啟用同步。

## 隱私與閱讀說明

* 公開 GitHub 儲存庫及 `data/chapters.json` 內的正文都是公開可查的，**請勿把未準備公開的文章切換為雙重公開**。
* Git 不會因從最新資料刪除文章而清除先前提交的 Git 歷史；若誤發布私密內容，請立即停止網站公開並處理 Git 歷史。
* 接續閱讀、章節開啟紀錄、字級與閱讀模式只儲存在讀者裝置的 `localStorage`，不會傳到任何伺服器，也不跨裝置同步。
* 成人分級採互動提醒，並非實際驗證身分或年齡。

## 上線前檢查表

- [ ] GitHub repo 已建立，所有檔案（包含 `.github`）上傳成功
- [ ] 三個 Actions Secrets 已設定
- [ ] Notion Integration 已授權共用章節資料庫
- [x] The Distance Between Us 截圖已確認十章的 `章節順序`、連載類型及識別碼
- [ ] 填入 `NOTION_SERIAL_PAGE_ID`，確認值來自獨立作品頁面（不是資料庫）
- [x] 獨立短篇分類作品已建立：作品名稱「短篇集」、識別碼 `unknown_shorts`
- [ ] 約 47 篇短篇的「所屬作品」正確連到「短篇集」
- [ ] 設定「短篇集」的真正 Notion Page ID 至 `NOTION_SHORTS_PAGE_ID`
- [ ] 第一次 GitHub Actions 成功，公開章數符合預期
- [ ] Cloudflare Pages 部署成功，檢查手機版、閱讀器、18+ 與正文超連結
