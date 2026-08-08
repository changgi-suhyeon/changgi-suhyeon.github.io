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
 */
export function parsePrivateData(raw: string | undefined, isProd: boolean): PrivateData {
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
      throw new Error(`WEDDING_PRIVATE.phones.${key} 가 비어 있습니다.`)
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

export const privateData: PrivateData = parsePrivateData(
  import.meta.env.WEDDING_PRIVATE as string | undefined,
  import.meta.env.PROD,
)
