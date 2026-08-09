import { expect, test } from '@playwright/test'

// 하객에게 링크로 직접 전달하는 청첩장이라 검색 결과에 신랑·신부와 혼주 성함,
// 식장, 일시가 노출될 이유가 없다. Base.astro가 모든 페이지에 넣지만, 레이아웃을
// 거치지 않는 페이지를 새로 만들면 조용히 빠진다 — 그때 아무 경고도 나지 않고
// 색인은 몇 주 뒤에야 눈에 띈다.
const PAGES = ['/', '/admin']

test.describe('검색엔진 색인 차단', () => {
  for (const path of PAGES) {
    test(`${path} 에 noindex가 있다`, async ({ page }) => {
      await page.goto(path)
      const content = await page
        .locator('meta[name="robots"]')
        .first()
        .getAttribute('content')
      expect(content).toContain('noindex')
      expect(content).toContain('nofollow')
    })
  }

  // noindex는 '검색 결과에 넣지 마라'이지 '가져오지 마라'가 아니다. 카카오톡·
  // 페이스북의 링크 미리보기는 색인이 아니라 스크랩이므로 영향받지 않아야 한다.
  // 둘 중 하나를 고치다 다른 하나를 깨뜨리는 일을 막는다.
  test('색인을 막아도 카카오톡 미리보기용 og 태그는 남아 있다', async ({ page }) => {
    await page.goto('/')
    for (const prop of ['og:title', 'og:description', 'og:image', 'og:url']) {
      const content = await page.locator(`meta[property="${prop}"]`).getAttribute('content')
      expect(content, `${prop} 가 비어 있다`).toBeTruthy()
    }
    // og:image는 절대 URL이어야 스크래퍼가 가져간다.
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(
      /^https:\/\//,
    )
  })

  // robots.txt로 Disallow하면 크롤러가 페이지를 못 읽어 위의 noindex를 보지 못하고,
  // 외부에 링크가 있으면 내용 없이 URL만 검색 결과에 남을 수 있다. 색인을 막으려면
  // 오히려 읽게 두어야 한다. 누군가 선의로 robots.txt를 추가하는 것을 여기서 막는다.
  test('robots.txt로 크롤링을 막지 않는다', async ({ page }) => {
    const res = await page.request.get('/robots.txt')
    if (res.status() === 404) return // 없는 것이 기본이고 정상이다
    expect(await res.text()).not.toMatch(/Disallow:\s*\/\s*$/mi)
  })
})
