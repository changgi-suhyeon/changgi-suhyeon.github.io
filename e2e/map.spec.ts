import { expect, test } from '@playwright/test'

// 이 스펙은 PUBLIC_KAKAO_JS_KEY가 있고 그 앱에 http://localhost:4321 이 등록돼 있을 때만
// 의미가 있다. 키가 없으면 아일랜드가 null을 반환하고 정적 이미지만 남는 것이 정상 동작이라,
// 그 경우엔 통과가 아니라 skip이어야 한다 — 통과로 처리하면 지도가 죽어도 초록이 뜬다.
test.describe('카카오 지도', () => {
  test('안내 문구가 지도 타일에 가려지지 않는다', async ({ page }) => {
    await page.goto('/')
    await page.locator('section').filter({ hasText: '오시는 길' }).scrollIntoViewIfNeeded()

    const hint = page.getByLabel('지도 조작 활성화')
    const appeared = await hint
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)

    test.skip(!appeared, '카카오 키 미설정 또는 localhost:4321 도메인 미등록 — 지도가 뜨지 않았다')

    expect(
      await page.evaluate(
        () => document.querySelectorAll('img[src*="daumcdn.net"],img[src*="kakaocdn.net"]').length,
      ),
    ).toBeGreaterThan(0)

    // 카카오의 오버레이 레이어는 타일보다 늦게 붙는다. 이 대기가 없으면 아직 가려지기
    // 전 상태를 찍어 **버그가 있어도 통과한다**(실측으로 확인한 함정이다).
    await page.waitForTimeout(3000)

    const pill = hint.locator('span')
    await expect(pill).toHaveText('탭하면 지도를 움직일 수 있어요')
    const box = (await pill.boundingBox())!

    // 안내문이 **화면에 실제로 그려지는가**를 차이로 판정한다.
    //
    // 색으로 판정하면 안 된다 — 안내문 배경(--bg)과 지도 미로딩 시의 폴백 이미지가
    // 둘 다 크림색이라 구분이 안 되고, 실제로 그렇게 쓴 첫 판이 z-index 버그를
    // 그대로 통과시켰다. isVisible()이나 elementFromPoint도 못 잡는다: 지도 컨테이너가
    // 스태킹 컨텍스트를 만들지 않으면 카카오 내부의 양수 z-index 요소가 안내문 위에
    // 그려지는데, 그 레이어들은 pointer-events:none이라 히트 테스트는 통과하기 때문이다.
    // DOM은 "보인다"고 답하고 하객은 못 본다.
    //
    // 그래서 같은 영역을 안내문이 있을 때와 없을 때로 두 번 찍어 비교한다.
    // 안내문이 안 그려지고 있었다면 두 장이 같다.
    const withHint = await page.screenshot({ clip: box })

    await hint.click()
    await expect(hint).toBeHidden()
    await page.waitForTimeout(500)
    const withoutHint = await page.screenshot({ clip: box })

    expect(Buffer.compare(withHint, withoutHint)).not.toBe(0)
  })
})
