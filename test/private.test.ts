import { describe, expect, it } from 'vitest'
import { parsePrivateData } from '../src/data/private'

const complete = JSON.stringify({
  phones: {
    groom: '010-1111-1111',
    groomFather: '010-1111-2222',
    groomMother: '010-1111-3333',
    bride: '010-2222-1111',
    brideFather: '010-2222-2222',
    brideMother: '010-2222-3333',
    shuttle: '010-3333-3333',
  },
  accounts: {
    groom: [{ bank: '국민', number: '123', holder: '홍길동', kakaopay: null }],
    bride: [{ bank: '신한', number: '456', holder: '성춘향', kakaopay: null }],
  },
})

describe('parsePrivateData — 프로덕션', () => {
  it('완전한 값이면 파싱한다', () => {
    const data = parsePrivateData(complete, true)
    expect(data.phones.groom).toBe('010-1111-1111')
    expect(data.accounts.bride[0]?.bank).toBe('신한')
  })

  it('값이 없으면 던진다', () => {
    expect(() => parsePrivateData(undefined, true)).toThrow(/WEDDING_PRIVATE/)
  })

  it('빈 문자열이어도 던진다', () => {
    expect(() => parsePrivateData('', true)).toThrow(/WEDDING_PRIVATE/)
  })

  it('JSON이 깨졌으면 던진다', () => {
    expect(() => parsePrivateData('{nope', true)).toThrow(/JSON/)
  })

  it('phones 키가 하나라도 빠지면 던진다', () => {
    const missing = JSON.parse(complete)
    delete missing.phones.shuttle
    expect(() => parsePrivateData(JSON.stringify(missing), true)).toThrow(/shuttle/)
  })

  it('전화번호가 빈 문자열이면 던진다', () => {
    const blank = JSON.parse(complete)
    blank.phones.bride = ''
    expect(() => parsePrivateData(JSON.stringify(blank), true)).toThrow(/bride/)
  })

  it('계좌 배열이 비면 던진다', () => {
    const empty = JSON.parse(complete)
    empty.accounts.groom = []
    expect(() => parsePrivateData(JSON.stringify(empty), true)).toThrow(/accounts/)
  })

  it('계좌에 필수 필드가 빠지면 던진다', () => {
    const bad = JSON.parse(complete)
    bad.accounts.groom[0].number = ''
    expect(() => parsePrivateData(JSON.stringify(bad), true)).toThrow(/accounts/)
  })
})

describe('parsePrivateData — 개발', () => {
  it('값이 없으면 더미로 대체한다', () => {
    const data = parsePrivateData(undefined, false)
    expect(data.phones.groom).toBe('000-0000-0000')
  })

  it('더미는 실제처럼 보이지 않는다', () => {
    const data = parsePrivateData(undefined, false)
    expect(data.accounts.groom[0]?.number).toMatch(/000/)
  })

  it('개발이어도 값이 있으면 그걸 쓴다', () => {
    expect(parsePrivateData(complete, false).phones.groom).toBe('010-1111-1111')
  })
})
