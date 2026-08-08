export type DdayState =
  | { phase: 'before'; days: number; hours: number; minutes: number; seconds: number }
  | { phase: 'today' }
  | { phase: 'after' }

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 해당 시각의 한국 날짜를 'YYYY-MM-DD'로 돌려준다. */
function kstDateKey(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * 예식 전·당일·이후 세 상태를 가른다.
 * 당일 판정은 시각이 아니라 한국 날짜 기준이다 — 예식이 끝난 저녁에도
 * "오늘 결혼합니다"가 맞고, 다음 날 0시부터 "끝났습니다"가 된다.
 */
export function getDdayState(weddingIso: string, nowMs: number): DdayState {
  const weddingMs = Date.parse(weddingIso)
  const weddingKey = kstDateKey(weddingMs)
  const nowKey = kstDateKey(nowMs)

  if (nowKey === weddingKey) return { phase: 'today' }
  if (nowKey > weddingKey) return { phase: 'after' }

  const totalSeconds = Math.floor((weddingMs - nowMs) / 1000)
  return {
    phase: 'before',
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor(totalSeconds / 3_600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  }
}
