import { expect, test, type Page } from '@playwright/test'

// 이 스펙의 진짜 목적은 저장소 간 계약 어긋남 탐지다. RSVP 요청 타입이
// marriage-invitation-worker의 src/contract.ts 와 사이트의 src/lib/rsvp-contract.ts에
// 중복 존재한다. 사이트가 `party_size`를 보내는데 Worker가 `partySize`를 기대하면
// 아무 데서도 컴파일 오류가 나지 않고 런타임에 400만 뜬다.
// 첫 테스트("참석 제출이 성공하면...")가 통과한다는 것 자체가 두 저장소의 계약이
// 일치한다는 증거다. 400으로 실패하면 Worker 응답의 fields 배열로 어느 필드인지 알 수 있다.

// 라이트박스 사진 버튼은 `client:visible` 아일랜드라 SSR된 HTML에는 곧바로 존재하지만,
// React 이벤트 리스너가 붙기까지(청크 로드+하이드레이션) 수백 ms가 걸린다. Playwright의
// click()은 DOM 액션 가능 여부만 확인하고 하이드레이션 완료를 기다리지 않으므로, 클릭이
// 리스너가 붙기 전에 발생하면 조용히 씹힌다. 열릴 때까지 클릭을 재시도한다.
async function openLightbox(page: Page, buttonName: string) {
  const dialog = page.getByRole('dialog', { name: '사진 크게 보기' })
  await expect(async () => {
    // 하이드레이션 전 클릭은 리스너가 없어 조용히 사라진다 — 짧은 타임아웃으로
    // 다이얼로그가 덮고 있어 클릭이 막히는 경우에도 빠르게 다음 시도로 넘어간다.
    await page.getByRole('button', { name: buttonName }).click({ timeout: 1000 })
    await expect(dialog).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
}

test.describe('RSVP 제출', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('heading', { name: '참석 여부 전달' }).scrollIntoViewIfNeeded()
  })

  test('참석 제출이 성공하면 확인 문구가 나온다', async ({ page }) => {
    await page.getByRole('button', { name: '신랑측' }).click()
    await page.getByLabel('성함').fill('테스트하객')
    await page.getByRole('button', { name: '참석', exact: true }).click()
    await page.getByRole('button', { name: '참석 인원 한 명 늘리기' }).click()   // 1 → 2
    await expect(page.getByLabel('참석 인원', { exact: true })).toHaveText('2')
    await expect(page.getByLabel('식사 인원', { exact: true })).toHaveText('2')   // 클램프가 따라 올린 값이 아니라 초기값 유지

    // 서버는 폼이 뜬 뒤 3초가 지나야 사람으로 본다(허니팟과 함께 Turnstile을 대신하는
    // 봇 방어). 이 대기가 없으면 자동화가 사람보다 빨라 400을 받고, 그것이 계약 불일치로
    // 오인된다 — 이 스펙이 잡으려는 것과 전혀 다른 이유의 빨간불이다.
    await page.waitForTimeout(3200)

    await page.getByRole('button', { name: '전달하기' }).click()

    // 이 문구가 뜬다는 건 Worker가 200을 줬다는 뜻 = 두 저장소의 계약이 일치한다.
    await expect(page.getByText('참석 여부를 전달했습니다')).toBeVisible({ timeout: 15_000 })
  })

  test('불참을 고르면 인원 선택이 사라진다', async ({ page }) => {
    await page.getByRole('button', { name: '참석', exact: true }).click()
    await expect(page.getByLabel('참석 인원', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '불참' }).click()
    await expect(page.getByLabel('참석 인원', { exact: true })).toBeHidden()
    await expect(page.getByLabel('식사 인원', { exact: true })).toBeHidden()
  })

  test('참석 인원을 줄이면 식사 인원이 따라 줄어든다', async ({ page }) => {
    await page.getByRole('button', { name: '참석', exact: true }).click()
    const partyUp = page.getByRole('button', { name: '참석 인원 한 명 늘리기' })
    const partyDown = page.getByRole('button', { name: '참석 인원 한 명 줄이기' })
    const mealUp = page.getByRole('button', { name: '식사 인원 한 명 늘리기' })

    for (let i = 0; i < 4; i++) await partyUp.click()   // 1 → 5
    for (let i = 0; i < 4; i++) await mealUp.click()    // 1 → 5
    await expect(page.getByLabel('식사 인원', { exact: true })).toHaveText('5')

    for (let i = 0; i < 3; i++) await partyDown.click() // 5 → 2

    // 이 정방향 단언이 없으면 클램프를 통째로 지워도 테스트가 통과한다.
    await expect(page.getByLabel('식사 인원', { exact: true })).toHaveText('2')
  })

  // 예전에는 자유 입력이라 하객이 칸을 비우는 찰나에 Number('')가 0이 되어 식사 인원이
  // 0으로 굳었다(F4). 서버는 0 <= 0 <= n이라 정상 수락하므로 '참석 3명 · 식사 0명'이
  // 조용히 저장됐다. 스테퍼는 그 상태를 만들 방법 자체를 없앤다 — 아래 두 단언이
  // 그 성질을 지킨다. 자유 입력으로 되돌리면 이 테스트가 먼저 깨진다.
  test('참석 인원은 1 미만으로, 식사 인원은 참석 인원 위로 갈 수 없다', async ({ page }) => {
    await page.getByRole('button', { name: '참석', exact: true }).click()

    // 초기값 1에서 '줄이기'가 비활성이라 0을 만들 수 없다.
    await expect(page.getByRole('button', { name: '참석 인원 한 명 줄이기' })).toBeDisabled()
    await expect(page.getByLabel('참석 인원', { exact: true })).toHaveText('1')

    // 식사 인원의 '늘리기'는 참석 인원에서 막힌다.
    await expect(page.getByRole('button', { name: '식사 인원 한 명 늘리기' })).toBeDisabled()
    await expect(page.getByLabel('식사 인원', { exact: true })).toHaveText('1')

    // 참석 인원을 올리면 그만큼 식사 인원도 올릴 수 있게 풀린다.
    await page.getByRole('button', { name: '참석 인원 한 명 늘리기' }).click()
    await expect(page.getByRole('button', { name: '식사 인원 한 명 늘리기' })).toBeEnabled()
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
})

// 라이트박스 테스트는 RSVP 섹션과 무관하므로 beforeEach의 스크롤을 공유하지 않는다.
test.describe('라이트박스', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('뒤로가기가 페이지가 아니라 라이트박스만 닫는다', async ({ page }) => {
    // Task 8에서 headless로 한 번 실증했지만 그 스크립트가 저장소에 남지 않았다.
    // 이 로직을 다시 건드릴 때 회귀를 잡을 안전망이 여기다.
    const urlBefore = page.url()
    await openLightbox(page, '사진 1 크게 보기')

    await page.goBack()

    await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeHidden()
    expect(page.url()).toBe(urlBefore) // 페이지를 떠나지 않았다
  })

  test('사진을 넘겨도 히스토리가 쌓이지 않는다', async ({ page }) => {
    await openLightbox(page, '사진 1 크게 보기')
    const lenAfterOpen = await page.evaluate(() => history.length)

    await page.getByRole('button', { name: '다음 사진' }).click()
    await page.getByRole('button', { name: '다음 사진' }).click()

    // useEffect 의존성이 [index]면 여기서 히스토리가 늘어나고,
    // 하객이 뒤로가기를 여러 번 눌러야 청첩장으로 돌아온다.
    expect(await page.evaluate(() => history.length)).toBe(lenAfterOpen)

    await page.goBack()
    await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeHidden()
  })

  test('버튼으로 닫으면 히스토리 잔여물이 없다', async ({ page }) => {
    // history.length는 세션 전체에서 지금까지 생성된 항목 수라 history.back()으로
    // 뒤로 이동해도 줄지 않는다(실측 확인됨: push 후 back()을 해도 length는 그대로다).
    // "잔여물"을 검증하려면 현재 위치의 history.state가 라이트박스가 pushState로 남긴
    // { lightbox: true } 마커를 여전히 들고 있는지를 봐야 한다. 잔여물이 남으면
    // 다음 실제 뒤로가기가 그 마커만 지우고 페이지를 떠나지 못해 한 번 먹통이 된다.
    const stateBefore = await page.evaluate(() => history.state)

    await openLightbox(page, '사진 1 크게 보기')
    await page.getByRole('button', { name: '닫기' }).click()
    await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeHidden()

    const stateAfterClose = await page.evaluate(() => history.state)
    expect(stateAfterClose).toEqual(stateBefore)
  })
})

