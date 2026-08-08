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
    await page.getByLabel('본인 포함 총 참석 인원').fill('2')
    await page.getByLabel('식사하실 인원').fill('2')

    // Turnstile 테스트 키(1x00000000000000000000AA)는 headless Chromium에서
    // 위젯 iframe을 그리지 않고 곧바로 히든 인풋(cf-turnstile-response)에 더미 토큰을
    // 채운다 — 실측 확인됨. iframe을 기다리면 영영 나타나지 않아 테스트가 타임아웃된다.
    // 토큰 발급에 잠깐 걸리므로 히든 인풋 값이 채워질 때까지 기다린다.
    await expect(page.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('', {
      timeout: 10_000,
    })

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

    // 이 정방향 단언이 없으면 클램프를 통째로 지워도 테스트가 통과한다.
    await expect(page.getByLabel('식사하실 인원')).toHaveValue('2')
  })

  test('인원 칸을 지웠다 다시 채워도 식사 인원이 0으로 굳지 않는다', async ({ page }) => {
    // Number('')는 0이다. 가드가 없으면 백스페이스로 칸이 비는 찰나에
    // 클램프가 식사 인원을 0으로 확정하고, 다시 3을 입력해도 되돌아오지 않는다.
    // 서버는 0 <= 0 <= 3이라 정상 수락하므로 `참석 3명 · 식사 0명`이 조용히 저장된다.
    await page.getByRole('button', { name: '참석', exact: true }).click()
    await page.getByLabel('본인 포함 총 참석 인원').fill('3')
    await page.getByLabel('식사하실 인원').fill('3')

    await page.getByLabel('본인 포함 총 참석 인원').fill('')
    await page.getByLabel('본인 포함 총 참석 인원').fill('3')

    await expect(page.getByLabel('식사하실 인원')).toHaveValue('3')
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
