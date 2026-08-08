# 청첩장 사이트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026년 10월 31일 예식 모바일 청첩장을 Astro 정적 사이트로 만들어 GitHub Pages 루트에 배포한다.

**Architecture:** 11개 섹션 대부분을 `.astro`로 정적 렌더해 JS를 싣지 않고, 상태·타이머·브라우저 API가 필요한 여섯 곳만 React 아일랜드로 하이드레이션한다. 예식 정보는 `wedding.ts` 한 파일이 단일 소스이고, 개인 연락처·계좌는 저장소에 두지 않고 `WEDDING_PRIVATE` 환경변수로 빌드 시 주입한다.

**Tech Stack:** Astro · React · Tailwind v4 · shadcn/ui (Base UI) · sharp · vitest · GitHub Actions

**저장소:** `changgi-suhyeon.github.io` (public) — 로컬 `~/Desktop/Project/marriage-invitation`

**선행 계획:** `2026-08-08-rsvp-api.md` — Task 11에서 그 계획이 산출한 엔드포인트 URL과 Turnstile Site key가 필요하다.

**설계 문서:** `docs/superpowers/specs/2026-08-08-mobile-wedding-invitation-design.md`

## Worker 구현에서 넘어온 사항

RSVP API는 완료·병합·배포됐다(`marriage-invitation-worker` main, 배포 URL은 `~/Desktop/Project/rsvp-secrets.txt`). 그 과정의 최종 리뷰에서 **사이트 쪽에서 처리해야 할 것들**이 나왔다. 해당 태스크에서 반드시 반영한다.

**C1 — `createdAt`을 그대로 `new Date()`에 넣으면 9시간 어긋난다. (Task 14)**
D1의 `created_at`은 `datetime('now')` 결과라 **타임존 표식이 없는 UTC 문자열**이다(`2026-08-08 06:23:32`). V8은 이 형식을 **로컬 시각으로** 파싱하므로 KST 환경에서 9시간 밀린 시각이 관리자 화면에 표시된다. "언제 응답했나"로 판단하는 화면에서 조용히 틀린 값이다.

해결: Worker의 `RsvpRecord`에 `createdMs: number`를 추가하고(행에 이미 있는 값이며 PII가 아니다) 사이트는 `new Date(createdMs)`를 쓴다. **두 저장소를 함께 고쳐야 한다** — Worker의 `src/rows.ts`와 `src/contract.ts`, 사이트의 `src/lib/rsvp-contract.ts`.

**C2 — 계약에 응답 타입이 없다. (Task 11)**
Worker의 `src/contract.ts`에는 요청 타입만 있고 실제 와이어 포맷은 `index.ts` 안에만 암묵적으로 존재한다. 복사해 오기 전에 세 가지를 추가한다:

```ts
export interface RsvpPostResponse { ok: true; id: number }
export interface RsvpErrorBody { error: string; fields?: ValidationError[] }
export interface RsvpListResponse { records: RsvpRecord[]; summary: RsvpSummary }
```

검증 상수(`NAME_MAX = 20`, `MESSAGE_MAX = 500`, `PARTY_MAX = 10`)도 계약으로 옮긴다. 지금 상태로는 폼이 `maxLength={20}`을 하드코딩하게 되고, 서버 상수가 바뀌면 조용히 어긋난다.

**C3 — 동측 동명이인이 무음 병합된다. (Task 14)**
설계 §6.2가 정한 중복 제거는 `(측, 이름)` 기준이라, 신랑측 김민수가 두 명이면 **둘이 한 명으로 접히고 뒤 사람의 인원과 식사 수가 사라진다.** 아무 흔적도 남지 않는다. 반대로 `홍길동`과 `홍 길동`은 다른 사람으로 세어 과다 계상된다.

해결: `RsvpSummary`에 `duplicateSubmissions: number`를 추가해 접힌 건수를 노출한다. 0이면 안심, 0이 아니면 관리자가 목록을 눈으로 확인한다. Task 14가 이미 중복 이름을 하이라이트하므로 그것과 맞물린다. **숫자가 조용히 틀리는 것과, 틀릴 수 있다고 알려주는 것의 차이다.**

**C4 — 서버가 503과 500을 새로 반환한다. (Task 11 — 확인 완료, 조치 불필요)**
Turnstile 장애 시 503, 저장 실패 시 500이 온다(이전에는 후자가 200이었다). Task 11의 폼은 `if (!response.ok)`로 일반 판정하고 `data.error`를 그대로 띄우므로 두 경우 모두 올바르게 처리된다. **상태 코드로 분기하도록 바꾸지 말 것.**

**C5 — 예식 전 확인 항목**
- 카카오톡 인앱 브라우저에서 RSVP 제출 관통 (설계 §9에 추가됨). Turnstile managed 모드가 인앱 WebView에서 챌린지를 못 띄우면 그 브라우저 하객 전원이 제출 불가가 된다. 위젯 모드는 재배포 없이 바꿀 수 있다
- `TURNSTILE_REQUIRED` 킬 스위치 동작 확인
- D1 백업: `wrangler d1 export marriage-invitation --remote --output rsvp-backup-$(date +%F).sql` 을 주 1회. 응답이 D1 한 곳에만 있다
- 레이트리밋 상한 20 재검토. CGNAT 풀이 20보다 클 수 있다

## Global Constraints

- 배포 주소는 `https://changgi-suhyeon.github.io/` **루트**다. 유저 페이지 저장소이므로 Astro `base` 설정을 넣지 않는다.
- **색은 CSS 변수 5개에만 존재한다.** 컴포넌트에 색을 하드코딩하지 않는다.
  `--bg #F4F3F0` · `--line #D5D2CA` · `--muted #9B978D` · `--ink #35342F` · `--body #6C6A64`
- **타이포는 하이브리드다.** 이름·섹션 타이틀·인사글은 명조(Gowun Batang), 본문·라벨·버튼·날짜·주소는 산세리프(Pretendard).
- **RSVP 폼과 `/admin`은 서브셋 폰트를 쓰지 않는다.** 하객이 입력하는 글자가 서브셋에 없으면 깨진다. 이 두 곳은 시스템 산세리프를 쓴다.
- 본문 최소 16px, 터치 타겟 최소 44px. 어른 하객 기준이다.
- `prefers-reduced-motion: reduce`면 모든 진입 애니메이션과 라이트박스 전환을 끈다.
- **히어로를 제외한 모든 `<section>`에 `reveal` 클래스를 붙인다** (Task 2에서 정의). 히어로에 붙이면 첫 화면이 페이드인하며 LCP가 나빠진다.
- `100vh`를 쓰지 않는다. 모바일 주소창 때문에 높이가 튄다. `100dvh` 또는 콘텐츠 높이를 쓴다.
- 아일랜드는 여섯 개뿐이다: 카운트다운 · 라이트박스 · 복사 버튼 · RSVP 폼 · 공유 버튼 · BGM 토글. 그 외는 전부 `.astro` 정적 렌더다.
- 환경변수 구분 — `PUBLIC_` 접두사는 **공개해도 되는 값에만** 붙인다(`PUBLIC_RSVP_ENDPOINT`, `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_KAKAO_JS_KEY`). `WEDDING_PRIVATE`에는 붙이지 않는다.
- 커밋 메시지는 한국어 한 줄 요약 + 필요 시 본문.

---

### Task 1: Astro 스캐폴드와 배포 파이프라인

파이프라인을 가장 먼저 세운다. 내용이 없어도 실제 URL에 실제로 뜨는 것을 확인해두면, 이후 모든 태스크에서 "배포가 되나?"가 변수에서 빠진다.

**Files:**
- Create: `astro.config.mjs`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/pages/index.astro`, `src/layouts/Base.astro`, `.github/workflows/deploy.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Base.astro` 레이아웃 (`title`, `description` props). 이후 모든 페이지가 이걸 감싼다.

- [ ] **Step 1: Astro 프로젝트 생성**

현재 디렉터리에 README·docs·.gitignore가 이미 있으므로 빈 템플릿을 덮어쓰지 않도록 `--template minimal`로 만든다.

```bash
npm create astro@latest -- --template minimal --no-install --no-git --skip-houston --yes .
```

- [ ] **Step 2: 통합 추가**

```bash
npx astro add react tailwind --yes
npm install
npm install -D vitest
```

- [ ] **Step 3: astro.config.mjs 확인 및 수정**

`base`는 넣지 않는다. 유저 페이지라 루트 배포다.

```js
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://changgi-suhyeon.github.io',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
})
```

- [ ] **Step 4: vitest.config.ts 생성**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
```

`package.json`의 `scripts`에 추가한다:

```json
"test": "vitest run",
"typecheck": "astro check"
```

- [ ] **Step 5: src/layouts/Base.astro 생성**

`color-scheme: light` 메타가 여기 들어간다. 이게 없으면 삼성 인터넷·안드로이드 크롬의 강제 다크 모드가 색을 전부 반전시켜 톤 설계가 무의미해진다.

```astro
---
interface Props {
  title: string
  description?: string
}
const { title, description = '' } = Astro.props
---
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 6: src/pages/index.astro 임시 내용**

```astro
---
import Base from '../layouts/Base.astro'
---
<Base title="준영 · 서연 결혼합니다">
  <main>
    <p>준비 중입니다.</p>
  </main>
</Base>
```

- [ ] **Step 7: .gitignore에 Astro 산출물 확인**

`dist/`, `.astro/`, `node_modules/`가 이미 들어 있는지 확인한다. 없으면 추가한다.

- [ ] **Step 8: 로컬 빌드 확인**

```bash
npm run build
```

Expected: `dist/index.html` 생성, 오류 없음

- [ ] **Step 9: .github/workflows/deploy.yml 생성**

GitHub은 `<user>.github.io` 저장소를 만들면 Pages를 **자동으로 켜되 `build_type: legacy`**(브랜치 기반 Jekyll)로 설정한다. 그 상태에서는 Jekyll이 `README.md`를 렌더해 서빙한다 — 실제로 그렇게 되어 있었다.

**이 저장소는 이미 `build_type: workflow`로 전환해 두었다**(`gh api -X PUT .../pages -f build_type=workflow`). 따라서 아래 워크플로가 처음 돌면 Astro 산출물이 서빙된다. `configure-pages`의 `enablement: true`는 그대로 두되, 켜는 역할이 아니라 멱등 보증용이다.

첫 배포 전까지 Pages `status`는 `errored`로 보이는데 정상이다 — 워크플로가 한 번도 성공하지 않았기 때문이며, 첫 성공에 해소된다.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/configure-pages@v5
        with:
          enablement: true

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          WEDDING_PRIVATE: ${{ secrets.WEDDING_PRIVATE }}
          PUBLIC_RSVP_ENDPOINT: ${{ vars.PUBLIC_RSVP_ENDPOINT }}
          PUBLIC_TURNSTILE_SITE_KEY: ${{ vars.PUBLIC_TURNSTILE_SITE_KEY }}
          PUBLIC_KAKAO_JS_KEY: ${{ vars.PUBLIC_KAKAO_JS_KEY }}

      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 10: 커밋과 푸시**

```bash
git add -A
git commit -m "feat: Astro 스캐폴드와 GitHub Pages 배포 파이프라인 구성"
git push origin main
```

- [ ] **Step 11: 배포 확인**

```bash
gh run watch
```

완료 후:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://changgi-suhyeon.github.io/
```

Expected: `200`. 브라우저로 열면 "준비 중입니다."가 보인다.

여기서 실패하면 다음 태스크로 넘어가지 않는다. **파이프라인이 서기 전에 콘텐츠를 쌓으면 원인 분리가 어려워진다.**

---

