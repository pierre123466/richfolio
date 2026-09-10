---
title: 社群媒體發佈
layout: default
nav_order: 6
lang: zh-TW
permalink: /social-setup.html
---

# 社群媒體發佈

Richfolio 可以**選擇性地**將買進訊號發佈到公開的社群頁面 — **X/Twitter**、**Facebook 粉絲專頁**、**Threads** 帳號與 **LinkedIn 專頁** — 與電子郵件 + Telegram 簡報並行發佈。它只在**每日**與**盤中**模式執行(絕不在每週或 refresh 模式)。

這是**完全可選**的功能。若未設定任何社群憑證,就不會發佈任何內容,Richfolio 其餘部分依然與先前完全相同 — 每個平台會記錄一行「credentials not set — skipping」並繼續執行。

---

## 會發佈哪些內容
{: .text-green-200}

貼文刻意保持**通用化**,以確保不會洩漏任何私人資訊:

- 只發佈 **STRONG BUY** 與 **BUY** 訊號(HOLD/WAIT 會被略過)。
- 每則訊號顯示**股票代碼、行動、信心度、簡短理由**,以及選擇性的價值評等 — 不顯示其他內容。
- 目標投資組合與觀察清單的股票代碼**一律以「訊號」統一合併呈現** — 沒有「投資組合 vs 觀察清單」的標籤,因此你的持股永遠不會被揭露。
- **絕不發佈:** 配置比例、缺口、建議買進金額、股數、投資組合總值。`src/socialContent.ts` 中的 `buildSignalLines()` 是唯一的白名單關卡,而 `sanitizeReason()` 會剝除 AI 可能寫入理由中的任何配置缺口、金額規模或重疊折扣文字。兩者皆有單元測試覆蓋。
- 在 Facebook / Threads / LinkedIn 上,股票代碼會呈現為可點擊的 **`#hashtag`**(cashtag 只在 X 上有效,在 X 上維持為 `$cashtag`)。在非 X 平台上會附加一組可設定的通用 hashtag 以提升觸及。
- 每則貼文皆以免責聲明結尾:*「本內容非投資建議,由 Richfolio 自動產生。」*

---

## 啟用 / 停用
{: .text-green-200}

`config.json` 中的 `social` 區塊是總開關(以下顯示預設值):

```json
"social": {
  "enabled": true,
  "includeLinkInX": false,
  "hashtags": ["investing", "stocks", "stockmarket", "ETFs"]
}
```

- `enabled: false` — 無論憑證如何,皆停用所有社群發佈。
- `includeLinkInX` — 在 X 貼文中包含分析連結。預設關閉,因為連結會提高 X 的按次計費成本。
- `hashtags` — 在 Facebook / Threads / LinkedIn 上附加的通用 hashtag(開頭的 `#` 可省略)。不會加在 X 上。

每個平台**另外**還會以自身的憑證作為閘門,因此即使 `enabled` 為 `true`,未設定金鑰的平台仍會被略過。

---

## Secret 彙整
{: .text-green-200}

將下列項目加入為儲存庫 **Secret**(Settings → Secrets and variables → Actions → **Secrets**)。全部皆為可選 — 只需設定你想使用的平台。

| Secret | 平台 | 說明 |
|---|---|---|
| `FACEBOOK_PAGE_ID` | Facebook | 你的粉絲專頁數字 id |
| `FACEBOOK_PAGE_TOKEN` | Facebook | 長效粉絲專頁存取 token |
| `THREADS_USER_ID` | Threads | 你的 Threads 數字使用者 id |
| `THREADS_ACCESS_TOKEN` | Threads | 長效 token(約 60 天過期) |
| `THREADS_TOKEN_PAT` | Threads | 用於自動更新 Threads token 的可選 PAT(見下文) |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn | 具備 `w_organization_social` 的 OAuth 2.0 token |
| `LINKEDIN_ORG_URN` | LinkedIn | 例如 `urn:li:organization:123456` |
| `X_API_KEY` / `X_API_SECRET` | X/Twitter | OAuth 1.0a consumer 金鑰 |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X/Twitter | OAuth 1.0a 使用者 token |

