---
title: 소셜 미디어 게시
layout: default
nav_order: 6
lang: ko
permalink: /social-setup.html
---

# 소셜 미디어 게시

Richfolio는 **선택적으로** 매수 신호를 공개 소셜 계정에 게시할 수 있습니다 — **X/Twitter**, **Facebook 페이지**, **Threads** 계정, **LinkedIn 페이지** — 이메일 + Telegram 브리핑과 함께 말이죠. 이 기능은 **daily**와 **intraday** 모드에서만 실행됩니다 (weekly나 refresh에서는 절대 실행되지 않습니다).

이 기능은 **완전히 옵트인** 방식입니다. 소셜 자격 증명을 설정하지 않으면 아무것도 게시되지 않으며 나머지 Richfolio 기능은 이전과 정확히 동일하게 작동합니다 — 각 플랫폼은 "credentials not set — skipping" 줄을 로그에 남기고 넘어갑니다.

---

## 게시되는 내용
{: .text-green-200}

게시물은 비공개 정보가 새어나가지 않도록 의도적으로 **일반적인** 형태로 작성됩니다:

- **STRONG BUY**와 **BUY** 신호만 게시됩니다 (HOLD/WAIT은 건너뜁니다).
- 각 신호는 **종목, 액션, 신뢰도, 짧은 사유**, 그리고 선택적으로 가치 등급을 보여줍니다 — 그 외에는 아무것도 없습니다.
- 목표 포트폴리오 종목과 관심 목록 종목은 **모두 "신호"로 동일하게** 병합됩니다 — "포트폴리오 vs 관심 목록" 라벨이 없으므로 보유 종목이 드러나지 않습니다.
- **절대 게시되지 않음:** 배분, 격차, 추천 매수 금액, 보유 주식 수, 총 포트폴리오 가치. `src/socialContent.ts`의 `buildSignalLines()`가 단일 허용 목록 관문이며, `sanitizeReason()`이 AI가 사유에 적었을 수 있는 배분 격차, 달러 규모, 중첩 할인 텍스트를 제거합니다. 둘 다 단위 테스트로 검증됩니다.
- 종목은 Facebook / Threads / LinkedIn에서 클릭 가능한 **`#hashtag`**로 렌더링됩니다 (캐시태그는 X에서만 작동하며, X에서는 `$cashtag`로 유지됩니다). 도달률을 높이기 위해 X가 아닌 플랫폼에는 설정 가능한 일반 해시태그 세트가 덧붙습니다.
- 모든 게시물은 면책 문구로 끝납니다: *"투자 조언이 아닙니다. Richfolio가 자동 생성했습니다."*

---

## 활성화 / 비활성화
{: .text-green-200}

`config.json`의 `social` 블록이 마스터 스위치입니다 (기본값 표시):

```json
"social": {
  "enabled": true,
  "includeLinkInX": false,
  "hashtags": ["investing", "stocks", "stockmarket", "ETFs"]
}
```

- `enabled: false` — 자격 증명과 관계없이 모든 소셜 게시를 비활성화합니다.
- `includeLinkInX` — X 게시물에 분석 링크를 포함합니다. 링크가 X의 사용량 기반 비용을 높이기 때문에 기본적으로 꺼져 있습니다.
- `hashtags` — Facebook / Threads / LinkedIn에 덧붙는 일반 해시태그 (앞의 `#`는 선택 사항). X에는 추가되지 않습니다.

각 플랫폼은 **추가로** 자체 자격 증명으로 게이트되므로, `enabled`가 `true`여도 키가 없는 플랫폼은 건너뜁니다.

---

## Secret 요약
{: .text-green-200}

다음을 저장소 **Secret**으로 추가하세요 (Settings → Secrets and variables → Actions → **Secrets**). 모두 선택 사항이며 — 원하는 플랫폼만 설정하세요.

| Secret | 플랫폼 | 비고 |
|---|---|---|
| `FACEBOOK_PAGE_ID` | Facebook | 페이지의 숫자 id |
| `FACEBOOK_PAGE_TOKEN` | Facebook | 장기 유효 페이지 액세스 토큰 |
| `THREADS_USER_ID` | Threads | Threads 숫자 사용자 id |
| `THREADS_ACCESS_TOKEN` | Threads | 장기 유효 토큰 (약 60일 후 만료) |
| `THREADS_TOKEN_PAT` | Threads | Threads 토큰을 자동 갱신하기 위한 선택적 PAT (아래 참고) |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn | `w_organization_social` 권한이 있는 OAuth 2.0 토큰 |
| `LINKEDIN_ORG_URN` | LinkedIn | 예: `urn:li:organization:123456` |
| `X_API_KEY` / `X_API_SECRET` | X/Twitter | OAuth 1.0a 컨슈머 키 |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X/Twitter | OAuth 1.0a 사용자 토큰 |

