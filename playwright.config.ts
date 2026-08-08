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
      //
      // ASTRO_PREVIEW_BACKGROUND=1 은 이름이 거꾸로 읽힌다 — "백그라운드로 띄워라"가 아니라
      // "나는 이미 그 백그라운드 프로세스다"라는 뜻이다. astro preview는 에이전트 런타임을
      // 감지하면(CLAUDECODE/AI_AGENT 환경변수 → am-i-vibing) 스스로 데몬으로 분리되고
      // 포그라운드 프로세스는 1초 만에 종료한다. 그러면 Playwright가
      // "Process from config.webServer exited early"로 죽는다. 이 변수를 세우면
      // 감지 분기를 건너뛰고 정상적인 blocking 서버로 돈다. 지우지 말 것.
      // (astro/dist/cli/preview/index.js: `!process.env.ASTRO_PREVIEW_BACKGROUND && isRunByAgent()`)
      //
      // 앞의 `npx astro preview stop`은 이전 실행이 남긴 데몬을 치운다. 멱등이라
      // 띄워진 게 없으면 그냥 넘어간다.
      command:
        'npx astro preview stop && ' +
        'PUBLIC_RSVP_ENDPOINT=' + WORKER +
        ' PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA' +
        ' npm run build && ASTRO_PREVIEW_BACKGROUND=1 npm run preview -- --port 4321',
      url: SITE,
      // 재사용하면 위 command 전체가 통째로 스킵된다 — npm run build 포함. 그러면
      // 이 스펙은 지금 디스크에 있는 코드가 아니라 이전 실행이 남긴 dist/를 테스트한다.
      // 계약 어긋남을 잡는 것이 이 스펙의 유일한 목적이므로, 낡은 산출물을 검사하고
      // 초록을 보고하는 것은 실패보다 나쁘다. E2E는 CI에서 안 도니 재사용 이득도 없다.
      reuseExistingServer: false,
      // Playwright의 webServer stdout 기본값은 'ignore'다. 그대로 두면 빌드가 실제로
      // 돌았는지를 실행 로그에서 확인할 방법이 없다 — README가 요구하는 "빌드 출력이
      // 찍혔는지 확인하라"가 성립하려면 이 줄이 있어야 한다.
      stdout: 'pipe',
      timeout: 120_000,
    },
    {
      // 이웃한 Worker 저장소를 로컬로 띄운다. Origin 게이트를 로컬 주소로 바꾼다.
      // wrangler dev는 기본이 로컬 모드라 miniflare 로컬 D1을 쓴다 — 프로덕션 D1은 건드리지 않는다.
      command:
        'cd ../marriage-invitation-worker && npx wrangler dev --port 8787' +
        ' --var ALLOWED_ORIGIN:' + SITE,
      url: WORKER + '/rsvp',
      // 위와 같은 이유. 남아 있던 workerd를 재사용하면 계약의 Worker 쪽 절반이
      // 몇 시간 전 빌드로 굳는다 — 양쪽이 동시에 낡을 수 있다.
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
