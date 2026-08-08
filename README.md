# 모바일 청첩장

2026년 10월 31일(토) 예식 모바일 청첩장. GitHub Pages 유저 페이지로 루트 경로에 배포된다.

- **사이트** — https://changgi-suhyeon.github.io/
- **설계 문서** — [docs/superpowers/specs/2026-08-08-mobile-wedding-invitation-design.md](docs/superpowers/specs/2026-08-08-mobile-wedding-invitation-design.md)
- **RSVP API** — `marriage-invitation-worker` (private)

## 스택

Astro · React 아일랜드 · shadcn/ui (Base UI) · Cloudflare Workers + D1 + Turnstile

기본 JS 0으로 렌더하고, 상태나 브라우저 API가 필요한 것만 아일랜드로 하이드레이션한다.
경계는 설계 문서 §3.3 참조.

## 콘텐츠 수정

예식 정보는 전부 `src/data/wedding.ts` 한 파일에 있다. 날짜·장소·계좌·교통 등을
바꿀 때 다른 파일을 건드릴 필요가 없다.

## E2E

두 저장소의 RSVP 계약이 어긋나지 않았는지 확인한다. RSVP 요청 타입이
`marriage-invitation-worker`의 `src/contract.ts`와 이 저장소의 `src/lib/rsvp-contract.ts`에
중복 존재해서, 한쪽만 고치면 컴파일 오류 없이 런타임 400으로만 드러난다. 로컬에서만 돈다
(이웃한 `marriage-invitation-worker` 저장소를 로컬 `wrangler dev`로 함께 띄우기 때문에
GitHub Actions에서는 실행할 수 없다 — `.github/workflows/deploy.yml`의 `npm test`는
vitest만 돈다).

    npm run e2e

사전 조건: `marriage-invitation-worker`가 이 저장소와 형제 디렉터리(`../marriage-invitation-worker`)에
있어야 하고, 그 안에 `.dev.vars`가 있어야 한다(없으면 `.dev.vars.example`을 복사). `wrangler dev`는
기본이 로컬 모드라 로컬 miniflare D1을 쓴다 — 프로덕션 D1에는 아무것도 쌓이지 않는다.

Worker 코드나 사이트의 RSVP 폼을 고친 뒤에는 반드시 실행한다.