// 스와이프는 폰에서만 쓰는 경로다. 데스크톱 기본 컨텍스트는 hasTouch가 false라
// TouchEvent 생성 자체가 막히므로, 이 describe만 터치 가능한 컨텍스트로 돌린다.
test.describe('라이트박스 스와이프', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  /**
   * 오버레이에 touchstart/touchend를 합성해 스와이프를 흉내 낸다.
   * Playwright의 touchscreen.tap()은 탭만 되고 이동 궤적을 만들 수 없다.
   * React 이벤트 시스템은 루트에 위임되어 있어 합성 DOM 이벤트도 정상적으로 받는다.
   */
  async function swipe(page: import('@playwright/test').Page, dx: number, dy: number) {
    await page.evaluate(
      ([dx, dy]) => {
        const el = document.querySelector('[role="dialog"]')
        if (!el) throw new Error('라이트박스가 열려 있지 않다')
        const from = { x: 200, y: 400 }
        const touch = (x: number, y: number) =>
          new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
        el.dispatchEvent(
          new TouchEvent('touchstart', {
            bubbles: true,
            touches: [touch(from.x, from.y)],
            changedTouches: [touch(from.x, from.y)],
          }),
        )
        const to = touch(from.x + dx, from.y + dy)
        el.dispatchEvent(
          new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [to] }),
        )
      },
      [dx, dy],
    )
  }

  const counter = (page: import('@playwright/test').Page) =>
    page.getByRole('dialog').locator('p').last()

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('왼쪽으로 스와이프하면 다음 사진으로 넘어간다', async ({ page }) => {
    await openLightbox(page, '사진 1 크게 보기')
    await expect(counter(page)).toContainText('1 /')

    await swipe(page, -120, 0)

    await expect(counter(page)).toContainText('2 /')
    // 스와이프에 딸려온 click이 라이트박스를 닫아버리면 안 된다.
    await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeVisible()
  })

  test('오른쪽으로 스와이프하면 이전 사진으로 돌아간다', async ({ page }) => {
    await openLightbox(page, '사진 3 크게 보기')
    await expect(counter(page)).toContainText('3 /')

    await swipe(page, 120, 0)

    await expect(counter(page)).toContainText('2 /')
  })

  // 사선 제스처를 사진 이동으로 오인하면 하객이 의도하지 않은 사진으로 튄다.
  test('세로 이동이 더 큰 제스처로는 사진이 바뀌지 않는다', async ({ page }) => {
    await openLightbox(page, '사진 2 크게 보기')
    await expect(counter(page)).toContainText('2 /')

    await swipe(page, 60, 200)

    await expect(counter(page)).toContainText('2 /')
  })

  // 임계값 미만은 넘기려던 게 아니라 탭이다.
  test('짧은 이동으로는 사진이 바뀌지 않는다', async ({ page }) => {
    await openLightbox(page, '사진 2 크게 보기')

    await swipe(page, -20, 0)

    await expect(counter(page)).toContainText('2 /')
  })

  test('스와이프로 넘겨도 히스토리가 쌓이지 않는다', async ({ page }) => {
    await openLightbox(page, '사진 1 크게 보기')
    const lenAfterOpen = await page.evaluate(() => history.length)

    await swipe(page, -120, 0)
    await swipe(page, -120, 0)
    await expect(counter(page)).toContainText('3 /')

    expect(await page.evaluate(() => history.length)).toBe(lenAfterOpen)
    await page.goBack()
    await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeHidden()
  })
})

