import { describe, expect, it } from 'vitest'
import { getDdayState } from '../src/lib/dday'

const WEDDING = '2026-10-31T12:00:00+09:00'
const ms = (iso: string) => Date.parse(iso)

describe('getDdayState', () => {
  it('예식 전이면 before', () => {
    const s = getDdayState(WEDDING, ms('2026-08-08T12:00:00+09:00'))
    expect(s.phase).toBe('before')
  })

  it('남은 일·시·분·초를 계산한다', () => {
    // 예식 2일 3시간 4분 5초 전
    const s = getDdayState(WEDDING, ms('2026-10-29T08:55:55+09:00'))
    expect(s).toEqual({ phase: 'before', days: 2, hours: 3, minutes: 4, seconds: 5 })
  })

  it('예식 당일 오전이면 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T08:00:00+09:00')).phase).toBe('today')
  })

  it('예식 시작 직후에도 당일이면 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T13:00:00+09:00')).phase).toBe('today')
  })

  it('예식일 밤 23시 59분도 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T23:59:59+09:00')).phase).toBe('today')
  })

  it('다음 날 자정 직후면 after', () => {
    expect(getDdayState(WEDDING, ms('2026-11-01T00:00:01+09:00')).phase).toBe('after')
  })

  it('한참 뒤에도 after (음수 D-day를 만들지 않는다)', () => {
    expect(getDdayState(WEDDING, ms('2026-12-25T00:00:00+09:00')).phase).toBe('after')
  })

  it('한국 시간 기준으로 날짜를 가른다', () => {
    // UTC로는 10월 30일이지만 KST로는 10월 31일 오전 8시다.
    expect(getDdayState(WEDDING, ms('2026-10-30T23:00:00Z')).phase).toBe('today')
  })

  it('예식 1초 전은 today', () => {
    expect(getDdayState(WEDDING, ms('2026-10-31T11:59:59+09:00')).phase).toBe('today')
  })

  it('예식 전날 23:59:59는 before', () => {
    const s = getDdayState(WEDDING, ms('2026-10-30T23:59:59+09:00'))
    expect(s.phase).toBe('before')
  })
})
