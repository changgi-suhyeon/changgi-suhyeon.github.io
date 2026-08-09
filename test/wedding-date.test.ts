import { describe, expect, it } from 'vitest'
import { formatShareDescription, getWeddingDateParts } from '../src/lib/wedding-date'

const WEDDING = '2026-10-31T12:00:00+09:00'

describe('getWeddingDateParts', () => {
  it('예식 일시를 한국 기준 조각으로 나눈다', () => {
    expect(getWeddingDateParts(WEDDING)).toEqual({
      year: 2026,
      month: 10,
      day: 31,
      weekdayEn: 'SAT',
      weekdayKo: '토',
      timeText: '오후 12시',
    })
  })

  it('분이 0이 아니면 분까지 적는다', () => {
    expect(getWeddingDateParts('2026-10-31T12:30:00+09:00').timeText).toBe('오후 12시 30분')
  })

  it('정오와 자정을 12시로 적는다 (0시가 아니다)', () => {
    expect(getWeddingDateParts('2026-10-31T12:00:00+09:00').timeText).toBe('오후 12시')
    expect(getWeddingDateParts('2026-10-31T00:00:00+09:00').timeText).toBe('오전 12시')
  })

  // 이 파일이 지키는 핵심 계약. `new Date(iso).getFullYear()` 같은 접근을 쓰면 값이
  // **빌드 머신의 시간대를 따르므로** CI(UTC)와 로컬(KST)에서 다른 날짜가 나온다.
  // 예식이 KST 자정 직후라면 UTC 머신에서 빌드한 청첩장은 하루 앞 날짜를 인쇄한다.
  // 아래 두 경우가 그 경계다 — 어느 시간대에서 테스트를 돌려도 같아야 한다.
  it('KST 자정 직후는 그날로, 자정 직전은 전날로 읽는다', () => {
    const justAfter = getWeddingDateParts('2026-10-31T00:05:00+09:00')
    expect([justAfter.year, justAfter.month, justAfter.day]).toEqual([2026, 10, 31])

    const justBefore = getWeddingDateParts('2026-10-30T23:55:00+09:00')
    expect([justBefore.year, justBefore.month, justBefore.day]).toEqual([2026, 10, 30])
  })

  it('같은 순간을 다른 오프셋으로 적어도 결과가 같다', () => {
    // 2026-10-31T12:00+09:00 == 2026-10-31T03:00Z
    expect(getWeddingDateParts('2026-10-31T03:00:00Z')).toEqual(getWeddingDateParts(WEDDING))
  })
})

describe('formatShareDescription', () => {
  it('카카오톡 미리보기에 쓸 한 줄을 만든다', () => {
    expect(formatShareDescription(WEDDING)).toBe('2026년 10월 31일 토요일 오후 12시')
  })

  // og 메타(index.astro)와 공유 카드(Share.astro)가 각자 문자열을 조립하면 갈라진다.
  // 링크로 받은 사람과 공유 버튼으로 받은 사람이 서로 다른 안내를 보게 되는데,
  // 어느 쪽도 틀린 티가 나지 않아 아무도 눈치채지 못한다. 두 곳 모두 이 함수만 부른다.
  it('같은 입력에 항상 같은 문자열을 준다', () => {
    expect(formatShareDescription(WEDDING)).toBe(formatShareDescription(WEDDING))
  })
})