test.describe('라이트박스 로딩 표시', () => {
  // 로컬 미리보기는 1620w를 즉시 주므로 스피너가 뜰 창이 없다. 응답을 일부러
  // 늦춰서 하객의 폰(평균 250KB, 모바일 회선)과 같은 상황을 만든다.
  // 이 지연이 없으면 "스피너가 안 보인다"는 단언이 스피너를 지워도 통과한다.
  test('큰 사진을 받는 동안 스피너가 뜨고, 다 받으면 사라진다', async ({ page }) => {
    let release: (() => void) | null = null
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    await page.route('**/photos/*-1620.webp', async (route) => {
      await held
      await route.continue()
    })

    await page.goto('/')
    await openLightbox(page, '사진 1 크게 보기')

    const spinner = page.getByRole('status', { name: '사진 불러오는 중' })
    await expect(spinner).toBeVisible()

    release!()
    await expect(spinner).toBeHidden({ timeout: 15_000 })
  })

  // 사진마다 LightboxImage를 key로 새로 마운트하므로 loaded가 자연히 false에서
  // 시작한다. 부모에 상태를 두고 useEffect로 되돌리면 렌더와 이펙트 사이에 onLoad가
  // 끼어들 수 있고, 그러면 **다 받은 사진 위에서 스피너가 영원히 돈다.**
  test('사진을 넘길 때마다 스피너가 다시 떴다가 사라진다', async ({ page }) => {
    let holding = true
    await page.route('**/photos/*-1620.webp', async (route) => {
      while (holding) await new Promise((r) => setTimeout(r, 50))
      await route.continue()
    })

    await page.goto('/')
    await openLightbox(page, '사진 1 크게 보기')

    const spinner = page.getByRole('status', { name: '사진 불러오는 중' })
    await expect(spinner).toBeVisible()

    holding = false
    await expect(spinner).toBeHidden({ timeout: 15_000 })

    // 다음 사진 — 프리페치로 이미 캐시에 있을 수 있는 상황이다.
    await page.getByRole('button', { name: '다음 사진' }).click()
    await expect(page.getByRole('dialog').locator('p').last()).toContainText('2 /')
    await expect(spinner).toBeHidden({ timeout: 15_000 })

    // 1번으로 복귀 — 확실히 캐시에 있는 사진이다. 여기서 스피너가 남으면 버그다.
    await page.getByRole('button', { name: '이전 사진' }).click()
    await expect(page.getByRole('dialog').locator('p').last()).toContainText('1 /')
    await expect(spinner).toBeHidden({ timeout: 15_000 })
  })
})
