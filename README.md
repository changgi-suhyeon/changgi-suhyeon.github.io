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