### Task 2: 디자인 토큰과 폰트

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/global.css`
- Modify: `src/layouts/Base.astro`
- Create: `public/fonts/` (폰트 파일 배치)

**Interfaces:**
- Produces: CSS 변수 `--bg --line --muted --ink --body`, 폰트 유틸 클래스 `.font-serif-kr`, `.font-sans-kr`, `.font-system`

- [ ] **Step 1: 폰트 내려받아 배치**

두 폰트 모두 OFL 라이선스라 자체 호스팅해도 된다. Google Fonts CDN을 쓰지 않는 이유는 외부 요청을 없애고 Task 16에서 서브셋하기 위해서다.

- **Gowun Batang** (명조, 제목용) — Google Fonts에서 Regular(400)·Bold(700) 내려받기
- **Pretendard** (산세리프, 본문용) — GitHub `orioncactus/pretendard` 릴리스의 `woff2` 중 Regular(400)·SemiBold(600)

받은 파일을 아래 이름으로 `public/fonts/`에 넣는다. `@font-face`가 이 이름을 참조한다.

```
public/fonts/GowunBatang-Regular.woff2
public/fonts/GowunBatang-Bold.woff2
public/fonts/Pretendard-Regular.woff2
public/fonts/Pretendard-SemiBold.woff2
```

Google Fonts는 `.ttf`로 받아지는 경우가 있다. 그때는 변환한다:

```bash
npm install -g ttf2woff2 2>/dev/null || true
ttf2woff2 < GowunBatang-Regular.ttf > GowunBatang-Regular.woff2
```

서브셋은 Task 16에서 텍스트가 확정된 뒤에 한다.

- [ ] **Step 2: src/styles/tokens.css 생성**

```css
:root {
  color-scheme: light;

  --bg: #f4f3f0;
  --line: #d5d2ca;
  --muted: #9b978d;
  --ink: #35342f;
  --body: #6c6a64;

  --font-serif-kr: 'Gowun Batang', 'AppleMyungjo', serif;
  --font-sans-kr: 'Pretendard', -apple-system, 'Apple SD Gothic Neo', sans-serif;
  /* 폼·관리자 전용. 서브셋 폰트를 쓰지 않아 임의 글자가 깨지지 않는다. */
  --font-system: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo',
    'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 3: src/styles/global.css 생성**

**Tailwind의 소스 범위를 명시적으로 좁힌다.** v4의 자동 콘텐츠 감지는 프로젝트 전체를 훑어서 `docs/`의 계획 문서 코드블록에 있는 클래스명까지 CSS로 생성한다(실측 확인됨 — `grid-cols-7`, `aspect-square`, `tabular-nums` 등이 배포된 CSS에 들어갔다). 문서가 늘수록 커지고, **빌드 산출물이 문서 내용에 의존하게 된다.**

```css
@import 'tailwindcss' source(none);
@source '../**/*.{astro,html,ts,tsx,js,jsx}';
@import './tokens.css';

@font-face {
  font-family: 'Gowun Batang';
  src: url('/fonts/GowunBatang-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Gowun Batang';
  src: url('/fonts/GowunBatang-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: 'Pretendard';
  src: url('/fonts/Pretendard-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Pretendard';
  src: url('/fonts/Pretendard-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
}

html {
  background: var(--bg);
}

body {
  margin: 0;
  font-family: var(--font-sans-kr);
  font-size: 16px; /* 어른 하객 기준 하한 */
  line-height: 1.75;
  color: var(--body);
  -webkit-text-size-adjust: 100%;
}

.font-serif-kr { font-family: var(--font-serif-kr); }
.font-sans-kr  { font-family: var(--font-sans-kr); }
.font-system   { font-family: var(--font-system); }

/* 청첩장 본문 폭. 모바일 우선이므로 데스크톱에서도 좁게 유지한다. */
.shell {
  max-width: 480px;
  margin-inline: auto;
  padding-inline: 24px;
}

/* 터치 타겟 하한 */
a, button, summary {
  min-height: 44px;
}

/* 스크롤 진입 연출.
 *
 * 기본 상태는 '보임'이다. 숨김은 html.js-reveal 아래에서만 걸리고,
 * 그 클래스는 스크립트가 IntersectionObserver를 성공적으로 세운 뒤에만 붙는다.
 * 따라서 JS가 비활성화됐든, 차단됐든, 도중에 예외를 던졌든
 * 콘텐츠는 항상 보인다 — 연출만 사라진다.
 *
 * 반대로 하면(기본 숨김 + JS가 보이게) 스크립트 하나가 죽는 순간
 * 하객이 백지를 보게 된다. 그 방향으로 만들지 말 것. */
.reveal {
  opacity: 1;
  transform: none;
}

html.js-reveal .reveal {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 700ms ease-out, transform 700ms ease-out;
}

html.js-reveal .reveal.is-visible {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  html.js-reveal .reveal { opacity: 1; transform: none; }
}
```

- [ ] **Step 4: 스크롤 진입 스크립트를 Base.astro에 추가**

CSS scroll-driven animation은 구형 기기 지원이 고르지 않아 쓰지 않는다. IntersectionObserver로 처리하되 **섹션당 한 번만 관찰하고 해제**한다.

`Base.astro`의 `</body>` 직전에 넣는다. 인라인 스크립트라 별도 요청이 없다.

```astro
<script is:inline>
  // 숨김은 html.js-reveal 이 붙은 뒤에만 걸린다. 이 스크립트가 한 줄도 못 돌거나
  // 도중에 던지면 클래스가 안 붙고, 콘텐츠는 CSS 기본값대로 보인 채 남는다.
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) throw 0
    if (!('IntersectionObserver' in window)) throw 0

    const targets = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target) // 한 번만
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )

    // 관찰 준비가 끝난 뒤에야 숨김을 켠다 — 순서를 바꾸지 말 것.
    document.documentElement.classList.add('js-reveal')
    targets.forEach((el) => observer.observe(el))
  } catch {
    // 아무것도 하지 않는다. 연출만 없고 콘텐츠는 그대로 보인다.
  }
</script>
```

이후 태스크에서 각 `<section>`에 `class="... reveal"`을 붙인다. **히어로에는 붙이지 않는다** — 첫 화면이 페이드인하면 LCP가 나빠진다.

- [ ] **Step 5: Base.astro에서 global.css import**

`Base.astro`의 frontmatter 최상단에 추가한다:

```astro
---
import '../styles/global.css'
// ...기존 Props 정의
---
```

- [ ] **Step 6: 빌드하고 색·폰트 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:4321` 열어 배경이 `#F4F3F0`인지, 본문이 Pretendard로 렌더되는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add src/styles public/fonts src/layouts/Base.astro
git commit -m "feat: 그레이지 색 토큰과 명조/산세리프 하이브리드 타이포 구성"
```

---

### Task 3: 콘텐츠 데이터와 민감정보 가드

**Files:**
- Create: `src/data/wedding.ts`, `src/data/private.ts`, `test/private.test.ts`, `.env.example`

**Interfaces:**
- Produces:
  - `wedding` — 공개 콘텐츠 객체 (`date`, `groom`, `bride`, `venue`, `meal`, `shuttle`, `gallery`, `greeting`, `bgm`)
  - `interface PrivateData { phones: Record<PhoneKey, string>; accounts: { groom: Account[]; bride: Account[] } }`
  - `interface Account { bank: string; number: string; holder: string; kakaopay: string | null }`
  - `parsePrivateData(raw: string | undefined, isProd: boolean): PrivateData` — 순수 함수, 테스트 대상
  - `privateData` — 위 함수를 `import.meta.env`로 호출한 결과

- [ ] **Step 1: src/data/wedding.ts 작성**

값이 미정인 항목은 빈 문자열로 두되 **구조는 전부 확정한다.** 나중에 값만 채운다.

```ts
export const wedding = {
  date: '2026-10-31T12:00:00+09:00',

  groom: {
    name: '',
    order: '장남',
    father: { name: '', deceased: false },
    mother: { name: '', deceased: false },
  },
  bride: {
    name: '',
    order: '장녀',
    father: { name: '', deceased: false },
    mother: { name: '', deceased: false },
  },

  venue: {
    name: 'L65호텔웨딩컨벤션',
    hall: '타워동 6층 가든홀',
    address: '서울 동대문구 왕산로 200 청량리역 롯데캐슬스카이-L65',
    tel: '', // 식장 대표번호 — 개인정보가 아니므로 여기 둔다
    map: {
      kakao: '',
      naver: '',
      tmap: '',
      staticImage: '/photos/map.webp',
    },
    transit: {
      subway: '',
      bus: '',
      train: '', // 청량리역은 KTX·ITX 정차역이라 별도 항목으로 둔다
      car: '',
      parking: '',
    },
  },

  meal: { type: '', hours: '', reception: null as null | { place: string; at: string } },
  shuttle: { departAt: '', boardingPoint: '' }, // 담당자 연락처는 privateData.phones.shuttle

  greeting: '',
  gallery: [] as GalleryPhoto[],
  bgm: { src: '', title: '', credit: '' },
}
// as const 를 쓰지 않는다. 갤러리 배열이 readonly가 되면 Task 7의 매니페스트 주입과
// Lightbox의 배열 사용에서 타입이 어긋난다.

export interface GalleryPhoto {
  base: string   // 확장자·너비 제외한 경로. 예: '/photos/01'
  width: number
  height: number
  lqip: string   // base64 data URI
  alt: string
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/private.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parsePrivateData } from '../src/data/private'

const complete = JSON.stringify({
  phones: {
    groom: '010-1111-1111',
    groomFather: '010-1111-2222',
    groomMother: '010-1111-3333',
    bride: '010-2222-1111',
    brideFather: '010-2222-2222',
    brideMother: '010-2222-3333',
    shuttle: '010-3333-3333',
  },
  accounts: {
    groom: [{ bank: '국민', number: '123', holder: '홍길동', kakaopay: null }],
    bride: [{ bank: '신한', number: '456', holder: '성춘향', kakaopay: null }],
  },
})

describe('parsePrivateData — 프로덕션', () => {
  it('완전한 값이면 파싱한다', () => {
    const data = parsePrivateData(complete, true)
    expect(data.phones.groom).toBe('010-1111-1111')
    expect(data.accounts.bride[0]?.bank).toBe('신한')
  })

  it('값이 없으면 던진다', () => {
    expect(() => parsePrivateData(undefined, true)).toThrow(/WEDDING_PRIVATE/)
  })

  it('빈 문자열이어도 던진다', () => {
    expect(() => parsePrivateData('', true)).toThrow(/WEDDING_PRIVATE/)
  })

  it('JSON이 깨졌으면 던진다', () => {
    expect(() => parsePrivateData('{nope', true)).toThrow(/JSON/)
  })

  it('phones 키가 하나라도 빠지면 던진다', () => {
    const missing = JSON.parse(complete)
    delete missing.phones.shuttle
    expect(() => parsePrivateData(JSON.stringify(missing), true)).toThrow(/shuttle/)
  })

  it('전화번호가 빈 문자열이면 던진다', () => {
    const blank = JSON.parse(complete)
    blank.phones.bride = ''
    expect(() => parsePrivateData(JSON.stringify(blank), true)).toThrow(/bride/)
  })

  it('계좌 배열이 비면 던진다', () => {
    const empty = JSON.parse(complete)
    empty.accounts.groom = []
    expect(() => parsePrivateData(JSON.stringify(empty), true)).toThrow(/accounts/)
  })

  it('계좌에 필수 필드가 빠지면 던진다', () => {
    const bad = JSON.parse(complete)
    bad.accounts.groom[0].number = ''
    expect(() => parsePrivateData(JSON.stringify(bad), true)).toThrow(/accounts/)
  })
})

describe('parsePrivateData — 개발', () => {
  it('값이 없으면 더미로 대체한다', () => {
    const data = parsePrivateData(undefined, false)
    expect(data.phones.groom).toBe('000-0000-0000')
  })

  it('더미는 실제처럼 보이지 않는다', () => {
    const data = parsePrivateData(undefined, false)
    expect(data.accounts.groom[0]?.number).toMatch(/000/)
  })

  it('개발이어도 값이 있으면 그걸 쓴다', () => {
    expect(parsePrivateData(complete, false).phones.groom).toBe('010-1111-1111')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `../src/data/private` 모듈 없음

- [ ] **Step 4: src/data/private.ts 구현**

```ts
export type PhoneKey =
  | 'groom' | 'groomFather' | 'groomMother'
  | 'bride' | 'brideFather' | 'brideMother'
  | 'shuttle'

export interface Account {
  bank: string
  number: string
  holder: string
  kakaopay: string | null
}

export interface PrivateData {
  phones: Record<PhoneKey, string>
  accounts: { groom: Account[]; bride: Account[] }
}

const PHONE_KEYS: PhoneKey[] = [
  'groom', 'groomFather', 'groomMother',
  'bride', 'brideFather', 'brideMother',
  'shuttle',
]

/** 개발 모드 전용. 실제 값으로 착각할 수 없게 만든다. */
const DEV_FALLBACK: PrivateData = {
  phones: Object.fromEntries(
    PHONE_KEYS.map((k) => [k, '000-0000-0000']),
  ) as Record<PhoneKey, string>,
  accounts: {
    groom: [{ bank: '개발용', number: '000-0000-000000', holder: '신랑', kakaopay: null }],
    bride: [{ bank: '개발용', number: '000-0000-000000', holder: '신부', kakaopay: null }],
  },
}

/**
 * 값이 없거나 불완전한 채로 프로덕션 빌드가 성공하면
 * 계좌번호가 빈 사이트가 조용히 배포된다. 그래서 던진다.
 * 잘못된 배포보다 실패한 빌드가 낫다.
 */
export function parsePrivateData(raw: string | undefined, isProd: boolean): PrivateData {
  if (raw === undefined || raw.trim() === '') {
    if (isProd) {
      throw new Error(
        'WEDDING_PRIVATE 환경변수가 없습니다. 프로덕션 빌드를 중단합니다. ' +
          '.env 또는 GitHub Secrets를 확인하세요.',
      )
    }
    return DEV_FALLBACK
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('WEDDING_PRIVATE 의 JSON 파싱에 실패했습니다.')
  }

  const data = parsed as Partial<PrivateData>

  const phones = data.phones
  if (typeof phones !== 'object' || phones === null) {
    throw new Error('WEDDING_PRIVATE.phones 가 없습니다.')
  }
  for (const key of PHONE_KEYS) {
    const value = (phones as Record<string, unknown>)[key]
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`WEDDING_PRIVATE.phones.${key} 가 비어 있습니다.`)
    }
  }

  const accounts = data.accounts
  if (typeof accounts !== 'object' || accounts === null) {
    throw new Error('WEDDING_PRIVATE.accounts 가 없습니다.')
  }
  for (const side of ['groom', 'bride'] as const) {
    const list = (accounts as Record<string, unknown>)[side]
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(`WEDDING_PRIVATE.accounts.${side} 가 비어 있습니다.`)
    }
    for (const [i, entry] of list.entries()) {
      const a = entry as Partial<Account>
      for (const field of ['bank', 'number', 'holder'] as const) {
        if (typeof a[field] !== 'string' || a[field]!.trim() === '') {
          throw new Error(`WEDDING_PRIVATE.accounts.${side}[${i}].${field} 가 비어 있습니다.`)
        }
      }
    }
  }

  return data as PrivateData
}

export const privateData: PrivateData = parsePrivateData(
  import.meta.env.WEDDING_PRIVATE as string | undefined,
  import.meta.env.PROD,
)
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 11개 테스트 통과

- [ ] **Step 6: .env.example 작성**

```
# 실제 값은 .env 에 넣는다 (gitignore됨). CI는 GitHub Secrets를 쓴다.
WEDDING_PRIVATE={"phones":{"groom":"010-0000-0000","groomFather":"010-0000-0000","groomMother":"010-0000-0000","bride":"010-0000-0000","brideFather":"010-0000-0000","brideMother":"010-0000-0000","shuttle":"010-0000-0000"},"accounts":{"groom":[{"bank":"","number":"","holder":"","kakaopay":null}],"bride":[{"bank":"","number":"","holder":"","kakaopay":null}]}}

PUBLIC_RSVP_ENDPOINT=https://marriage-invitation-rsvp.example.workers.dev
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
PUBLIC_KAKAO_JS_KEY=
```

- [ ] **Step 7: 가드가 실제로 빌드를 멈추는지 확인**

이 확인을 건너뛰면 가드 전체가 무의미해진다.

```bash
env -u WEDDING_PRIVATE npm run build
```

Expected: 빌드 **실패**, 메시지에 `WEDDING_PRIVATE 환경변수가 없습니다` 포함

그다음 `.env`를 만들어 정상 빌드되는지 확인한다:

```bash
cp .env.example .env
npm run build
```

Expected: 성공

- [ ] **Step 8: `--passWithNoTests`를 제거한다**

Task 1은 테스트가 0개인 상태에서 CI를 통과시키려고 `package.json`의 test 스크립트를 `vitest run --passWithNoTests`로 두었다. **이 태스크가 첫 실제 테스트를 추가하므로 이제 그 플래그를 뺀다.**

```json
"test": "vitest run",
```

그대로 두면 이후 글롭 오타·파일명 실수·`test/` 디렉터리 유실로 **0개가 수집돼도 CI가 조용히 초록으로 통과한다.** 테스트가 있는데 안 돌아가는 상태가 테스트가 없는 상태보다 위험하다.

제거 후 `npm test`가 실제로 11개를 수집해 통과하는지 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add src/data test/private.test.ts .env.example package.json
git commit -m "feat: 콘텐츠 데이터 모델과 민감정보 빌드 타임 주입 가드 추가"
```

---

### Task 4: D-day 상태 계산

**Files:**
- Create: `src/lib/dday.ts`, `test/dday.test.ts`

**Interfaces:**
- Produces:
  - `type DdayState = { phase: 'before'; days; hours; minutes; seconds } | { phase: 'today' } | { phase: 'after' }`
  - `getDdayState(weddingIso: string, nowMs: number): DdayState`

**현재 시각을 인자로 받는 것이 이 모듈의 핵심 설계다.** 내부에서 `Date.now()`를 호출하면 예식 전·당일·이후 세 상태를 테스트할 방법이 없어진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/dday.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getDdayState } from '../src/lib/dday'

const WEDDING = '2026-10-31T12:00:00+09:00'
const ms = (iso: string) => Date.parse(iso)

describe('getDdayState', () => {
  it('예식 전이면 before', () => {
    const s = getDdayState(WEDDING, ms('2026-08-08T12:00:00+09:00'))
    expect(s.phase).toBe('before')
  })

  it('남은 일·시·분·초를 계산한다', () => {
    // 예식 2일 3시간 4분 5초 전
    const s = getDdayState(WEDDING, ms('2026-10-29T08:55:55+09:00'))
    expect(s).toEqual({ phase: 'before', days: 2, hours: 3, minutes: 4, seconds: 5 })
  })

  it('예식 당일 오전이면 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T08:00:00+09:00')).phase).toBe('today')
  })

  it('예식 시작 직후에도 당일이면 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T13:00:00+09:00')).phase).toBe('today')
  })

  it('예식일 밤 23시 59분도 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T23:59:59+09:00')).phase).toBe('today')
  })

  it('다음 날 자정 직후면 after', () => {
    expect(getDdayState(WEDDING, ms('2026-11-01T00:00:01+09:00')).phase).toBe('after')
  })

  it('한참 뒤에도 after (음수 D-day를 만들지 않는다)', () => {
    expect(getDdayState(WEDDING, ms('2026-12-25T00:00:00+09:00')).phase).toBe('after')
  })

  it('한국 시간 기준으로 날짜를 가른다', () => {
    // UTC로는 10월 30일이지만 KST로는 10월 31일 오전 8시다.
    expect(getDdayState(WEDDING, ms('2026-10-30T23:00:00Z')).phase).toBe('today')
  })

  it('예식 1초 전은 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T11:59:59+09:00')).phase).toBe('today')
  })

  it('예식 전날 23:59:59는 before', () => {
    const s = getDdayState(WEDDING, ms('2026-10-30T23:59:59+09:00'))
    expect(s.phase).toBe('before')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `../src/lib/dday` 모듈 없음

- [ ] **Step 3: src/lib/dday.ts 구현**

```ts
export type DdayState =
  | { phase: 'before'; days: number; hours: number; minutes: number; seconds: number }
  | { phase: 'today' }
  | { phase: 'after' }

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 해당 시각의 한국 날짜를 'YYYY-MM-DD'로 돌려준다. */
function kstDateKey(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * 예식 전·당일·이후 세 상태를 가른다.
 * 당일 판정은 시각이 아니라 한국 날짜 기준이다 — 예식이 끝난 저녁에도
 * "오늘 결혼합니다"가 맞고, 다음 날 0시부터 "끝났습니다"가 된다.
 */
export function getDdayState(weddingIso: string, nowMs: number): DdayState {
  const weddingMs = Date.parse(weddingIso)
  const weddingKey = kstDateKey(weddingMs)
  const nowKey = kstDateKey(nowMs)

  if (nowKey === weddingKey) return { phase: 'today' }
  if (nowKey > weddingKey) return { phase: 'after' }

  const totalSeconds = Math.floor((weddingMs - nowMs) / 1000)
  return {
    phase: 'before',
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor(totalSeconds / 3_600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 10개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/dday.ts test/dday.test.ts
git commit -m "feat: 예식 전·당일·이후 3상태 D-day 계산 추가"
```

---

### Task 5: 히어로와 모시는 말씀

**Files:**
- Create: `src/sections/Hero.astro`, `src/sections/Invitation.astro`, `src/components/SectionLabel.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `wedding` (Task 3), `privateData` (Task 3)
- Produces: `SectionLabel.astro` (props: `en: string`, `ko: string`) — 이후 모든 섹션이 재사용

- [ ] **Step 1: SectionLabel.astro 작성**

```astro
---
interface Props { en: string; ko: string }
const { en, ko } = Astro.props
---
<header class="text-center mb-8">
  <p class="font-sans-kr text-[11px] tracking-[0.3em]" style="color: var(--muted)">{en}</p>
  <div class="w-8 h-px mx-auto my-4" style="background: var(--line)"></div>
  <h2 class="font-serif-kr text-xl tracking-[0.06em]" style="color: var(--ink)">{ko}</h2>
</header>
```

- [ ] **Step 2: Hero.astro 작성**

메인 사진이 LCP 대상이다. `fetchpriority="high"`와 `preload`를 붙이고, 나머지 사진은 전부 lazy로 둔다. `100vh`는 쓰지 않는다.

```astro
---
import { wedding } from '../data/wedding'

const d = new Date(wedding.date)
const kst = new Date(d.getTime() + 9 * 3600 * 1000)
const y = kst.getUTCFullYear()
const m = kst.getUTCMonth() + 1
const day = kst.getUTCDate()
const weekday = ['SUN','MON','TUE','WED','THU','FRI','SAT'][kst.getUTCDay()]
const hour = kst.getUTCHours()
const minute = kst.getUTCMinutes()
const ampm = hour < 12 ? '오전' : '오후'
const h12 = hour % 12 === 0 ? 12 : hour % 12
const timeText = minute === 0 ? `${ampm} ${h12}시` : `${ampm} ${h12}시 ${minute}분`
---
<section class="shell pt-14 pb-12 text-center">
  <p class="font-sans-kr text-[11px] tracking-[0.3em]" style="color: var(--muted)">
    THE MARRIAGE OF
  </p>
  <div class="w-8 h-px mx-auto my-4" style="background: var(--line)"></div>

  <h1 class="font-serif-kr text-3xl tracking-[0.08em]" style="color: var(--ink)">
    {wedding.groom.name}
    <span class="text-lg align-middle" style="color: var(--muted)">·</span>
    {wedding.bride.name}
  </h1>

  <p class="mt-5 text-sm leading-loose">
    {y}. {m}. {day}. {weekday} {timeText}<br />
    {wedding.venue.name} {wedding.venue.hall}
  </p>

  <img
    src="/photos/hero-1080.webp"
    srcset="/photos/hero-640.webp 640w, /photos/hero-1080.webp 1080w, /photos/hero-1620.webp 1620w"
    sizes="(max-width: 480px) 100vw, 480px"
    width="1080"
    height="1440"
    alt=""
    fetchpriority="high"
    decoding="async"
    class="mt-9 w-full rounded-t-full"
  />
</section>
```

`Base.astro`의 `<head>`에 preload를 추가한다:

```astro
<link rel="preload" as="image" href="/photos/hero-1080.webp"
      imagesrcset="/photos/hero-640.webp 640w, /photos/hero-1080.webp 1080w"
      imagesizes="(max-width: 480px) 100vw, 480px" />
```

- [ ] **Step 3: Invitation.astro 작성**

연락하기는 `<details>`다. 전화 6개 + 문자 6개를 모달 없이, JS 없이 접는다.
고인이신 부모님은 성함 앞에 국화(`菊`)를 붙이는 것이 관례다.

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import { wedding } from '../data/wedding'
import { privateData } from '../data/private'

const p = privateData.phones

const people = [
  { label: `신랑 ${wedding.groom.name}`, phone: p.groom },
  { label: `신랑 아버지 ${wedding.groom.father.name}`, phone: p.groomFather,
    deceased: wedding.groom.father.deceased },
  { label: `신랑 어머니 ${wedding.groom.mother.name}`, phone: p.groomMother,
    deceased: wedding.groom.mother.deceased },
  { label: `신부 ${wedding.bride.name}`, phone: p.bride },
  { label: `신부 아버지 ${wedding.bride.father.name}`, phone: p.brideFather,
    deceased: wedding.bride.father.deceased },
  { label: `신부 어머니 ${wedding.bride.mother.name}`, phone: p.brideMother,
    deceased: wedding.bride.mother.deceased },
]

const chrysanthemum = (deceased?: boolean) => (deceased ? '菊 ' : '')
---
<section class="shell py-14">
  <SectionLabel en="INVITATION" ko="모시는 말씀" />

  <p class="font-serif-kr text-center text-[15px] leading-[2.1] whitespace-pre-line"
     style="color: var(--ink)">{wedding.greeting}</p>

  <div class="w-8 h-px mx-auto my-9" style="background: var(--line)"></div>

  <p class="text-center text-sm leading-loose">
    {chrysanthemum(wedding.groom.father.deceased)}{wedding.groom.father.name} ·
    {chrysanthemum(wedding.groom.mother.deceased)}{wedding.groom.mother.name}
    의 {wedding.groom.order} <strong style="color: var(--ink)">{wedding.groom.name}</strong>
    <br />
    {chrysanthemum(wedding.bride.father.deceased)}{wedding.bride.father.name} ·
    {chrysanthemum(wedding.bride.mother.deceased)}{wedding.bride.mother.name}
    의 {wedding.bride.order} <strong style="color: var(--ink)">{wedding.bride.name}</strong>
  </p>

  <details class="mt-8 border rounded-lg" style="border-color: var(--line)">
    <summary class="flex items-center justify-center text-sm cursor-pointer select-none py-3">
      연락하기
    </summary>
    <ul class="px-4 pb-3">
      {people.map((person) => (
        <li class="flex items-center justify-between gap-3 py-3 border-t"
            style="border-color: var(--line)">
          <span class="text-sm">{person.label}</span>
          <span class="flex gap-2">
            <a href={`tel:${person.phone}`}
               class="flex items-center px-3 rounded border text-xs"
               style="border-color: var(--line); color: var(--ink)"
               aria-label={`${person.label}에게 전화`}>전화</a>
            <a href={`sms:${person.phone}`}
               class="flex items-center px-3 rounded border text-xs"
               style="border-color: var(--line); color: var(--ink)"
               aria-label={`${person.label}에게 문자`}>문자</a>
          </span>
        </li>
      ))}
    </ul>
  </details>
</section>
```

- [ ] **Step 4: index.astro에 섹션 연결**

```astro
---
import Base from '../layouts/Base.astro'
import Hero from '../sections/Hero.astro'
import Invitation from '../sections/Invitation.astro'
import { wedding } from '../data/wedding'
---
<Base title={`${wedding.groom.name} · ${wedding.bride.name} 결혼합니다`}>
  <main>
    <Hero />
    <Invitation />
  </main>
</Base>
```

- [ ] **Step 5: 확인**

Run: `npm run dev`
Expected: 히어로와 모시는 말씀이 렌더된다. `<details>`를 열면 6명 × 전화/문자 링크가 나온다.

브라우저 개발자 도구 Network 탭에서 **JS 파일 요청이 0건**인지 확인한다. 아직 아일랜드가 없으므로 하나도 없어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add src/sections src/components src/pages/index.astro src/layouts/Base.astro
git commit -m "feat: 히어로와 모시는 말씀 섹션 추가"
```

---

### Task 6: 캘린더와 D-day 카운트다운

**Files:**
- Create: `src/sections/WeddingDay.astro`, `src/components/Countdown.tsx`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `getDdayState` (Task 4), `wedding` (Task 3)
- Produces: `<Countdown weddingIso={string} client:visible />`

- [ ] **Step 1: WeddingDay.astro 작성 — 달력은 정적**

2026년 10월은 빌드 시점에 확정된 값이다. 런타임에 계산할 이유가 없다.

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import Countdown from '../components/Countdown'
import { wedding } from '../data/wedding'

const kst = new Date(Date.parse(wedding.date) + 9 * 3600 * 1000)
const year = kst.getUTCFullYear()
const month = kst.getUTCMonth() // 0-based
const targetDay = kst.getUTCDate()

const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

const cells: (number | null)[] = [
  ...Array.from({ length: firstWeekday }, () => null),
  ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
]
const weekdayNames = ['일', '월', '화', '수', '목', '금', '토']
---
<section class="shell py-14">
  <SectionLabel en="WEDDING DAY" ko={`${year}년 ${month + 1}월`} />

  <div class="grid grid-cols-7 gap-1 text-center">
    {weekdayNames.map((name) => (
      <span class="text-[11px] py-1" style="color: var(--muted)">{name}</span>
    ))}
    {cells.map((day) => (
      <span
        class:list={['text-sm py-2 rounded-full', day === targetDay && 'font-semibold']}
        style={day === targetDay
          ? 'background: var(--ink); color: var(--bg)'
          : 'color: var(--body)'}
      >{day ?? ''}</span>
    ))}
  </div>

  <Countdown weddingIso={wedding.date} client:visible />
</section>
```

- [ ] **Step 2: Countdown.tsx 작성**

세 상태를 모두 처리한다. **`after` 상태를 빠뜨리면 11월에 들어온 사람에게 음수 D-day가 보인다.** 청첩장 링크는 예식 후에도 카톡 대화방에 남아 계속 유입된다.

```tsx
import { useEffect, useState } from 'react'
import { getDdayState, type DdayState } from '../lib/dday'

interface Props {
  weddingIso: string
}

export default function Countdown({ weddingIso }: Props) {
  const [state, setState] = useState<DdayState>(() => getDdayState(weddingIso, Date.now()))

  useEffect(() => {
    // 'before'가 아니면 갱신할 것이 없다. 타이머를 걸지 않는다.
    if (state.phase !== 'before') return
    const id = setInterval(() => setState(getDdayState(weddingIso, Date.now())), 1000)
    return () => clearInterval(id)
  }, [weddingIso, state.phase])

  if (state.phase === 'today') {
    return (
      <p className="mt-9 text-center font-serif-kr text-[17px]" style={{ color: 'var(--ink)' }}>
        오늘 저희가 결혼합니다
      </p>
    )
  }

  if (state.phase === 'after') {
    return (
      <p
        className="mt-9 text-center font-serif-kr text-[15px] leading-[2]"
        style={{ color: 'var(--ink)' }}
      >
        저희 결혼식이 무사히 끝났습니다
        <br />
        함께해 주셔서 감사합니다
      </p>
    )
  }

  const tiles: [string, number][] = [
    ['DAYS', state.days],
    ['HOUR', state.hours],
    ['MIN', state.minutes],
    ['SEC', state.seconds],
  ]

  return (
    <div className="mt-9 flex justify-center gap-5" aria-live="off">
      {tiles.map(([label, value]) => (
        <div key={label} className="text-center">
          <span className="block text-xl tabular-nums" style={{ color: 'var(--ink)' }}>
            {String(value).padStart(2, '0')}
          </span>
          <span className="block text-[10px] tracking-[0.1em]" style={{ color: 'var(--muted)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: index.astro에 WeddingDay 추가**

`<Invitation />` 아래에 `<WeddingDay />`를 넣고 import를 추가한다.

- [ ] **Step 4: 세 상태 수동 확인**

`getDdayState`는 이미 유닛 테스트가 있으므로 여기서는 렌더만 확인한다.
`Countdown.tsx` 안 `Date.now()`를 일시적으로 `Date.parse('2026-10-31T15:00:00+09:00')`로 바꿔 `today` 문구를, `Date.parse('2026-11-05T00:00:00+09:00')`로 바꿔 `after` 문구를 확인한 뒤 **되돌린다.**

- [ ] **Step 5: 커밋**

```bash
git add src/sections/WeddingDay.astro src/components/Countdown.tsx src/pages/index.astro
git commit -m "feat: 정적 캘린더와 3상태 D-day 카운트다운 추가"
```

---

### Task 7: 사진 최적화 파이프라인

**Files:**
- Create: `scripts/optimize-photos.ts`
- Modify: `package.json`, `src/data/wedding.ts`

**Interfaces:**
- Consumes: 레포 밖 원본 JPG 디렉터리
- Produces: `public/photos/<name>-{640,1080,1620}.webp` 와 `src/data/gallery.json` (`GalleryPhoto[]`)

원본 JPG는 장당 10~20MB라 저장소에 넣지 않는다. 최적화 산출물만 커밋한다(30장 기준 약 10MB).

**파일 이름이 곧 출력 경로가 된다.** Task 5의 히어로가 `/photos/hero-1080.webp`를 참조하므로, 원본 디렉터리에서 메인 사진 파일명을 **`hero.jpg`**로 맞춰 둔다. 갤러리 사진은 정렬 순서가 곧 노출 순서이므로 `01.jpg`, `02.jpg` … 처럼 번호를 붙인다.

- [ ] **Step 1: sharp 설치와 스크립트 등록**

```bash
npm install -D sharp tsx
```

`package.json` `scripts`에 추가:

```json
"photos": "tsx scripts/optimize-photos.ts"
```

- [ ] **Step 2: scripts/optimize-photos.ts 작성**

```ts
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SRC = process.argv[2]
const OUT_DIR = 'public/photos'
const MANIFEST = 'src/data/gallery.json'
const WIDTHS = [640, 1080, 1620]

if (!SRC) {
  console.error('사용법: npm run photos -- <원본_JPG_디렉터리>')
  process.exit(1)
}

interface GalleryPhoto {
  base: string
  width: number
  height: number
  lqip: string
  alt: string
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const files = (await readdir(SRC))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()

  const manifest: GalleryPhoto[] = []

  for (const file of files) {
    const name = path.parse(file).name
    const input = path.join(SRC, file)
    const meta = await sharp(input).metadata()
    const srcWidth = meta.width ?? 0
    const srcHeight = meta.height ?? 0

    for (const width of WIDTHS) {
      // 원본보다 크게 늘리지 않는다.
      if (width > srcWidth) continue
      await sharp(input)
        .resize({ width })
        .webp({ quality: 78 })
        .toFile(path.join(OUT_DIR, `${name}-${width}.webp`))
    }

    // LQIP — 16px 폭 blur. 인라인 data URI라 추가 요청이 없다.
    const lqipBuffer = await sharp(input)
      .resize({ width: 16 })
      .blur(1)
      .webp({ quality: 40 })
      .toBuffer()

    manifest.push({
      base: `/photos/${name}`,
      width: srcWidth,
      height: srcHeight,
      lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
      alt: '',
    })

    console.log(`  ${file} → ${name}-{${WIDTHS.join(',')}}.webp`)
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`\n${manifest.length}장 처리, ${MANIFEST} 갱신`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 3: wedding.ts가 매니페스트를 읽도록 수정**

```ts
import galleryJson from './gallery.json'
// ...
  gallery: galleryJson as GalleryPhoto[],
```

`tsconfig.json`에 `"resolveJsonModule": true`를 추가한다.

- [ ] **Step 4: 임시 사진으로 동작 확인**

아직 스튜디오 사진이 없으므로 아무 JPG 두세 장을 임시 디렉터리에 넣고 돌린다.

```bash
npm run photos -- ~/Desktop/temp-photos
```

Expected: `public/photos/`에 webp 파일들이 생기고 `src/data/gallery.json`이 채워진다.

- [ ] **Step 5: 산출물 용량 확인**

```bash
du -sh public/photos
```

Expected: 사진 30장 기준 약 10MB 이내. 크게 넘으면 `quality` 값을 낮춘다.

- [ ] **Step 6: 커밋**

```bash
git add scripts/optimize-photos.ts package.json tsconfig.json src/data/wedding.ts src/data/gallery.json public/photos
git commit -m "feat: sharp 기반 사진 최적화 파이프라인 추가"
```

---

### Task 8: 갤러리와 라이트박스

**Files:**
- Create: `src/sections/Gallery.astro`, `src/components/Lightbox.tsx`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `wedding.gallery` (Task 7)
- Produces: `<Lightbox photos={GalleryPhoto[]} client:visible />`

- [ ] **Step 1: Gallery.astro 작성**

3열 정사각 그리드. 사진 장수와 무관하게 동작한다.

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import Lightbox from '../components/Lightbox'
import { wedding } from '../data/wedding'
---
<section class="shell py-14">
  <SectionLabel en="GALLERY" ko="사진첩" />
  <Lightbox photos={wedding.gallery} client:visible />
</section>
```

- [ ] **Step 2: Lightbox.tsx 작성**

**안드로이드 뒤로가기를 반드시 처리한다.** 사진을 연 상태에서 뒤로가기를 눌렀을 때 라이트박스만 닫혀야 하는데, 처리하지 않으면 페이지를 통째로 떠나버린다.

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { GalleryPhoto } from '../data/wedding'

interface Props {
  photos: GalleryPhoto[]
}

export default function Lightbox({ photos }: Props) {
  const [index, setIndex] = useState<number | null>(null)
  const isOpen = index !== null

  const close = useCallback(() => setIndex(null), [])

  // 뒤로가기 = 닫기.
  useEffect(() => {
    if (!isOpen) return
    history.pushState({ lightbox: true }, '')
    const onPop = () => setIndex(null)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // 버튼으로 닫은 경우엔 우리가 쌓은 항목이 남아 있으므로 걷어낸다.
      // 뒤로가기로 닫힌 경우엔 이미 빠져 있어 조건이 false다.
      if (window.history.state?.lightbox) window.history.back()
    }
  }, [isOpen])

  // 배경 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  // 키보드
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') setIndex((i) => (i === null ? i : Math.max(0, i - 1)))
      if (e.key === 'ArrowRight')
        setIndex((i) => (i === null ? i : Math.min(photos.length - 1, i + 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, photos.length, close])

  return (
    <>
      <ul className="grid grid-cols-3 gap-1">
        {photos.map((photo, i) => (
          <li key={photo.base}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block w-full aspect-square overflow-hidden"
              aria-label={`사진 ${i + 1} 크게 보기`}
            >
              <img
                src={`${photo.base}-640.webp`}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
                width={photo.width}
                height={photo.height}
                style={{ backgroundImage: `url(${photo.lqip})`, backgroundSize: 'cover' }}
                className="w-full h-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92"
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
          onClick={close}
        >
          <img
            src={`${photos[index]!.base}-1620.webp`}
            alt={photos[index]!.alt}
            className="max-w-full max-h-[100dvh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="absolute top-3 right-3 w-11 h-11 text-white text-2xl leading-none"
          >
            ×
          </button>

          {index > 0 && (
            <button
              type="button"
              aria-label="이전 사진"
              onClick={(e) => { e.stopPropagation(); setIndex(index - 1) }}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-11 h-16 text-white text-2xl"
            >‹</button>
          )}
          {index < photos.length - 1 && (
            <button
              type="button"
              aria-label="다음 사진"
              onClick={(e) => { e.stopPropagation(); setIndex(index + 1) }}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-16 text-white text-2xl"
            >›</button>
          )}

          <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">
            {index + 1} / {photos.length}
          </p>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: index.astro에 Gallery 추가**

- [ ] **Step 4: 뒤로가기 동작 확인**

`npm run dev` 후 브라우저에서:

1. 사진을 열고 브라우저 뒤로가기 → **라이트박스만 닫히고 페이지는 그대로**여야 한다
2. 사진을 열고 × 버튼으로 닫은 뒤 뒤로가기 → **이전 페이지로 나가야** 한다 (히스토리에 잔여물이 없어야 한다)
3. 사진 여러 장을 좌우로 넘긴 뒤 뒤로가기 → 한 번에 닫혀야 한다

세 가지 모두 통과하지 않으면 다음으로 넘어가지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add src/sections/Gallery.astro src/components/Lightbox.tsx src/pages/index.astro
git commit -m "feat: 갤러리 그리드와 뒤로가기 대응 라이트박스 추가"
```

---

### Task 9: 오시는 길

**Files:**
- Create: `src/sections/Location.astro`
- Modify: `src/pages/index.astro`, `src/data/wedding.ts`

**Interfaces:**
- Consumes: `wedding.venue` (Task 3)

식장이 청량리역 직결이라 **"기차로 오시는 길"을 별도 항목으로 둔다.** 청량리역은 KTX·ITX 정차역이고 전세버스를 타지 않는 지방 하객이 실제로 이 경로를 쓴다.

- [ ] **Step 1: Location.astro 작성**

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import { wedding } from '../data/wedding'

const v = wedding.venue
const mapApps = [
  { name: '카카오맵', href: v.map.kakao },
  { name: '네이버지도', href: v.map.naver },
  { name: '티맵', href: v.map.tmap },
]
const accordions = [
  { title: '지하철 · 버스', body: [v.transit.subway, v.transit.bus] },
  { title: '기차', body: [v.transit.train] },
  { title: '자가용 · 주차', body: [v.transit.car, v.transit.parking] },
]
---
<section class="shell py-14">
  <SectionLabel en="LOCATION" ko="오시는 길" />

  <p class="text-center text-sm leading-loose">
    <strong style="color: var(--ink)">{v.name} {v.hall}</strong><br />
    {v.address}
  </p>

  <img src={v.map.staticImage} alt={`${v.name} 위치 지도`}
       width="960" height="540" loading="lazy" decoding="async"
       class="mt-6 w-full rounded-lg border" style="border-color: var(--line)" />

  <div class="mt-3 grid grid-cols-3 gap-2">
    {mapApps.map((app) => (
      <a href={app.href} target="_blank" rel="noopener noreferrer"
         class="flex items-center justify-center rounded border text-xs"
         style="border-color: var(--line); color: var(--ink)">{app.name}</a>
    ))}
  </div>

  <div class="mt-6 space-y-2">
    {accordions.map((item) => (
      <details class="border rounded-lg" style="border-color: var(--line)">
        <summary class="flex items-center px-4 text-sm cursor-pointer select-none">
          {item.title}
        </summary>
        <div class="px-4 pb-4 text-sm whitespace-pre-line">
          {item.body.filter(Boolean).join('\n\n')}
        </div>
      </details>
    ))}
  </div>

  {v.tel && (
    <a href={`tel:${v.tel}`}
       class="mt-4 flex items-center justify-center rounded border text-sm"
       style="border-color: var(--line); color: var(--ink)">
      식장에 전화하기
    </a>
  )}
</section>
```

- [ ] **Step 2: 정적 지도 이미지 준비**

카카오맵 또는 네이버지도에서 식장 위치 스크린샷을 찍어 `public/photos/map.webp`로 저장한다(폭 960px 권장).

인터랙티브 지도 SDK를 쓰지 않는 이유는 SDK가 200KB를 넘고 초기화가 느린 데 비해, 실제 하객은 지도를 조작하지 않고 지도앱 버튼을 눌러 앱으로 빠져나가기 때문이다.

- [ ] **Step 3: 지도앱 딥링크 URL 채우기**

`wedding.ts`의 `venue.map`에 실제 URL을 넣는다. 각 지도앱에서 식장을 검색해 공유 링크를 복사한다.

- [ ] **Step 4: index.astro에 Location 추가**

- [ ] **Step 5: 실기기에서 딥링크 확인**

**모바일 실기기에서** 세 버튼을 눌러 각 앱이 실제로 열리는지 확인한다. 데스크톱 브라우저에서는 검증되지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add src/sections/Location.astro src/data/wedding.ts public/photos/map.webp src/pages/index.astro
git commit -m "feat: 오시는 길 섹션과 지도앱 딥링크 추가"
```

---

### Task 10: 식사·피로연과 전세버스

**Files:**
- Create: `src/sections/Information.astro`, `src/sections/Shuttle.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `wedding.meal`, `wedding.shuttle` (Task 3), `privateData.phones.shuttle` (Task 3)

- [ ] **Step 1: Information.astro 작성**

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import { wedding } from '../data/wedding'
const { meal } = wedding
---
<section class="shell py-14">
  <SectionLabel en="INFORMATION" ko="식사 안내" />
  <p class="text-center text-sm leading-loose whitespace-pre-line">
    {meal.type}{meal.hours && `\n${meal.hours}`}
  </p>

  {meal.reception && (
    <div class="mt-8 pt-8 border-t text-center" style="border-color: var(--line)">
      <h3 class="font-serif-kr text-base" style="color: var(--ink)">피로연</h3>
      <p class="mt-3 text-sm leading-loose">
        {meal.reception.at}<br />{meal.reception.place}
      </p>
    </div>
  )}
</section>
```

- [ ] **Step 2: Shuttle.astro 작성**

전세버스 담당자 연락처는 개인 번호라 `privateData`에서 온다.

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import { wedding } from '../data/wedding'
import { privateData } from '../data/private'
const { shuttle } = wedding
---
<section class="shell py-14">
  <SectionLabel en="SHUTTLE BUS" ko="전세버스 안내" />
  <p class="text-center text-sm leading-loose">
    {shuttle.departAt}<br />{shuttle.boardingPoint}
  </p>
  <a href={`tel:${privateData.phones.shuttle}`}
     class="mt-6 flex items-center justify-center rounded border text-sm"
     style="border-color: var(--line); color: var(--ink)">
    인솔 담당자에게 전화하기
  </a>
</section>
```

- [ ] **Step 3: index.astro에 두 섹션 추가**

- [ ] **Step 4: 확인**

Run: `npm run dev`
Expected: 두 섹션이 렌더되고, `meal.reception`이 `null`이면 피로연 블록이 나오지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add src/sections/Information.astro src/sections/Shuttle.astro src/pages/index.astro
git commit -m "feat: 식사·피로연과 전세버스 안내 섹션 추가"
```

---

### Task 11: RSVP 폼

**Files:**
- Create: `src/lib/rsvp-contract.ts`, `src/components/RsvpForm.tsx`, `src/sections/Rsvp.astro`
- Modify: `src/pages/index.astro`, `.env`

**Interfaces:**
- Consumes: Worker 계획이 산출한 엔드포인트 URL과 Turnstile **Site key**
- Produces: `RsvpSubmission`, `ValidationError` 타입 (Worker 저장소 `src/contract.ts`와 동일해야 함)

**섹션 위치가 중요하다.** 참석 판단에 필요한 정보(일시·장소·식사·버스)를 모두 준 직후, 계좌 앞에 둔다.

- [ ] **Step 1: 계약 타입 복사**

Worker 저장소의 `src/contract.ts` 내용을 그대로 `src/lib/rsvp-contract.ts`로 복사한다. 두 파일은 항상 같아야 한다.

파일 상단에 주석을 단다:

```ts
// 이 파일은 marriage-invitation-worker 저장소의 src/contract.ts 와 동일해야 한다.
// 한쪽만 고치면 런타임에 조용히 어긋난다.
```

- [ ] **Step 2: .env에 엔드포인트와 Site key 추가**

```
PUBLIC_RSVP_ENDPOINT=https://marriage-invitation-rsvp.<subdomain>.workers.dev
PUBLIC_TURNSTILE_SITE_KEY=<Turnstile Site key>
```

`PUBLIC_` 접두사를 붙이는 이유는 이 두 값이 **공개돼도 되는 값**이고 클라이언트 아일랜드에서 읽어야 하기 때문이다. `WEDDING_PRIVATE`와는 성격이 다르다.

- [ ] **Step 3: RsvpForm.tsx 작성**

에러 처리가 이 컴포넌트의 핵심이다. **실패했는데 성공한 줄 알면 그 사람 몫의 식사가 안 잡힌다.**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Side, ValidationError } from '../lib/rsvp-contract'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'error-callback'?: () => void }) => string
      reset: (id?: string) => void
    }
  }
}

