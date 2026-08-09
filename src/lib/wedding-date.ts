const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const WEEKDAY_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

export interface WeddingDateParts {
  year: number
  month: number
  day: number
  /** 히어로의 장식 오버레이용. 예: 'SAT' */
  weekdayEn: string
  /** 문장 안에 쓰는 한글 요일. 예: '토' */
  weekdayKo: string
  /** 예: '오후 12시' — 분이 0이면 생략한다. */
  timeText: string
}

/**
 * 예식 일시를 화면에 쓸 조각들로 나눈다.
 *
 * 표준시 처리를 여기 한 곳에 가둔다. `new Date(iso).getFullYear()` 같은 접근은
 * **빌드 머신의 시간대를 따르므로** CI(UTC)와 로컬(KST)에서 다른 날짜가 나온다.
 * 예식이 KST 자정 근처였다면 배포된 청첩장의 날짜가 하루 어긋났을 것이다.
 * 그래서 UTC로 옮겨 놓고 getUTC* 만 쓴다 — 어디서 빌드하든 결과가 같다.
 */
export function getWeddingDateParts(iso: string): WeddingDateParts {
  const kst = new Date(Date.parse(iso) + KST_OFFSET_MS)

  const hour = kst.getUTCHours()
  const minute = kst.getUTCMinutes()
  const ampm = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12

  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    weekdayEn: WEEKDAY_EN[kst.getUTCDay()]!,
    weekdayKo: WEEKDAY_KO[kst.getUTCDay()]!,
    timeText: minute === 0 ? `${ampm} ${hour12}시` : `${ampm} ${hour12}시 ${minute}분`,
  }
}

/**
 * 카카오톡 링크 미리보기와 og:description에 쓰는 한 줄.
 *
 * **두 곳이 반드시 같은 문자열을 써야 한다.** og 메타는 스크래퍼가 읽고
 * 공유 버튼은 Kakao.Share에 직접 넘기는데, 갈라지면 같은 청첩장을 링크로 받은
 * 사람과 공유 버튼으로 받은 사람이 서로 다른 안내를 본다. 그래서 각자 조립하지
 * 않고 이 함수만 부른다.
 */
export function formatShareDescription(iso: string): string {
  const d = getWeddingDateParts(iso)
  return `${d.year}년 ${d.month}월 ${d.day}일 ${d.weekdayKo}요일 ${d.timeText}`
}
