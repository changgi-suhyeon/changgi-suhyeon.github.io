# 모바일 청첩장

2026년 10월 31일(토) 예식 모바일 청첩장. GitHub Pages 유저 페이지로 루트 경로에 배포된다.

- **사이트** — https://changgi-suhyeon.github.io/
- **설계 문서** — [docs/superpowers/specs/2026-08-08-mobile-wedding-invitation-design.md](docs/superpowers/specs/2026-08-08-mobile-wedding-invitation-design.md)
- **RSVP API** — `marriage-invitation-worker` (private)

## 스택

Astro · React 아일랜드 · shadcn/ui (Base UI) · Cloudflare Workers + D1

기본 JS 0으로 렌더하고, 상태나 브라우저 API가 필요한 것만 아일랜드로 하이드레이션한다.
경계는 설계 문서 §3.3 참조.

## 콘텐츠 수정

예식 정보는 전부 `src/data/wedding.ts` 한 파일에 있다. 날짜·장소·계좌·교통 등을
바꿀 때 다른 파일을 건드릴 필요가 없다. 휴대폰 번호·계좌 정보는 `WEDDING_PRIVATE`
환경변수(GitHub Secrets)로 따로 관리한다.

## 사진 교체

    npm run photos -- <원본_JPG_또는_PNG_디렉터리>

**원본 디렉터리는 반드시 이 저장소 바깥에 둔다.** 이 저장소는 public이고 한 번 커밋된
파일은 히스토리에서 지울 수 없다 — 원본 사진이 들어가면 되돌릴 방법이 없다.
(실수를 대비해 `.gitignore`가 `originals/`·`raw/` 등 흔한 이름과 카메라 원본 포맷을
막아두었지만, 이름이 다르면 걸리지 않는다.)

히어로와 갤러리 사진을 한 디렉터리에 모아 한 번만 돌린다. `hero.jpg`(또는 `.png`)는
히어로 배경으로, 나머지는 갤러리 순서대로(파일명 정렬 순) 처리된다. 실행하면:

- `public/photos/`에 반응형 webp(640/1080/1620w)가 생성된다.
- `src/data/gallery.json`이 통째로 덮어써진다 — 매 실행마다 갤러리 목록 전체가 새로 만들어지므로,
  갤러리에 남기고 싶은 사진은 항상 같은 디렉터리에 다 같이 넣고 돌려야 한다.
- 생성된 `alt` 값은 빈 문자열이다. `gallery.json`을 열어 각 사진에 대체 텍스트를 채워 넣는다.

지도 스크린샷(`public/photos/map.webp`)은 이 스크립트 대상이 아니다 — 직접 캡처해 같은 경로에 덮어쓴다.

## 배포

`main`에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 `npm test` →
`npm run build` → GitHub Pages 업로드를 자동으로 수행한다. `npm run build`는
`astro build` 뒤에 `scripts/subset-fonts.ts`를 이어서 돌려, 실제 빌드된 HTML에 쓰인
글자만 남긴 서브셋 폰트를 `dist/fonts/`에 만든다(아래 "폰트 서브셋" 참고). 수동 배포는 없다 —
`workflow_dispatch`로 Actions 탭에서 재실행할 수는 있다.

배포 후 확인할 것:

- Actions 탭에서 빌드 로그에 서브셋 로그(`  GowunBatang-Bold.woff2: NNNKB → NNKB` 등)가 찍혔는지.
- 카카오톡으로 링크를 보내 인앱 브라우저에서 열어본다. 썸네일이 갱신되지 않으면
  카카오 개발자 콘솔 → 도구 → 소셜 → 캐시 초기화가 필요하다(카카오 스크래퍼가 OG 이미지를 캐시한다).

## 폰트 서브셋

한글 청첩장은 화면에 나올 글자가 빌드 시점에 전부 확정되므로 완전 서브셋이 가능하다.
`public/fonts/`의 전체 폰트(4개, 총 2.5MB)는 원본으로 그대로 남겨두고, `npm run build`가
`astro build`로 나온 `dist/`의 모든 HTML(`/admin` 제외)에서 실제 쓰인 글자만 모아
`dist/fonts/`에 20~40KB 수준의 서브셋을 새로 만든다. `/admin`과 RSVP 폼은 서브셋 대신
`--font-system`(OS 기본 폰트)을 쓴다 — 하객이 입력하는 이름에는 서브셋에 없는 글자가
있을 수 있기 때문이다.

**주의:** `wedding.ts`의 이름·인사말·교통정보 등이 비어 있는 채로 빌드하면, 그 글자들은
서브셋에 없다. 값을 채운 뒤 다시 빌드(재배포)하면 `npm run build`가 서브셋도 함께
다시 만들기 때문에 자동으로 반영된다 — 값을 채운 뒤에는 반드시 재배포가 필요하다.

## RSVP 봇 방어

Turnstile은 제거했다 — 어르신 하객이 폼에 뜬 보안 위젯 자체에 거부감을 느낀다는
피드백 때문이다. 대신 하객에게 마찰이 0인 수단만 쓴다: 허니팟 필드, 제출 소요시간
3초 하한, Origin 게이트, 레이트리밋 두 창(10분/20건 · 1분/5건). 자세한 것은
`marriage-invitation-worker`의 README 참고.

허니팟 입력칸의 `name`은 **표준 autofill 토큰이면 안 된다.** `company`나 `nickname`을
쓰면 브라우저 자동완성이 값을 채워 진짜 하객이 봇으로 몰린다. 지금은 `rsvp-extra`다.

## E2E

두 저장소의 RSVP 계약이 어긋나지 않았는지 확인한다. RSVP 요청 타입이
`marriage-invitation-worker`의 `src/contract.ts`와 이 저장소의 `src/lib/rsvp-contract.ts`에
중복 존재해서, 한쪽만 고치면 컴파일 오류 없이 런타임 400으로만 드러난다. 로컬에서만 돈다
(이웃한 `marriage-invitation-worker` 저장소를 로컬 `wrangler dev`로 함께 띄우기 때문에
GitHub Actions에서는 실행할 수 없다 — `.github/workflows/deploy.yml`의 `npm test`는
vitest만 돈다).

    npm run e2e

**초록이 나왔다면 로그에 빌드 출력이 찍혔는지 반드시 확인한다.** 빌드가 돌지 않았다면 그 실행은
지금 코드가 아니라 이전 실행이 남긴 `dist/`를 검사한 것이고, 계약이 어긋나도 초록이 나온다.

사전 조건: `marriage-invitation-worker`가 이 저장소와 형제 디렉터리(`../marriage-invitation-worker`)에
있어야 하고, 그 안에 `.dev.vars`가 있어야 한다(없으면 `.dev.vars.example`을 복사). `wrangler dev`는
기본이 로컬 모드라 로컬 miniflare D1을 쓴다 — 프로덕션 D1에는 아무것도 쌓이지 않는다.

Worker 코드나 사이트의 RSVP 폼을 고친 뒤에는 반드시 실행한다.
