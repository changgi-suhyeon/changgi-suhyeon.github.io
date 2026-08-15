import { wedding } from './wedding'

export type PhoneKey =
  | 'groom' | 'groomFather' | 'groomMother'
  | 'bride' | 'brideFather' | 'brideMother'
  | 'shuttle'

export interface Account {
  bank: string
  number: string
  holder: string
  kakaopay: string | null
}

export interface PrivateData {
  phones: Record<PhoneKey, string>
  accounts: { groom: Account[]; bride: Account[] }
}

const PHONE_KEYS: PhoneKey[] = [
  'groom', 'groomFather', 'groomMother',
  'bride', 'brideFather', 'brideMother',
  'shuttle',
]

/** 개발 모드 전용. 실제 값으로 착각할 수 없게 만든다. */
const DEV_FALLBACK: PrivateData = {
  phones: Object.fromEntries(
    PHONE_KEYS.map((k) => [k, '000-0000-0000']),
  ) as Record<PhoneKey, string>,
  accounts: {
    groom: [{ bank: '개발용', number: '000-0000-000000', holder: '신랑', kakaopay: null }],
    bride: [{ bank: '개발용', number: '000-0000-000000', holder: '신부', kakaopay: null }],
  },
}

/**
 * 값이 없거나 불완전한 채로 프로덕션 빌드가 성공하면
 * 계좌번호가 빈 사이트가 조용히 배포된다. 그래서 던진다.
 * 잘못된 배포보다 실패한 빌드가 낫다.
 *
 * `requiredPhoneKeys`는 "비어 있으면 빌드를 중단할 키" 목록이다. 고인이 된 혼주에게는
 * 전화번호가 없는데 일곱 키를 모두 필수로 요구하면 유족이 없는 번호를 지어내야 하고,
 * 그렇게 지어낸 번호가 청첩장에 탭 가능한 버튼으로 실린다(I3). 정책을 인자로 받아
 * 이 함수 자체는 순수한 파서로 남긴다 — 정책은 아래 모듈 수준 배선에서 정한다.
 */
export function parsePrivateData(
  raw: string | undefined,
  isProd: boolean,
  requiredPhoneKeys: readonly PhoneKey[] = PHONE_KEYS,
): PrivateData {
  if (raw === undefined || raw.trim() === '') {
    if (isProd) {
      throw new Error(
        'WEDDING_PRIVATE 환경변수가 없습니다. 프로덕션 빌드를 중단합니다. ' +
          '.env 또는 GitHub Secrets를 확인하세요.',
      )
    }
    return DEV_FALLBACK
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('WEDDING_PRIVATE 의 JSON 파싱에 실패했습니다.')
  }

  const data = parsed as Partial<PrivateData>

  const phones = data.phones
  if (typeof phones !== 'object' || phones === null) {
    throw new Error('WEDDING_PRIVATE.phones 가 없습니다.')
  }
  for (const key of PHONE_KEYS) {
    const value = (phones as Record<string, unknown>)[key]
    if (typeof value !== 'string' || value.trim() === '') {
      if (requiredPhoneKeys.includes(key)) {
        throw new Error(`WEDDING_PRIVATE.phones.${key} 가 비어 있습니다.`)
      }
      // 필수가 아닌 키(고인이 된 혼주)는 비어 있어도 된다. 빈 문자열로 정규화해
      // 소비자가 `undefined`와 `''`를 따로 다루지 않게 한다.
      ;(phones as Record<string, string>)[key] = ''
    }
  }

  const accounts = data.accounts
  if (typeof accounts !== 'object' || accounts === null) {
    throw new Error('WEDDING_PRIVATE.accounts 가 없습니다.')
  }
  for (const side of ['groom', 'bride'] as const) {
    const list = (accounts as Record<string, unknown>)[side]
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(`WEDDING_PRIVATE.accounts.${side} 가 비어 있습니다.`)
    }
    for (const [i, entry] of list.entries()) {
      const a = entry as Partial<Account>
      for (const field of ['bank', 'number', 'holder'] as const) {
        if (typeof a[field] !== 'string' || a[field]!.trim() === '') {
          throw new Error(`WEDDING_PRIVATE.accounts.${side}[${i}].${field} 가 비어 있습니다.`)
        }
      }
    }
  }

  return data as PrivateData
}

// 고인이 된 혼주의 전화번호 키는 필수에서 뺀다. 공개 데이터(wedding.ts)를 읽어
// 비밀값의 검증 정책을 정하는 방향이라 의존은 한 방향뿐이다 — wedding.ts는
// private.ts를 import하지 않으므로 순환은 생기지 않는다.
// Invitation.astro의 연락하기 목록도 같은 플래그로 행 자체를 뺀다. 한쪽만 고치면
// 이름은 菊과 함께 혼주 줄에 나오는데 연락처 목록에는 전화 버튼이 남는 상태가 된다.
const DECEASED_PHONE_KEYS: PhoneKey[] = [
  ...(wedding.groom.father.deceased ? (['groomFather'] as const) : []),
  ...(wedding.groom.mother.deceased ? (['groomMother'] as const) : []),
  ...(wedding.bride.father.deceased ? (['brideFather'] as const) : []),
  ...(wedding.bride.mother.deceased ? (['brideMother'] as const) : []),
]

// 전세버스를 운행하지 않으면 담당자 번호도 필요 없다. Shuttle.astro는 departAt과
// boardingPoint가 모두 비면 섹션 자체를 렌더하지 않으므로 phones.shuttle을 아무도
// 읽지 않는데, 그런데도 필수로 요구하면 쓰지도 않을 번호를 지어내야 한다.
// 지어낸 번호는 결국 어딘가에서 탭 가능한 버튼이 되므로(I3와 같은 부류) 조건을 맞춘다.
// 판정 기준을 Shuttle.astro의 hasContent와 똑같이 두는 것이 중요하다 — 어긋나면
// 섹션은 뜨는데 번호는 빈 문자열이라 `tel:`만 걸린 버튼이 생긴다.
const SHUTTLE_RUNS = Boolean(
  wedding.shuttle.departAt.trim() || wedding.shuttle.boardingPoint.trim(),
)

const OPTIONAL_PHONE_KEYS: PhoneKey[] = [
  ...DECEASED_PHONE_KEYS,
  ...(SHUTTLE_RUNS ? [] : (['shuttle'] as const)),
]

export const privateData: PrivateData = parsePrivateData(
  import.meta.env.WEDDING_PRIVATE as string | undefined,
  import.meta.env.PROD,
  PHONE_KEYS.filter((key) => !OPTIONAL_PHONE_KEYS.includes(key)),
)
