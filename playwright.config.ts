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
      // wrangler dev는 기본이 로컬 모드라 miniflare 로컬 D1을 쓴다 — 프로덕션 D1은 건드리지 않는다.
      command:
        'cd ../marriage-invitation-worker && npx wrangler dev --port 8787' +
        ' --var ALLOWED_ORIGIN:' + SITE,
      url: WORKER + '/rsvp',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