---

## Facebook 粉絲專頁設定
{: .text-green-200}

執行階段只需要兩個值:`FACEBOOK_PAGE_ID` 與一個**長效**的 `FACEBOOK_PAGE_TOKEN`。因為你是以**粉絲專頁管理員身分發佈到自己的粉絲專頁**,所以可以維持在應用程式的**開發模式(Development mode)** — 不需要 App Review。

**1. 建立 Meta 應用程式**

1. 前往 [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**。
2. 選擇 **Other** → **Business** 應用程式類型並命名(例如「Richfolio Poster」)。

**2. 加入粉絲專頁管理使用案例**

1. 在應用程式中開啟 **Use cases** → 選擇 **Manage everything on your Page**。
2. 開啟其 **Permissions** 並 **Add**(Standard Access 即足夠 — 忽略「Get Advanced Access」):
   - `pages_manage_posts` — 發佈到動態消息(最關鍵的一項)
   - `pages_read_engagement`
   - `pages_show_list`

   它們應顯示為 **「Ready for testing」** — 這代表你作為管理員現在即可使用。

**3. 取得使用者 token**

1. 開啟 [Graph API Explorer](https://developers.facebook.com/tools/explorer)。
2. 選擇你的應用程式 → **Get User Access Token** → 勾選三個 `pages_*` 權限 → **Generate Access Token** → 核准。

**4. 鑄造長效粉絲專頁 token**

Richfolio 內附一個輔助工具,可替你完成 token 交換。暫時加入到 `.env`:

```bash
FACEBOOK_PAGE_ID=your_page_id          # numeric Page id
FACEBOOK_APP_SECRET=...                # App settings → Basic → App secret
FB_USER_TOKEN=...                      # the user token from step 3
```

然後執行:

```bash
npx tsx smoke/fb-page-token.ts
```

它會將短效使用者 token 交換為長效 token、找到你的粉絲專頁,並印出一個**永不過期的粉絲專頁 token**。將其貼入 `FACEBOOK_PAGE_TOKEN`,然後從 `.env` 中**刪除** `FACEBOOK_APP_SECRET` 與 `FB_USER_TOKEN` — 它們僅用於設定階段,執行階段絕不會使用。

**5. 驗證**

```bash
npx tsx smoke/smoke-facebook.ts             # checks the token (no posting)
npx tsx smoke/smoke-facebook.ts --post --cleanup   # posts a test, then deletes it
```

出現 `PASS` 即確認該 token 是有效的粉絲專頁 token,且發佈流程從頭到尾都能運作。

**6. 加入 GitHub**

將 `FACEBOOK_PAGE_ID` 與 `FACEBOOK_PAGE_TOKEN` 加入為儲存庫 Secret。**請勿**加入 app secret 或使用者 token。

> **Token 壽命:** 粉絲專頁 token 實質上是永久的,但若你變更 Facebook 密碼、撤銷應用程式,或不再是粉絲專頁管理員,它就會失效。若發佈停止運作,請從步驟 3 重新鑄造。

---

## Threads 設定
{: .text-green-200}

Threads 重用與 Facebook **相同的 Meta 應用程式**。你需要一個 `THREADS_USER_ID` 與一個長效的 `THREADS_ACCESS_TOKEN`。你授權的帳號就是貼文顯示的來源帳號 — 請使用你的品牌 Threads 帳號,且該帳號必須是**公開的**。

**1. 為 Meta 應用程式加入 Threads 使用案例**:**Use cases** → **Access the Threads API**。啟用 `threads_basic` 與 `threads_content_publish` scope。

**2. 將自己加入為 Threads Tester**:App Dashboard → **App roles → Roles** → **Add People** → **Threads Tester** → 輸入你的 Threads 使用者名稱 → 在 Threads 應用程式中接受邀請(Settings → Account → Website permissions)。

**3. 產生長效 token**:在 Threads 使用案例的 **Settings** 中,**User Token Generator** 會列出你的 tester 帳號 → **Generate token**。這已經是長效的 — 不需要交換。將其貼入 `.env` 作為 `THREADS_ACCESS_TOKEN`。

**4. 找出你的使用者 id 並驗證**:

```bash
npx tsx smoke/smoke-threads.ts             # prints THREADS_USER_ID; set it in .env
npx tsx smoke/smoke-threads.ts --post --cleanup   # posts a test (delete may be manual)
```

**5. 將 `THREADS_USER_ID` 與 `THREADS_ACCESS_TOKEN` 加入 GitHub Secret。**

> **Token 過期與自動更新:** Threads 長效 token 約在 **60 天**後過期。工作流程 `.github/workflows/refresh-threads-token.yml` 會每月更新 token 並寫回 secret — *前提是*你也加入了 `THREADS_TOKEN_PAT` secret(一個具備儲存庫 **Secrets: Read and write** 的細粒度 PAT)。若沒有該 PAT,請在 token 過期前手動更新。 當 token 已設定但缺少該 PAT 時,工作流程現在會**明確失敗**,而不是靜默通過 — 先前正是這種靜默通過,讓三次綠色的每月執行掩蓋了 token 過期。

---

## LinkedIn 專頁設定
{: .text-green-200}

LinkedIn 是免費的,但門檻最高。你需要:

1. 一個與你的公司專頁(Company Page)關聯的 LinkedIn **Developer app**。
2. **「Community Management API」** 產品,它授予 `w_organization_social` scope。申請它需要你的應用程式的公司關聯通過**驗證**(Settings 分頁)並提交一份存取表單(表單會要求註冊的公司名稱)。
3. 一個具備 `w_organization_social`、由**專頁管理員**產生的 OAuth 2.0 **存取 token**。

設定:

- `LINKEDIN_ACCESS_TOKEN` — OAuth 2.0 token。
- `LINKEDIN_ORG_URN` — 你的組織 URN,例如 `urn:li:organization:123456`(數字在你的公司專頁網址中)。
- `LINKEDIN_API_VERSION` — 可選覆寫(預設為近期的 `YYYYMM`)。

以 `npx tsx smoke/smoke-linkedin.ts`(token 檢查)與 `--post --cleanup`(發佈測試)驗證。

> LinkedIn 存取 token 約在 60 天後過期(refresh token 約可維持 365 天)。請規劃定期更新。發佈到組織需要一個已註冊的公司;若你沒有,可改寫發佈器,透過自助式的「Share on LinkedIn」產品(`w_member_social`)從個人檔案發佈。

---

## X / Twitter 設定
{: .text-green-200}

> **自 2026 年 2 月起,X 已無免費發佈層級。** 發佈為按次計費(每則約 0.015 美元,若含連結則更高)。Richfolio 內附 X 發佈器,但在你加入金鑰前皆維持休眠狀態。

發佈使用 **OAuth 1.0a 使用者情境(user context)**。在 [X Developer Portal](https://developer.x.com) 中,建立一個具備 **Read and Write** 權限的 project/app,並產生:

- `X_API_KEY` / `X_API_SECRET` — consumer(API)金鑰與密鑰。
- `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` — 你帳號的存取 token 與密鑰。

在 `config.json` 中將 `includeLinkInX` 保持關閉,以維持每則貼文的低成本。

---

## 它如何執行
{: .text-green-200}

在每日與盤中模式中,於電子郵件與 Telegram 寄送之後,Richfolio 會呼叫 `sendSocialPosts()`([src/social.ts](https://github.com/furic/richfolio/blob/main/src/social.ts))。每個平台都在各自的 try/catch 中發佈,因此單一平台失敗絕不會阻擋其他平台 — 也不會影響已寄出的電子郵件/Telegram。

若你 fork Richfolio,社群發佈會維持**關閉**,直到你以**自己的**帳號完成上述設定 — 憑證無法共用,因為每個 token 都會發佈到其擁有者的頁面。