---

## Facebook 페이지 설정
{: .text-green-200}

런타임에는 단 두 개의 값만 필요합니다: `FACEBOOK_PAGE_ID`와 **장기 유효** `FACEBOOK_PAGE_TOKEN`. **본인의 페이지에 관리자 자격으로** 게시하기 때문에 앱의 **개발 모드(Development mode)**에 머무를 수 있으며 — 앱 심사(App Review)가 필요 없습니다.

**1. Meta 앱 생성**

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**으로 이동합니다.
2. **Other** → **Business** 앱 유형을 선택하고 이름을 지정합니다 (예: "Richfolio Poster").

**2. 페이지 관리 사용 사례 추가**

1. 앱에서 **Use cases**를 열고 → **Manage everything on your Page**를 선택합니다.
2. 해당 항목의 **Permissions**를 열고 **Add**합니다 (Standard Access로 충분합니다 — "Get Advanced Access"는 무시하세요):
   - `pages_manage_posts` — 피드에 게시 (필수 권한)
   - `pages_read_engagement`
   - `pages_show_list`

   이들은 **"Ready for testing"**으로 표시되어야 합니다 — 이는 관리자인 당신이 지금 바로 사용할 수 있다는 의미입니다.

**3. 사용자 토큰 가져오기**

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer)를 엽니다.
2. 앱을 선택하고 → **Get User Access Token** → 세 개의 `pages_*` 권한을 체크하고 → **Generate Access Token** → 승인합니다.

**4. 장기 유효 페이지 토큰 발급**

Richfolio는 토큰 교환을 대신 처리해 주는 헬퍼를 제공합니다. `.env`에 임시로 추가하세요:

```bash
FACEBOOK_PAGE_ID=your_page_id          # numeric Page id
FACEBOOK_APP_SECRET=...                # App settings → Basic → App secret
FB_USER_TOKEN=...                      # the user token from step 3
```

그런 다음 실행합니다:

```bash
npx tsx smoke/fb-page-token.ts
```

이 헬퍼는 단기 유효 사용자 토큰을 장기 유효 토큰으로 교환하고, 당신의 페이지를 찾아 **만료되지 않는 페이지 토큰**을 출력합니다. 이를 `FACEBOOK_PAGE_TOKEN`에 붙여넣은 다음, `.env`에서 `FACEBOOK_APP_SECRET`과 `FB_USER_TOKEN`을 **삭제**하세요 — 이들은 설정 전용이며 런타임에는 절대 사용되지 않습니다.

**5. 검증**

```bash
npx tsx smoke/smoke-facebook.ts             # checks the token (no posting)
npx tsx smoke/smoke-facebook.ts --post --cleanup   # posts a test, then deletes it
```

`PASS`는 토큰이 유효한 페이지 토큰이며 게시가 처음부터 끝까지 작동함을 확인해 줍니다.

**6. GitHub에 추가**

`FACEBOOK_PAGE_ID`와 `FACEBOOK_PAGE_TOKEN`을 저장소 Secret으로 추가하세요. 앱 시크릿이나 사용자 토큰은 추가하지 **마세요**.

> **토큰 수명:** 페이지 토큰은 사실상 영구적이지만, Facebook 비밀번호를 변경하거나 앱을 취소하거나 페이지 관리자 자격을 잃으면 토큰이 죽습니다. 게시가 멈추면 3단계부터 다시 발급하세요.

---

## Threads 설정
{: .text-green-200}

Threads는 Facebook과 **동일한 Meta 앱**을 재사용합니다. `THREADS_USER_ID`와 장기 유효 `THREADS_ACCESS_TOKEN`이 필요합니다. 권한을 부여한 계정이 게시물이 표시되는 계정이므로 — 브랜드 Threads 계정을 사용하세요. 이 계정은 **공개**여야 합니다.

**1. Meta 앱에 Threads 사용 사례 추가**: **Use cases** → **Access the Threads API**. `threads_basic`과 `threads_content_publish` 스코프를 활성화합니다.

**2. 본인을 Threads Tester로 추가**: App Dashboard → **App roles → Roles** → **Add People** → **Threads Tester** → Threads 사용자 이름 입력 → Threads 앱에서 초대를 수락 (Settings → Account → Website permissions).

**3. 장기 유효 토큰 생성**: Threads 사용 사례의 **Settings**에서 **User Token Generator**가 테스터 계정을 나열합니다 → **Generate token**. 이 토큰은 이미 장기 유효이므로 — 교환이 필요 없습니다. 이를 `.env`에 `THREADS_ACCESS_TOKEN`으로 붙여넣으세요.

