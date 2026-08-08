import { expect, test } from '@playwright/test'

// 이 회귀는 프로덕션 빌드에서만 재현된다. astro dev는 요청마다 SSR을 다시 하므로
// 서버 렌더와 클라이언트 첫 렌더의 시각이 붙어 있어 증상이 숨는다. 반면 정적 빌드는
// astro build가 '빌드 시각'에 한 번 렌더한 HTML을 몇 달 뒤 하객에게 그대로 전달한다.
// Countdown의 초기 state를 Date.now()로 잡던 시절엔 빌드 시각의 남은 시간이 HTML에
// 박제돼 하객 브라우저의 첫 렌더와 어긋났고, React가 하이드레이션 실패를 던졌다
// (프로덕션에선 Minified React error #418).
//
// test/countdown.test.ts가 "서버 렌더는 시각에 의존하지 않는다"는 계약을 지키고,
// 이 스펙은 그 계약이 실제 브라우저에서 지켜지는지를 확인한다.
test.describe('하이드레이션', () => {
  test('프로덕션 빌드에서 React 하이드레이션 오류가 나지 않는다', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`)
    })

    await page.goto('/')

    // Countdown은 client:visible이라 뷰포트에 들어와야 하이드레이션이 시작된다.
    // 스크롤하지 않으면 아일랜드가 깨어나지 않아 "오류 없음"이 무의미해진다.
    // 섹션 라벨이 아니라 아일랜드 자체를 뷰포트에 넣어야 한다 — 라벨만 맞추면
    // 섹션 아래쪽의 카운트다운은 화면 밖에 남아 끝내 깨어나지 않는다.
    const section = page.locator('section').filter({ hasText: 'WEDDING DAY' })
    const countdownIsland = section.locator('astro-island')
    await countdownIsland.scrollIntoViewIfNeeded()

    // 하이드레이션이 실제로 끝날 때까지 기다린다. 이 대기가 없으면 오류가 기록되기
    // 전에 단언이 실행돼 "오류 없음"이 거짓으로 통과한다(실측으로 확인한 함정이다).
    // Astro는 아일랜드를 깨운 뒤 astro-island에서 ssr 속성을 지운다.
    await expect(section.locator('astro-island[ssr]')).toHaveCount(0, { timeout: 15_000 })

    // ssr 속성이 지워졌다고 React가 커밋까지 마친 것은 아니다. 예식 전이라면 1초
    // 타이머가 숫자를 갱신하므로, 텍스트가 바뀌는 것을 커밋 완료 신호로 쓴다.
    // 예식 당일·이후에는 타일 대신 고정 문구가 그려져 바뀔 것이 없으므로 건너뛴다.
    const initial = await countdownIsland.innerText()
    if (initial.includes('SEC')) {
      await expect(async () => {
        expect(await countdownIsland.innerText()).not.toBe(initial)
      }).toPass({ timeout: 15_000 })
    }

    // 예식 전이라면 자리표시자가 실제 숫자로 바뀌어 있어야 한다.
    await expect(page.getByText('--', { exact: true })).toHaveCount(0)

    expect(errors.filter((e) => /#(418|423|425)\b|hydrat/i.test(e))).toEqual([])
  })
})
