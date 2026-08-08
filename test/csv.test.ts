import { describe, expect, it } from 'vitest'
import type { RsvpRecord } from '../src/lib/rsvp-contract'
import { CSV_BOM, toCsv } from '../src/lib/csv'

const record = (over: Partial<RsvpRecord> & { id: number }): RsvpRecord => ({
  createdAt: '2026-09-01 12:00:00',
  createdMs: 1_788_000_000_000,
  side: 'groom',
  name: '홍길동',
  attending: true,
  partySize: 2,
  mealCount: 2,
  phone: null,
  message: null,
  ...over,
})

describe('toCsv', () => {
  it('BOM으로 시작한다 — 엑셀 한글 깨짐 방지', () => {
    expect(toCsv([])).toMatch(new RegExp(`^${CSV_BOM}`))
  })

  it('헤더 행을 포함한다', () => {
    expect(toCsv([]).split('\n')[0]).toContain('성함')
  })

  it('참석 여부를 한국어로 쓴다', () => {
    const csv = toCsv([record({ id: 1, attending: true })])
    expect(csv).toContain('참석')
  })

  it('쉼표가 든 값을 따옴표로 감싼다', () => {
    const csv = toCsv([record({ id: 1, message: '축하해요, 정말로' })])
    expect(csv).toContain('"축하해요, 정말로"')
  })

  it('따옴표가 든 값을 이스케이프한다', () => {
    const csv = toCsv([record({ id: 1, message: '그가 "축하"라고' })])
    expect(csv).toContain('"그가 ""축하""라고"')
  })

  it('줄바꿈이 든 값을 따옴표로 감싼다', () => {
    const csv = toCsv([record({ id: 1, message: '첫 줄\n둘째 줄' })])
    expect(csv).toContain('"첫 줄\n둘째 줄"')
  })

  it('null은 빈 칸으로 쓴다', () => {
    const csv = toCsv([record({ id: 1, phone: null })])
    expect(csv).not.toContain('null')
  })

  it('시각은 createdMs 기준 KST로 쓴다 — createdAt(타임존 표식 없는 UTC 문자열)을 그대로 쓰지 않는다', () => {
    // createdAt을 그대로 쓰면 이미 9시간 밀린 텍스트가 그대로 CSV에 실려
    // 식장에 넘기는 자료의 시각이 틀어진다. createdMs를 KST로 변환한 값이어야 한다.
    const csv = toCsv([record({ id: 1, createdMs: 1_788_000_000_000 })])
    const expected = new Date(1_788_000_000_000).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
    })
    expect(csv).toContain(expected)
    expect(csv).not.toContain('2026-09-01 12:00:00')
  })
})