**4. 사용자 id 확인 및 검증**:

```bash
npx tsx smoke/smoke-threads.ts             # prints THREADS_USER_ID; set it in .env
npx tsx smoke/smoke-threads.ts --post --cleanup   # posts a test (delete may be manual)
```

**5. `THREADS_USER_ID`와 `THREADS_ACCESS_TOKEN`을 GitHub Secret에 추가하세요.**

> **토큰 만료 및 자동 갱신:** Threads 장기 유효 토큰은 **약 60일** 후 만료됩니다. 워크플로우 `.github/workflows/refresh-threads-token.yml`이 매달 토큰을 갱신하고 secret에 다시 기록합니다 — *단,* `THREADS_TOKEN_PAT` secret(저장소 **Secrets: Read and write** 권한을 가진 세분화된 PAT)을 함께 추가한 경우에 한합니다. 이 PAT가 없으면 만료 전에 토큰을 수동으로 갱신하세요. 토큰은 설정되어 있는데 PAT가 없는 상태에서는 이제 워크플로우가 조용히 통과하지 않고 **명시적으로 실패**합니다 — 과거 이 상태로 세 번의 월간 실행이 초록불인 채 토큰 만료를 가렸습니다.

---

## LinkedIn 페이지 설정
{: .text-green-200}

LinkedIn은 무료이지만 가장 까다롭게 게이트되어 있습니다. 필요한 것:

1. 회사 페이지(Company Page)에 연결된 LinkedIn **개발자 앱(Developer app)**.
2. `w_organization_social` 권한을 부여하는 **"Community Management API"** 제품. 이를 요청하려면 앱의 회사 연결이 **인증**(Settings 탭)되어야 하고 액세스 양식을 제출해야 합니다 (등록된 사업자명을 요구합니다).
3. **페이지 관리자**가 생성한 `w_organization_social` 권한을 가진 OAuth 2.0 **액세스 토큰**.

설정:

- `LINKEDIN_ACCESS_TOKEN` — OAuth 2.0 토큰.
- `LINKEDIN_ORG_URN` — 조직 URN, 예: `urn:li:organization:123456` (숫자는 회사 페이지 URL에 있습니다).
- `LINKEDIN_API_VERSION` — 선택적 재정의 (기본값은 최근 `YYYYMM`).

`npx tsx smoke/smoke-linkedin.ts`(토큰 확인)와 `--post --cleanup`(게시 테스트)로 검증하세요.

> LinkedIn 액세스 토큰은 약 60일 후에 만료됩니다 (리프레시 토큰은 약 365일 지속). 주기적으로 갱신할 계획을 세우세요. 조직에 게시하려면 등록된 사업체가 필요합니다. 사업체가 없다면, 셀프서비스 "Share on LinkedIn" 제품(`w_member_social`)을 통해 개인 프로필에서 게시하도록 게시 모듈을 수정할 수 있습니다.

---

## X / Twitter 설정
{: .text-green-200}

> **X에는 2026년 2월 이후 무료 게시 플랜이 없습니다.** 게시는 사용량 기반 과금입니다 (게시당 약 $0.015, 링크가 포함되면 더 높음). Richfolio는 X 게시 기능을 포함하지만 키를 추가하기 전까지는 비활성 상태로 유지됩니다.

게시에는 **OAuth 1.0a 사용자 컨텍스트**가 사용됩니다. [X Developer Portal](https://developer.x.com)에서 **Read and Write** 권한을 가진 프로젝트/앱을 생성하고 다음을 발급하세요:

- `X_API_KEY` / `X_API_SECRET` — 컨슈머(API) 키 및 시크릿.
- `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` — 당신 계정의 액세스 토큰 및 시크릿.

게시당 비용을 낮게 유지하려면 `config.json`에서 `includeLinkInX`를 꺼 두세요.

---

## 실행 방식
{: .text-green-200}

daily 및 intraday 모드에서 이메일과 Telegram 발송 후, Richfolio는 `sendSocialPosts()` ([src/social.ts](https://github.com/furic/richfolio/blob/main/src/social.ts))를 호출합니다. 각 플랫폼은 자체 try/catch 안에서 게시하므로, 한 플랫폼이 실패해도 다른 플랫폼이나 — 이미 발송된 이메일/Telegram을 절대 막지 않습니다.

Richfolio를 포크하는 경우, **본인의** 계정으로 위 설정을 완료하기 전까지 소셜 게시는 **꺼진** 상태로 유지됩니다 — 각 토큰은 소유자의 계정에 게시하므로 자격 증명을 공유할 수 없습니다.