const ENDPOINT = import.meta.env.PUBLIC_RSVP_ENDPOINT as string
const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string
const STORAGE_KEY = 'rsvp-submitted'

type Status = 'idle' | 'sending' | 'done' | 'error'

interface Props {
  /** 예식이 지났으면 폼 대신 마감 안내를 보여준다. */
  closed: boolean
  /** 반복 실패 시 안내할 대체 연락처 */
  fallbackPhone: string
}

export default function RsvpForm({ closed, fallbackPhone }: Props) {
  const [side, setSide] = useState<Side | ''>('')
  const [name, setName] = useState('')
  const [attending, setAttending] = useState<boolean | null>(null)
  const [partySize, setPartySize] = useState(1)
  const [mealCount, setMealCount] = useState(1)
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const [status, setStatus] = useState<Status>('idle')
  const [fieldErrors, setFieldErrors] = useState<ValidationError[]>([])
  const [errorText, setErrorText] = useState('')
  const [failCount, setFailCount] = useState(0)
  const [alreadySent, setAlreadySent] = useState(false)

  const tokenRef = useRef('')
  const widgetRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    setAlreadySent(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  // 참석 인원을 줄이면 식사 인원도 따라 줄인다. 서버가 거부할 조합을 애초에 못 만들게 한다.
  useEffect(() => {
    setMealCount((current) => Math.min(current, partySize))
  }, [partySize])

  // Turnstile 스크립트 로드와 위젯 렌더
  useEffect(() => {
    if (closed) return
    const src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    const existing = document.querySelector(`script[src="${src}"]`)

    const render = () => {
      if (!widgetRef.current || !window.turnstile || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => { tokenRef.current = token },
        'error-callback': () => { tokenRef.current = '' },
      })
    }

    if (existing) {
      render()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = render
    document.head.appendChild(script)
  }, [closed])

  const errorFor = (field: string) => fieldErrors.find((e) => e.field === field)?.message

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('sending')
    setFieldErrors([])
    setErrorText('')

    try {
      const response = await fetch(`${ENDPOINT}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side, name, attending,
          partySize: attending ? partySize : 0,
          mealCount: attending ? mealCount : 0,
          phone: phone || undefined,
          message: message || undefined,
          turnstileToken: tokenRef.current,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        // 입력값은 절대 지우지 않는다. 폼이 비워지면 다시 쓰지 않는다.
        setFieldErrors(data.fields ?? [])
        setErrorText(data.error ?? '전달에 실패했어요. 잠시 후 다시 시도해 주세요.')
        setFailCount((n) => n + 1)
        setStatus('error')
        window.turnstile?.reset(widgetIdRef.current)
        tokenRef.current = ''
        return
      }

      localStorage.setItem(STORAGE_KEY, '1')
      setStatus('done')
    } catch {
      setErrorText('전달에 실패했어요. 통신 상태를 확인하고 다시 시도해 주세요.')
      setFailCount((n) => n + 1)
      setStatus('error')
      window.turnstile?.reset(widgetIdRef.current)
      tokenRef.current = ''
    }
  }

  if (closed) {
    return (
      <p className="text-center text-sm leading-loose font-system">
        참석 여부 접수가 마감되었습니다.
        <br />
        함께해 주셔서 감사합니다.
      </p>
    )
  }

  if (status === 'done') {
    return (
      <div className="text-center text-sm leading-loose font-system">
        <p style={{ color: 'var(--ink)' }}>참석 여부를 전달했습니다. 감사합니다.</p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-4 underline"
          style={{ color: 'var(--muted)' }}
        >
          수정이 필요하면 다시 제출해 주세요
        </button>
      </div>
    )
  }

  const inputClass = 'w-full rounded border px-3 py-2 text-sm font-system'
  const inputStyle = { borderColor: 'var(--line)', background: '#fff', color: 'var(--ink)' }

  return (
    <form onSubmit={submit} className="space-y-4 font-system">
      {alreadySent && (
        <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
          이미 전달해 주셨어요. 내용을 바꾸시려면 다시 제출하시면 됩니다.
        </p>
      )}

      <fieldset>
        <legend className="text-sm mb-2">어느 쪽 하객이신가요?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['groom', 'bride'] as Side[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSide(value)}
              className="rounded border py-2 text-sm"
              style={{
                borderColor: side === value ? 'var(--ink)' : 'var(--line)',
                background: side === value ? 'var(--ink)' : 'transparent',
                color: side === value ? 'var(--bg)' : 'var(--ink)',
              }}
              aria-pressed={side === value}
            >
              {value === 'groom' ? '신랑측' : '신부측'}
            </button>
          ))}
        </div>
        {errorFor('side') && <p className="mt-1 text-xs text-red-700">{errorFor('side')}</p>}
      </fieldset>

      <div>
        <label htmlFor="rsvp-name" className="block text-sm mb-1">성함</label>
        <input id="rsvp-name" value={name} onChange={(e) => setName(e.target.value)}
               maxLength={20} className={inputClass} style={inputStyle} autoComplete="name" />
        {errorFor('name') && <p className="mt-1 text-xs text-red-700">{errorFor('name')}</p>}
      </div>

      <fieldset>
        <legend className="text-sm mb-2">참석하시나요?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setAttending(value)}
              className="rounded border py-2 text-sm"
              style={{
                borderColor: attending === value ? 'var(--ink)' : 'var(--line)',
                background: attending === value ? 'var(--ink)' : 'transparent',
                color: attending === value ? 'var(--bg)' : 'var(--ink)',
              }}
              aria-pressed={attending === value}
            >
              {value ? '참석' : '불참'}
            </button>
          ))}
        </div>
        {errorFor('attending') && (
          <p className="mt-1 text-xs text-red-700">{errorFor('attending')}</p>
        )}
      </fieldset>

      {/* 불참이면 인원을 묻지 않는다. 물으면 이탈한다. */}
      {attending === true && (
        <>
          <div>
            <label htmlFor="rsvp-party" className="block text-sm mb-1">
              본인 포함 총 참석 인원
            </label>
            <input id="rsvp-party" type="number" inputMode="numeric" min={1} max={10}
                   value={partySize}
                   onChange={(e) => setPartySize(Number(e.target.value))}
                   className={inputClass} style={inputStyle} />
            {errorFor('partySize') && (
              <p className="mt-1 text-xs text-red-700">{errorFor('partySize')}</p>
            )}
          </div>

          <div>
            <label htmlFor="rsvp-meal" className="block text-sm mb-1">
              식사하실 인원
            </label>
            <input id="rsvp-meal" type="number" inputMode="numeric" min={0} max={partySize}
                   value={mealCount}
                   onChange={(e) => setMealCount(Number(e.target.value))}
                   className={inputClass} style={inputStyle} />
            {errorFor('mealCount') && (
              <p className="mt-1 text-xs text-red-700">{errorFor('mealCount')}</p>
            )}
          </div>
        </>
      )}

      <div>
        <label htmlFor="rsvp-phone" className="block text-sm mb-1">
          연락처 <span style={{ color: 'var(--muted)' }}>(선택)</span>
        </label>
        <input id="rsvp-phone" type="tel" inputMode="tel" value={phone}
               onChange={(e) => setPhone(e.target.value)}
               className={inputClass} style={inputStyle} autoComplete="tel" />
        {errorFor('phone') && <p className="mt-1 text-xs text-red-700">{errorFor('phone')}</p>}
      </div>

      <div>
        <label htmlFor="rsvp-message" className="block text-sm mb-1">
          전하실 말씀 <span style={{ color: 'var(--muted)' }}>(선택)</span>
        </label>
        <textarea id="rsvp-message" value={message} rows={3} maxLength={500}
                  onChange={(e) => setMessage(e.target.value)}
                  className={inputClass} style={inputStyle} />
        {errorFor('message') && (
          <p className="mt-1 text-xs text-red-700">{errorFor('message')}</p>
        )}
      </div>

      <div ref={widgetRef} className="flex justify-center" />

      {status === 'error' && (
        <div className="rounded border px-3 py-2 text-xs leading-relaxed"
             style={{ borderColor: '#b91c1c', color: '#b91c1c' }}>
          <p>{errorText}</p>
          {/* 막다른 길을 만들지 않는다. */}
          {failCount >= 2 && (
            <p className="mt-2">
              계속 실패한다면 <a href={`sms:${fallbackPhone}`} className="underline">
              문자로 알려주셔도</a> 됩니다.
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={status === 'sending'}
              className="w-full rounded py-3 text-sm disabled:opacity-60"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
        {status === 'sending' ? '전달 중…' : '전달하기'}
      </button>

      <p className="text-center text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        입력하신 정보는 예식 준비 목적으로만 사용하며 예식 후 파기합니다.
      </p>
    </form>
  )
}
```

- [ ] **Step 4: Rsvp.astro 작성**

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import RsvpForm from '../components/RsvpForm'
import { wedding } from '../data/wedding'
import { privateData } from '../data/private'
import { getDdayState } from '../lib/dday'

// 빌드 시점 판정. 예식 후 재배포하면 폼이 마감 안내로 바뀐다.
const closed = getDdayState(wedding.date, Date.now()).phase === 'after'
---
<section class="shell py-14" style="background: #efede7">
  <SectionLabel en="RSVP" ko="참석 여부 전달" />
  <p class="text-center text-sm leading-loose mb-8">
    식사 준비에 참고하고자 하니<br />편하신 방법으로 알려주세요
  </p>
  <RsvpForm closed={closed} fallbackPhone={privateData.phones.groom} client:visible />
</section>
```

- [ ] **Step 5: index.astro에 Rsvp 추가 — 위치 주의**

`<Shuttle />` **다음**, 계좌 섹션 **앞**에 넣는다.

- [ ] **Step 6: 실제 제출 관통 확인**

`npm run dev` 후 브라우저에서 폼을 채워 제출한다.

```bash
# Worker 저장소에서
npx wrangler d1 execute marriage-invitation --remote \
  --command "SELECT id, side, name, attending, party_size, meal_count FROM rsvp ORDER BY id DESC LIMIT 3"
```

Expected: 방금 제출한 건이 보인다.

이어서 **실패 경로**도 확인한다 — 개발자 도구 Network를 오프라인으로 바꾸고 제출한 뒤:

1. 에러 메시지가 뜬다
2. **입력값이 그대로 남아 있다**
3. 두 번째 실패부터 문자 대체 경로가 나타난다

- [ ] **Step 7: 커밋**

```bash
git add src/lib/rsvp-contract.ts src/components/RsvpForm.tsx src/sections/Rsvp.astro src/pages/index.astro
git commit -m "feat: RSVP 폼과 실패 경로 처리 추가"
```

---

### Task 12: 마음 전하는 곳

**Files:**
- Create: `src/sections/Accounts.astro`, `src/components/CopyButton.tsx`, `src/lib/copy.ts`, `test/copy.test.ts`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `privateData.accounts` (Task 3)
- Produces: `copyText(text: string): Promise<boolean>`

**카카오톡 인앱 브라우저에서 Clipboard API가 막힐 수 있다.** 하객 대부분이 카톡 링크로 들어오므로 여기서 복사가 안 되면 곧바로 실사고다. 폴백을 반드시 넣는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/copy.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { copyText } from '../src/lib/copy'

function setup(options: {
  clipboard?: { writeText: () => Promise<void> }
  execCommand?: () => boolean
}) {
  vi.stubGlobal('navigator', { clipboard: options.clipboard })
  vi.stubGlobal('window', { isSecureContext: true })
  vi.stubGlobal('document', {
    createElement: () => ({ style: {}, setAttribute() {}, select() {}, value: '' }),
    body: { appendChild() {}, removeChild() {} },
    execCommand: options.execCommand ?? (() => false),
  })
}

beforeEach(() => vi.unstubAllGlobals())

describe('copyText', () => {
  it('Clipboard API가 되면 true', async () => {
    setup({ clipboard: { writeText: async () => {} } })
    expect(await copyText('123')).toBe(true)
  })

  it('Clipboard API가 없으면 execCommand로 폴백한다', async () => {
    setup({ clipboard: undefined, execCommand: () => true })
    expect(await copyText('123')).toBe(true)
  })

  it('Clipboard API가 던지면 폴백한다', async () => {
    setup({
      clipboard: { writeText: async () => { throw new Error('denied') } },
      execCommand: () => true,
    })
    expect(await copyText('123')).toBe(true)
  })

  it('둘 다 실패하면 false — 호출자가 안내를 띄울 수 있어야 한다', async () => {
    setup({ clipboard: undefined, execCommand: () => false })
    expect(await copyText('123')).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `../src/lib/copy` 모듈 없음

- [ ] **Step 3: src/lib/copy.ts 구현**

```ts
/**
 * 복사 시도. 실패해도 던지지 않고 false를 돌려준다.
 * 카카오톡 인앱 브라우저는 Clipboard API를 막는 경우가 있어 폴백이 필수다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 폴백으로 넘어간다
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: CopyButton.tsx 작성**

두 방법이 다 실패하면 **번호를 직접 선택할 수 있게 노출한다.** 하객을 막다른 길에 두지 않는다.

```tsx
import { useState } from 'react'
import { copyText } from '../lib/copy'

interface Props {
  value: string
  label: string
}

type State = 'idle' | 'copied' | 'failed'

export default function CopyButton({ value, label }: Props) {
  const [state, setState] = useState<State>('idle')

  async function handleClick() {
    const ok = await copyText(value)
    setState(ok ? 'copied' : 'failed')
    if (ok) setTimeout(() => setState('idle'), 2000)
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        className="rounded border px-3 py-1 text-xs"
        style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
        aria-label={`${label} 계좌번호 복사`}
      >
        {state === 'copied' ? '복사됨' : '복사'}
      </button>

      {state === 'failed' && (
        <span className="text-[11px] text-right" style={{ color: 'var(--muted)' }}>
          자동 복사가 안 돼요. 아래 번호를 길게 눌러 복사해 주세요.
          <br />
          <span className="select-all" style={{ color: 'var(--ink)', userSelect: 'all' }}>
            {value}
          </span>
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 6: Accounts.astro 작성**

```astro
---
import SectionLabel from '../components/SectionLabel.astro'
import CopyButton from '../components/CopyButton'
import { privateData } from '../data/private'

const groups = [
  { title: '신랑측 계좌번호', accounts: privateData.accounts.groom },
  { title: '신부측 계좌번호', accounts: privateData.accounts.bride },
]
---
<section class="shell py-14">
  <SectionLabel en="ACCOUNT" ko="마음 전하는 곳" />

  <div class="space-y-2">
    {groups.map((group) => (
      <details class="border rounded-lg" style="border-color: var(--line)">
        <summary class="flex items-center px-4 text-sm cursor-pointer select-none">
          {group.title}
        </summary>
        <ul class="px-4 pb-3">
          {group.accounts.map((account) => (
            <li class="flex items-start justify-between gap-3 py-3 border-t"
                style="border-color: var(--line)">
              <span class="text-sm">
                <span style="color: var(--ink)">{account.bank} {account.number}</span><br />
                <span class="text-xs" style="color: var(--muted)">예금주 {account.holder}</span>
                {account.kakaopay && (
                  <><br /><a href={account.kakaopay} target="_blank" rel="noopener noreferrer"
                     class="text-xs underline" style="color: var(--muted)">카카오페이로 송금</a></>
                )}
              </span>
              <CopyButton value={account.number} label={account.holder} client:visible />
            </li>
          ))}
        </ul>
      </details>
    ))}
  </div>
</section>
```

- [ ] **Step 7: index.astro에 Accounts 추가 (RSVP 다음)**

- [ ] **Step 8: 커밋**

```bash
git add src/lib/copy.ts test/copy.test.ts src/components/CopyButton.tsx src/sections/Accounts.astro src/pages/index.astro
git commit -m "feat: 계좌 안내와 인앱 브라우저 대응 복사 폴백 추가"
```

---

### Task 13: 공유·OG 메타·BGM·푸터

**Files:**
- Create: `src/sections/Share.astro`, `src/sections/Footer.astro`, `src/components/ShareButtons.tsx`, `src/components/BgmToggle.tsx`
- Modify: `src/layouts/Base.astro`, `src/pages/index.astro`, `.env`

**Interfaces:**
- Consumes: `wedding` (Task 3)
- Produces: `<ShareButtons ... client:idle />`, `<BgmToggle src={string} client:idle />`

- [ ] **Step 1: OG 메타를 Base.astro에 추가**

카카오톡 공유 썸네일은 절대 URL이어야 한다. 1200×630 이미지를 `public/photos/og.jpg`로 준비한다.

`Base.astro`의 Props에 `ogImage`를 더하고 `<head>`에 추가한다:

```astro
---
interface Props {
  title: string
  description?: string
  ogImage?: string
}
const { title, description = '', ogImage = '/photos/og.jpg' } = Astro.props
const ogUrl = new URL(ogImage, Astro.site).href
const pageUrl = new URL(Astro.url.pathname, Astro.site).href
---
<meta property="og:type" content="website" />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={ogUrl} />
<meta property="og:url" content={pageUrl} />
<meta name="twitter:card" content="summary_large_image" />
```

- [ ] **Step 2: .env에 카카오 JS 키 추가**

카카오 개발자 콘솔에서 애플리케이션을 만들고 **JavaScript 키**를 받는다.
플랫폼 → Web → 사이트 도메인에 `https://changgi-suhyeon.github.io`를 등록한다.

```
PUBLIC_KAKAO_JS_KEY=<JavaScript 키>
```

- [ ] **Step 3: ShareButtons.tsx 작성**

```tsx
import { useEffect, useState } from 'react'
import { copyText } from '../lib/copy'

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean
      init: (key: string) => void
      Share: { sendDefault: (options: unknown) => void }
    }
  }
}

const KAKAO_KEY = import.meta.env.PUBLIC_KAKAO_JS_KEY as string

interface Props {
  title: string
  description: string
  imageUrl: string
  pageUrl: string
}

export default function ShareButtons({ title, description, imageUrl, pageUrl }: Props) {
  const [kakaoReady, setKakaoReady] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!KAKAO_KEY) return
    const src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js'
    if (document.querySelector(`script[src="${src}"]`)) return

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY)
      setKakaoReady(Boolean(window.Kakao?.isInitialized()))
    }
    document.head.appendChild(script)
  }, [])

  function shareKakao() {
    window.Kakao?.Share.sendDefault({
      objectType: 'feed',
      content: {
        title,
        description,
        imageUrl,
        link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
      },
      buttons: [
        { title: '청첩장 보기', link: { mobileWebUrl: pageUrl, webUrl: pageUrl } },
      ],
    })
  }

  async function copyLink() {
    const ok = await copyText(pageUrl)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 2000)
  }

  const buttonStyle = { borderColor: 'var(--line)', color: 'var(--ink)' }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={shareKakao} disabled={!kakaoReady}
              className="rounded border py-3 text-sm disabled:opacity-50" style={buttonStyle}>
        카카오톡 공유
      </button>
      <button type="button" onClick={copyLink}
              className="rounded border py-3 text-sm" style={buttonStyle}>
        {copied ? '복사됨' : '링크 복사'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: BgmToggle.tsx 작성**

모바일 브라우저가 자동재생을 막으므로 수동 토글이 유일한 방법이다. 기본 off.

```tsx
import { useRef, useState } from 'react'

interface Props {
  src: string
  title: string
}

export default function BgmToggle({ src, title }: Props) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(src)
      audioRef.current.loop = true
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
      return
    }
    // 자동재생 차단으로 실패할 수 있다. 조용히 무시하지 않고 상태를 되돌린다.
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? `${title} 음악 끄기` : `${title} 음악 켜기`}
      aria-pressed={playing}
      className="fixed top-3 right-3 z-40 w-11 h-11 rounded-full border text-sm"
      style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink)' }}
    >
      {playing ? '♪' : '♪̸'}
    </button>
  )
}
```

- [ ] **Step 5: Share.astro와 Footer.astro 작성**

```astro
---
// src/sections/Share.astro
import ShareButtons from '../components/ShareButtons'
import { wedding } from '../data/wedding'

const title = `${wedding.groom.name} · ${wedding.bride.name} 결혼합니다`
const description = `${wedding.venue.name} ${wedding.venue.hall}`
const imageUrl = new URL('/photos/og.jpg', Astro.site).href
const pageUrl = new URL('/', Astro.site).href
---
<section class="shell py-14">
  <ShareButtons title={title} description={description}
                imageUrl={imageUrl} pageUrl={pageUrl} client:idle />
</section>
```

```astro
---
// src/sections/Footer.astro
import { wedding } from '../data/wedding'
const kst = new Date(Date.parse(wedding.date) + 9 * 3600 * 1000)
const dateText = `${kst.getUTCFullYear()}.${kst.getUTCMonth() + 1}.${kst.getUTCDate()}`
---
<footer class="shell py-10 text-center">
  <p class="font-serif-kr text-xs tracking-[0.14em]" style="color: var(--muted)">
    {wedding.groom.name} · {wedding.bride.name} &nbsp;|&nbsp; {dateText}
  </p>
</footer>
```

- [ ] **Step 6: index.astro에 Share, Footer, BgmToggle 추가**

`BgmToggle`은 `wedding.bgm.src`가 있을 때만 렌더한다:

```astro
{wedding.bgm.src && (
  <BgmToggle src={wedding.bgm.src} title={wedding.bgm.title} client:idle />
)}
```

- [ ] **Step 7: 커밋**

```bash
git add src/sections/Share.astro src/sections/Footer.astro src/components/ShareButtons.tsx src/components/BgmToggle.tsx src/layouts/Base.astro src/pages/index.astro
git commit -m "feat: 공유 버튼·OG 메타·BGM 토글·푸터 추가"
```

---

### Task 14: 관리자 페이지

**Files:**
- Create: `src/pages/admin.astro`, `src/components/AdminDashboard.tsx`, `src/lib/csv.ts`, `test/csv.test.ts`

**Interfaces:**
- Consumes: `RsvpRecord`, `RsvpSummary` (Task 11), Worker `GET /rsvp`
- Produces: `toCsv(records: RsvpRecord[]): string`

**페이지는 공개돼 있어도 된다. 보안은 페이지를 숨기는 게 아니라 토큰에서 온다.** 토큰은 저장소에 없고 Worker secret에만 있다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { RsvpRecord } from '../src/lib/rsvp-contract'
import { CSV_BOM, toCsv } from '../src/lib/csv'

const record = (over: Partial<RsvpRecord> & { id: number }): RsvpRecord => ({
  createdAt: '2026-09-01 12:00:00',
  side: 'groom',
  name: '홍길동',
  attending: true,
  partySize: 2,
  mealCount: 2,
  phone: null,
  message: null,
  ...over,
})

describe('toCsv', () => {
  it('BOM으로 시작한다 — 엑셀 한글 깨짐 방지', () => {
    expect(toCsv([])).toMatch(new RegExp(`^${CSV_BOM}`))
  })

  it('헤더 행을 포함한다', () => {
    expect(toCsv([]).split('\n')[0]).toContain('성함')
  })

  it('참석 여부를 한국어로 쓴다', () => {
    const csv = toCsv([record({ id: 1, attending: true })])
    expect(csv).toContain('참석')
  })

  it('쉼표가 든 값을 따옴표로 감싼다', () => {
    const csv = toCsv([record({ id: 1, message: '축하해요, 정말로' })])
    expect(csv).toContain('"축하해요, 정말로"')
  })

  it('따옴표가 든 값을 이스케이프한다', () => {
    const csv = toCsv([record({ id: 1, message: '그가 "축하"라고' })])
    expect(csv).toContain('"그가 ""축하""라고"')
  })

  it('줄바꿈이 든 값을 따옴표로 감싼다', () => {
    const csv = toCsv([record({ id: 1, message: '첫 줄\n둘째 줄' })])
    expect(csv).toContain('"첫 줄\n둘째 줄"')
  })

  it('null은 빈 칸으로 쓴다', () => {
    const csv = toCsv([record({ id: 1, phone: null })])
    expect(csv).not.toContain('null')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `../src/lib/csv` 모듈 없음

- [ ] **Step 3: src/lib/csv.ts 구현**

```ts
import type { RsvpRecord } from './rsvp-contract'

/** 엑셀이 UTF-8로 인식하게 하는 BOM. 없으면 한글이 깨진다. */
export const CSV_BOM = '﻿'

const HEADERS = [
  '제출시각', '구분', '성함', '참석여부', '참석인원', '식사인원', '연락처', '전하실말씀',
]

function escape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(records: RsvpRecord[]): string {
  const rows = records.map((r) =>
    [
      r.createdAt,
      r.side === 'groom' ? '신랑측' : '신부측',
      r.name,
      r.attending ? '참석' : '불참',
      String(r.partySize),
      String(r.mealCount),
      r.phone ?? '',
      r.message ?? '',
    ]
      .map(escape)
      .join(','),
  )

  return CSV_BOM + [HEADERS.join(','), ...rows].join('\n') + '\n'
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: AdminDashboard.tsx 작성**

토큰은 `sessionStorage`에 둔다. `localStorage`가 아닌 이유는 공용 기기에 남지 않게 하기 위해서다.

```tsx
import { useState } from 'react'
import type { RsvpRecord, RsvpSummary } from '../lib/rsvp-contract'
import { toCsv } from '../lib/csv'

const ENDPOINT = import.meta.env.PUBLIC_RSVP_ENDPOINT as string
const TOKEN_KEY = 'rsvp-admin-token'

export default function AdminDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '')
  const [records, setRecords] = useState<RsvpRecord[] | null>(null)
  const [summary, setSummary] = useState<RsvpSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load(event?: React.FormEvent) {
    event?.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${ENDPOINT}/rsvp`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        setError('토큰이 올바르지 않습니다.')
        return
      }
      if (!response.ok) {
        setError(`조회에 실패했습니다 (${response.status})`)
        return
      }
      const data = await response.json()
      setRecords(data.records)
      setSummary(data.summary)
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch {
      setError('통신에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function download() {
    if (!records) return
    const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'rsvp.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  // 같은 (측, 이름)이 여러 번 나오면 표시해준다. 최신 건이 위에 온다.
  const duplicates = new Set<string>()
  const seen = new Set<string>()
  for (const r of records ?? []) {
    const key = `${r.side}|${r.name}`
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }

  return (
    <div className="font-system max-w-3xl mx-auto p-4 text-sm">
      <form onSubmit={load} className="flex gap-2 mb-6">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="관리자 토큰"
          className="flex-1 rounded border px-3 py-2"
          style={{ borderColor: 'var(--line)' }}
          autoComplete="current-password"
        />
        <button type="submit" disabled={loading}
                className="rounded px-4 disabled:opacity-60"
                style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
          {loading ? '조회 중…' : '조회'}
        </button>
      </form>

      {error && <p className="mb-4 text-red-700">{error}</p>}

      {summary && (
        <dl className="grid grid-cols-3 gap-2 mb-6">
          {([
            ['총 응답', summary.total],
            ['참석', summary.attending],
            ['불참', summary.notAttending],
            ['신랑측 인원', summary.groomGuests],
            ['신부측 인원', summary.brideGuests],
            ['식사 인원', summary.totalMeals],
          ] as [string, number][]).map(([label, value]) => (
            <div key={label} className="rounded border p-3 text-center"
                 style={{ borderColor: 'var(--line)' }}>
              <dt className="text-xs" style={{ color: 'var(--muted)' }}>{label}</dt>
              <dd className="text-lg" style={{ color: 'var(--ink)' }}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {records && (
        <>
          <button type="button" onClick={download}
                  className="mb-4 rounded border px-3 py-2"
                  style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
            CSV 다운로드
          </button>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  {['제출', '구분', '성함', '참석', '인원', '식사', '연락처', '말씀'].map((h) => (
                    <th key={h} className="border-b py-2 pr-3 text-xs font-normal whitespace-nowrap"
                        style={{ borderColor: 'var(--line)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const isDup = duplicates.has(`${r.side}|${r.name}`)
                  return (
                    <tr key={r.id} style={isDup ? { background: '#fdf6e3' } : undefined}>
                      <td className="border-b py-2 pr-3 text-xs whitespace-nowrap"
                          style={{ borderColor: 'var(--line)' }}>{r.createdAt}</td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.side === 'groom' ? '신랑측' : '신부측'}</td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.name}{isDup && <span title="중복 제출"> ※</span>}</td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.attending ? '참석' : '불참'}</td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.partySize}</td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.mealCount}</td>
                      <td className="border-b py-2 pr-3 text-xs" style={{ borderColor: 'var(--line)' }}>
                        {r.phone ?? ''}</td>
                      <td className="border-b py-2 text-xs" style={{ borderColor: 'var(--line)' }}>
                        {r.message ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {duplicates.size > 0 && (
            <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              ※ 표시는 같은 이름으로 여러 번 제출된 건입니다. 집계는 가장 최근 건만 반영합니다.
            </p>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: admin.astro 작성**

검색 엔진에 잡힐 이유가 없으므로 `noindex`를 붙인다.

```astro
---
import Base from '../layouts/Base.astro'
import AdminDashboard from '../components/AdminDashboard'
---
<Base title="RSVP 조회">
  <meta name="robots" content="noindex, nofollow" slot="head" />
  <main>
    <AdminDashboard client:only="react" />
  </main>
</Base>
```

`Base.astro`에 `<slot name="head" />`를 `<head>` 안에 추가한다.

`client:only="react"`를 쓰는 이유는 이 컴포넌트가 초기화 시 `sessionStorage`를 읽어 서버 렌더가 불가능하기 때문이다.

- [ ] **Step 7: 실제 조회 확인**

```bash
npm run dev
```

`http://localhost:4321/admin` 에서:

1. 잘못된 토큰 → "토큰이 올바르지 않습니다."
2. 올바른 토큰 → 집계와 목록이 뜬다
3. CSV 다운로드 → **엑셀로 열어 한글이 깨지지 않는지 확인한다.** 이 파일은 식장에 넘길 물건이다

- [ ] **Step 8: 커밋**

```bash
git add src/lib/csv.ts test/csv.test.ts src/components/AdminDashboard.tsx src/pages/admin.astro src/layouts/Base.astro
git commit -m "feat: RSVP 관리자 조회 페이지와 CSV 내보내기 추가"
```

---

### Task 15: RSVP 제출 E2E

**Files:**
- Create: `playwright.config.ts`, `e2e/rsvp.spec.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: Task 11의 RSVP 폼, Worker 저장소의 로컬 `wrangler dev`

**이 테스트의 진짜 목적은 저장소 간 계약 어긋남 탐지다.** 설계 문서 §2.1이 짚었듯 RSVP 요청 타입이 두 저장소에 중복 존재한다. 사이트가 `party_size`를 보내는데 Worker가 `partySize`를 기대하면 아무 데서도 컴파일 오류가 나지 않고 런타임에 400이 뜬다. **제출이 성공한다는 것 자체가 계약이 맞는다는 증거**다.

프로덕션을 건드리지 않기 위해 로컬 Worker를 띄워 검증한다. Turnstile은 Cloudflare가 공개한 "항상 통과" 테스트 키를 쓴다.

- [ ] **Step 1: Playwright 설치**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: playwright.config.ts 작성**

Worker의 `ALLOWED_ORIGIN`은 프로덕션 도메인이라 그대로 두면 로컬 사이트가 403을 받는다. `--var`로 덮어쓴다.

```ts
import { defineConfig } from '@playwright/test'

const SITE = 'http://localhost:4321'
const WORKER = 'http://localhost:8787'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: SITE },
  webServer: [
    {
      // 테스트용 환경변수로 빌드한 뒤 미리보기를 띄운다.
      command:
        'PUBLIC_RSVP_ENDPOINT=' + WORKER +
        ' PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA' +
        ' npm run build && npm run preview -- --port 4321',
      url: SITE,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // 이웃한 Worker 저장소를 로컬로 띄운다. Origin 게이트를 로컬 주소로 바꾼다.
      command:
        'cd ../marriage-invitation-worker && npx wrangler dev --port 8787' +
        ' --var ALLOWED_ORIGIN:' + SITE,
      url: WORKER + '/rsvp',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
```

`package.json`에 추가:

```json
"e2e": "playwright test"
```

- [ ] **Step 3: .gitignore에 산출물 추가**

```
test-results/
playwright-report/
.playwright/
```

- [ ] **Step 4: e2e/rsvp.spec.ts 작성**

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: '참석 여부 전달' }).scrollIntoViewIfNeeded()
})

test('참석 제출이 성공하면 확인 문구가 나온다', async ({ page }) => {
  await page.getByRole('button', { name: '신랑측' }).click()
  await page.getByLabel('성함').fill('테스트하객')
  await page.getByRole('button', { name: '참석', exact: true }).click()
  await page.getByLabel('본인 포함 총 참석 인원').fill('2')
  await page.getByLabel('식사하실 인원').fill('2')

  // Turnstile 테스트 키는 자동 통과하지만 토큰 발급에 잠깐 걸린다.
  await expect(page.locator('iframe[src*="challenges.cloudflare.com"]')).toBeVisible()
  await page.waitForTimeout(2000)

  await page.getByRole('button', { name: '전달하기' }).click()

  // 이 문구가 뜬다는 건 Worker가 200을 줬다는 뜻 = 두 저장소의 계약이 일치한다.
  await expect(page.getByText('참석 여부를 전달했습니다')).toBeVisible({ timeout: 15_000 })
})

test('불참을 고르면 인원 입력이 사라진다', async ({ page }) => {
  await page.getByRole('button', { name: '참석', exact: true }).click()
  await expect(page.getByLabel('본인 포함 총 참석 인원')).toBeVisible()

  await page.getByRole('button', { name: '불참' }).click()
  await expect(page.getByLabel('본인 포함 총 참석 인원')).toBeHidden()
  await expect(page.getByLabel('식사하실 인원')).toBeHidden()
})

test('참석 인원을 줄이면 식사 인원이 따라 줄어든다', async ({ page }) => {
  await page.getByRole('button', { name: '참석', exact: true }).click()
  await page.getByLabel('본인 포함 총 참석 인원').fill('5')
  await page.getByLabel('식사하실 인원').fill('5')
  await page.getByLabel('본인 포함 총 참석 인원').fill('2')

  await expect(page.getByLabel('식사하실 인원')).toHaveValue('2')
})

test('성함 없이 제출하면 서버 검증 오류가 인라인으로 뜬다', async ({ page }) => {
  await page.getByRole('button', { name: '신랑측' }).click()
  await page.getByRole('button', { name: '참석', exact: true }).click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: '전달하기' }).click()

  await expect(page.getByText('성함을 입력해 주세요.')).toBeVisible({ timeout: 15_000 })
})

test('제출 실패해도 입력값이 남는다', async ({ page }) => {
  await page.getByRole('button', { name: '신랑측' }).click()
  await page.getByLabel('성함').fill('유지되어야함')
  await page.getByRole('button', { name: '참석', exact: true }).click()

  // 네트워크를 끊어 전송을 실패시킨다.
  await page.route('**/rsvp', (route) => route.abort())
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: '전달하기' }).click()

  await expect(page.getByText('전달에 실패했어요')).toBeVisible()
  // 폼이 비워지면 하객은 다시 쓰지 않는다.
  await expect(page.getByLabel('성함')).toHaveValue('유지되어야함')
})
```

- [ ] **Step 5: E2E 실행**

Worker 저장소에 `.dev.vars`가 있어야 한다(Worker 계획 Task 1 Step 8에서 만든 파일). 없으면 `.dev.vars.example`을 복사한다.

```bash
npm run e2e
```

Expected: 5개 테스트 전부 통과

**첫 테스트가 400으로 실패하면 계약이 어긋난 것이다.** 브라우저 개발자 도구 대신 Worker 응답 본문의 `fields` 배열을 보면 어느 필드인지 바로 나온다.

- [ ] **Step 6: E2E는 CI에 넣지 않는다는 점 기록**

`.github/workflows/deploy.yml`의 `npm test`는 vitest만 돈다. E2E는 이웃 저장소가 필요해 CI에서 돌릴 수 없다.

`README.md`에 적는다:

```markdown
## E2E

두 저장소의 RSVP 계약이 어긋나지 않았는지 확인한다. 로컬에서만 돈다
(이웃한 marriage-invitation-worker 저장소를 함께 띄우기 때문).

    npm run e2e

Worker 코드나 사이트의 RSVP 폼을 고친 뒤에는 반드시 실행한다.
```

- [ ] **Step 7: 커밋**

```bash
git add playwright.config.ts e2e package.json .gitignore README.md
git commit -m "test: 저장소 간 RSVP 계약을 검증하는 E2E 추가"
```

---

### Task 16: 폰트 서브셋과 최종 점검

**Files:**
- Create: `scripts/subset-fonts.ts`
- Modify: `package.json`, `README.md`

**Interfaces:**
- Consumes: 완성된 사이트의 텍스트

**청첩장은 화면에 나올 글자가 빌드 시점에 전부 확정된다.** 그래서 완전 서브셋이 가능하다. 한글 웹폰트 통짜 300~400KB가 20~50KB로 떨어진다.

**단, RSVP 폼과 `/admin`은 제외한다.** 하객이 입력하는 이름에는 서브셋에 없는 글자가 있을 수 있다. 두 곳은 `--font-system`을 쓰도록 이미 만들어 두었다 — 이 태스크에서 그게 지켜지는지 확인한다.

- [ ] **Step 1: 서브셋 도구 설치**

```bash
npm install -D subset-font
```

- [ ] **Step 2: scripts/subset-fonts.ts 작성**

빌드된 `dist/`의 HTML에서 실제로 쓰인 글자를 모아 서브셋한다.

```ts
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import subsetFont from 'subset-font'

const DIST = 'dist'
const FONT_DIR = 'public/fonts'
const OUT_DIR = 'dist/fonts'

// 관리자 페이지는 서브셋 대상 텍스트에서 제외한다 — 시스템 폰트를 쓴다.
const EXCLUDE = ['admin']

async function collectText(dir: string): Promise<string> {
  let text = ''
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDE.includes(entry.name)) continue
      text += await collectText(full)
    } else if (entry.name.endsWith('.html')) {
      text += await readFile(full, 'utf8')
    }
  }
  return text
}

async function main() {
  const html = await collectText(DIST)
  // 태그를 걷어내고 남은 글자만 쓴다.
  const visible = html.replace(/<[^>]*>/g, ' ')
  const chars = [...new Set(visible)].join('')

  for (const file of await readdir(FONT_DIR)) {
    if (!file.endsWith('.woff2')) continue
    const original = await readFile(path.join(FONT_DIR, file))
    const subset = await subsetFont(original, chars, { targetFormat: 'woff2' })
    await writeFile(path.join(OUT_DIR, file), subset)
    const before = (original.length / 1024).toFixed(0)
    const after = (subset.length / 1024).toFixed(0)
    console.log(`  ${file}: ${before}KB → ${after}KB`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

`package.json`에 추가한다:

```json
"build": "astro build && tsx scripts/subset-fonts.ts"
```

- [ ] **Step 3: 서브셋 결과 확인**

```bash
npm run build
```

Expected: 각 폰트가 20~60KB 수준으로 줄어든다. 줄지 않으면 `chars`가 제대로 수집되지 않은 것이다.

- [ ] **Step 4: 서브셋 후에도 글자가 안 깨지는지 확인**

```bash
npm run preview
```

전체 페이지를 스크롤하며 **네모 상자(tofu)로 깨진 글자가 없는지** 본다. 특히 한자(`菊`), 특수문자(`·`, `♪`), 숫자를 확인한다.

`/admin`에서 아무 한글이나 입력해 **깨지지 않는지** 확인한다. 깨지면 `--font-system`이 적용되지 않은 것이다.

- [ ] **Step 5: Lighthouse 측정**

```bash
npx lighthouse http://localhost:4321 --preset=desktop --view
```

목표: Performance 95+, Accessibility 95+.
Accessibility가 낮으면 대비나 라벨 문제이므로 반드시 고친다. 어른 하객이 실제로 겪을 문제다.

- [ ] **Step 6: 실기기 확인**

**카카오톡 인앱 브라우저가 실질적 주력 브라우저다.** 하객 대부분이 카톡 링크로 진입한다.

배포 후 자신에게 카톡으로 링크를 보내고 그 안에서 열어 확인한다:

- [ ] 계좌 복사가 동작한다 (안 되면 폴백 안내가 뜨고 번호를 길게 눌러 선택할 수 있다)
- [ ] RSVP 제출이 성공한다
- [ ] 지도앱 3종 딥링크가 앱을 연다
- [ ] 전화·문자 링크가 동작한다
- [ ] 갤러리 라이트박스에서 뒤로가기가 라이트박스만 닫는다
- [ ] 폰트가 깨지지 않는다

그 외 iOS Safari, 안드로이드 크롬, **강제 다크 모드 ON** 상태에서도 확인한다.
강제 다크에서 색이 반전되면 `color-scheme: light`가 적용되지 않은 것이다.

- [ ] **Step 7: 카카오 OG 캐시 초기화**

카카오 스크래퍼는 한 번 긁은 결과를 캐시한다. 이미지를 바꿔도 옛 것이 계속 나가는 사고가 흔하다.

카카오 개발자 콘솔 → 도구 → 소셜 → 캐시 초기화를 실행한 뒤, **실제로 자신에게 카톡으로 보내 썸네일을 확인한다.**

- [ ] **Step 8: README 갱신과 커밋**

`README.md`에 사진 교체 방법과 배포 절차를 적는다.

```bash
git add scripts/subset-fonts.ts package.json README.md
git commit -m "perf: 사용 글자만 남기는 폰트 서브셋 빌드 단계 추가"
git push origin main
```

---

## 완료 조건

- [ ] `npm test` 전체 통과 (private 가드 · D-day · copy · csv)
- [ ] `npm run e2e` 5개 통과 — 두 저장소의 RSVP 계약이 일치한다는 증거
- [ ] `npm run typecheck` 오류 없음
- [ ] `env -u WEDDING_PRIVATE npm run build` 가 **실패**한다
- [ ] `https://changgi-suhyeon.github.io/` 에서 11개 섹션이 모두 렌더된다
- [ ] 카카오톡 인앱 브라우저 확인 6항목 전부 통과
- [ ] Lighthouse Performance 95+, Accessibility 95+
- [ ] 설계 문서 §9 런칭 체크리스트 15항목 전부 완료

## 미결 콘텐츠 (값만 채우면 되는 것들)

전부 `wedding.ts` 또는 `WEDDING_PRIVATE`에서 채운다. 코드 변경이 필요 없다.

| 항목 | 위치 |
|---|---|
| 신랑·신부·혼주 성함, 인사글 | `wedding.ts` |
| 대중교통·기차·자가용·주차 안내 | `wedding.ts` |
| 식사 형태, 피로연 유무 | `wedding.ts` |
| 전세버스 출발 시각·승차 장소 | `wedding.ts` |
| 지도앱 3종 딥링크, 정적 지도 이미지 | `wedding.ts` + `public/photos/map.webp` |
| BGM 음원 (로열티 프리) | `wedding.ts` + `public/` |
| 갤러리 사진 | `npm run photos -- <원본_디렉터리>` |
| 개인 휴대폰 7개, 계좌 정보 | `WEDDING_PRIVATE` |
