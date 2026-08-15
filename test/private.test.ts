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

// 고인이 된 혼주에게는 전화번호가 없다. 일곱 키를 모두 필수로 요구하면 유족이
// 없는 번호를 지어내야 하고, 그 번호가 청첩장에 탭 가능한 버튼으로 실린다.
describe('parsePrivateData — 고인 혼주의 전화번호', () => {
  const REQUIRED_WITHOUT_GROOM_FATHER = [
    'groom', 'groomMother', 'bride', 'brideFather', 'brideMother', 'shuttle',
  ] as const

  it('필수에서 뺀 키는 빈 문자열이어도 통과한다', () => {
    const blank = JSON.parse(complete)
    blank.phones.groomFather = ''
    const data = parsePrivateData(
      JSON.stringify(blank), true, REQUIRED_WITHOUT_GROOM_FATHER,
    )
    expect(data.phones.groomFather).toBe('')
  })

  it('필수에서 뺀 키는 아예 없어도 통과하고 빈 문자열로 정규화된다', () => {
    const missing = JSON.parse(complete)
    delete missing.phones.groomFather
    const data = parsePrivateData(
      JSON.stringify(missing), true, REQUIRED_WITHOUT_GROOM_FATHER,
    )
    expect(data.phones.groomFather).toBe('')
  })

  it('공백만 든 값도 빈 문자열로 정규화된다 — tel: 링크가 공백으로 만들어지지 않는다', () => {
    const spaces = JSON.parse(complete)
    spaces.phones.groomFather = '   '
    const data = parsePrivateData(
      JSON.stringify(spaces), true, REQUIRED_WITHOUT_GROOM_FATHER,
    )
    expect(data.phones.groomFather).toBe('')
  })

  it('여전히 필수인 다른 키가 비면 던진다 — 완화가 전체로 번지지 않는다', () => {
    const blank = JSON.parse(complete)
    blank.phones.brideMother = ''
    expect(() =>
      parsePrivateData(JSON.stringify(blank), true, REQUIRED_WITHOUT_GROOM_FATHER),
    ).toThrow(/brideMother/)
  })

  it('기본값은 일곱 키 전부 필수다 — 인자를 안 주면 예전 그대로 엄격하다', () => {
    const blank = JSON.parse(complete)
    blank.phones.groomFather = ''
    expect(() => parsePrivateData(JSON.stringify(blank), true)).toThrow(/groomFather/)
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

describe('선택 전화번호 키', () => {
  const base = {
    phones: {
      groom: '010-1111-1111', groomFather: '010-1111-1111', groomMother: '010-1111-1111',
      bride: '010-1111-1111', brideFather: '010-1111-1111', brideMother: '010-1111-1111',
      shuttle: '',
    },
    accounts: {
      groom: [{ bank: '테스트', number: '000-0000-000000', holder: '신랑', kakaopay: null }],
      bride: [{ bank: '테스트', number: '000-0000-000000', holder: '신부', kakaopay: null }],
    },
  }
  const REQUIRED_WITHOUT_SHUTTLE = [
    'groom', 'groomFather', 'groomMother', 'bride', 'brideFather', 'brideMother',
  ] as const

  // 전세버스를 운행하지 않으면 Shuttle.astro가 섹션을 렌더하지 않아 이 번호를 아무도
  // 읽지 않는다. 그런데도 필수로 두면 쓰지도 않을 번호를 지어내야 하고, 지어낸 번호는
  // 결국 탭 가능한 버튼이 된다.
  it('필수 목록에서 빠진 키는 비어 있어도 통과하고 빈 문자열로 정규화된다', () => {
    const parsed = parsePrivateData(JSON.stringify(base), true, REQUIRED_WITHOUT_SHUTTLE)
    expect(parsed.phones.shuttle).toBe('')
  })

  // 반대 방향도 봉인한다 — 운행할 때는 비어 있으면 빌드를 멈춰야 한다.
  // 이게 없으면 섹션은 뜨는데 `tel:`만 걸린 버튼이 하객에게 나간다.
  it('필수 목록에 있으면 비어 있을 때 빌드를 멈춘다', () => {
    expect(() => parsePrivateData(JSON.stringify(base), true)).toThrow(/shuttle/)
  })
})
