import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Countdown from '../src/components/Countdown'

const WEDDING = '2026-10-31T12:00:00+09:00'

/** 주어진 시각을 '현재'로 고정한 뒤 서버 렌더 결과를 돌려준다. */
function ssrAt(iso: string): string {
  vi.setSystemTime(new Date(iso))
  return renderToString(createElement(Countdown, { weddingIso: WEDDING }))
}

describe('Countdown 서버 렌더', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // 이 파일이 지키는 것은 "카운트다운 숫자"가 아니라 하이드레이션 계약이다.
  // 정적 사이트라 astro build가 이 컴포넌트를 빌드 시각에 딱 한 번 렌더하고,
  // 그 HTML이 몇 달 뒤 하객에게 그대로 전달된다. 서버 렌더 결과가 시각에
  // 의존하면 하객 브라우저의 첫 렌더와 어긋나 React가 하이드레이션 실패를
  // 던진다(프로덕션에서 Minified React error #418).
  it('빌드 시각이 달라도 서버 렌더 결과가 같다', () => {
    const buildTimes = [
      '2026-08-08T12:00:00+09:00', // 한참 전
      '2026-10-30T23:00:00+09:00', // 하루 전 — 같은 before지만 숫자가 다르다
      '2026-10-31T08:00:00+09:00', // 당일 — phase가 통째로 바뀐다
      '2026-11-05T00:00:00+09:00', // 이후 — phase가 통째로 바뀐다
    ]

    const rendered = buildTimes.map(ssrAt)

    // 넷이 모두 같아야 한다. 하나라도 다르면 그 시각에 빌드된 사이트는
    // 하이드레이션이 깨진다.
    expect(new Set(rendered).size).toBe(1)
  })

  // 위 테스트는 "항상 같기만" 하면 통과하므로, 빌드 시각의 숫자가 HTML에
  // 박제되지 않는다는 것을 따로 못박는다.
  it('서버 렌더 HTML에 빌드 시각의 남은 시간이 박히지 않는다', () => {
    // 예식 2일 3시간 4분 5초 전에 빌드한다.
    const html = ssrAt('2026-10-29T08:55:55+09:00')

    for (const frozen of ['02', '03', '04', '05']) {
      expect(html).not.toContain(`>${frozen}<`)
    }
  })
})
