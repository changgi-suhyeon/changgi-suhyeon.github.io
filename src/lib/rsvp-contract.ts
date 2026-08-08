// 이 파일은 marriage-invitation-worker 저장소의 src/contract.ts 와 동일해야 한다.
// 한쪽만 고치면 런타임에 조용히 어긋난다.

export type Side = 'groom' | 'bride'

/** 하객이 폼에서 제출하는 형태 */
export interface RsvpSubmission {
  side: Side
  name: string
  attending: boolean
  /** 본인 포함 총 참석 인원. 불참이면 0 */
  partySize: number
  /** 식사할 인원. 불참이면 0 */
  mealCount: number
  phone?: string
  message?: string
  /** 허니팟. 화면 밖에 숨긴 입력칸이라 사람은 채울 수 없다 — 값이 있으면 봇이다.
   *  폼 HTML을 긁어 보이는 필드를 전부 채우는 흔한 스팸 봇을 잡는다.
   *  사람에게 아무 마찰도 주지 않는다는 것이 이 방식의 요점이다. */
  honeypot?: string
  /** 폼이 화면에 뜬 뒤 제출까지 걸린 시간(ms). 사람은 이름을 치는 데만도 몇 초가 걸린다.
   *  클라이언트가 보내는 값이라 위조할 수 있다 — 요청을 직접 조립하는 상대는 못 막고,
   *  폼을 긁어 즉시 되쏘는 봇만 막는다. 한계를 알고 쓰는 보조 수단이다. */
  elapsedMs?: number
}

/** 관리자 조회 시 돌려주는 형태 */
export interface RsvpRecord {
  id: number
  createdAt: string
  /** epoch ms. `createdAt`은 SQLite `datetime('now')` 결과라 **타임존 표식이 없는 UTC 문자열**이고,
   *  브라우저가 그것을 로컬 시각으로 파싱해 KST 환경에서 9시간 이르게 표시된다.
   *  실제로 재현되었다: 서버가 '2026-08-08 12:12:50'을 주는데 제출은 21:12 KST였다.
   *  화면 표시는 반드시 이 값으로 할 것. */
  createdMs: number
  side: Side
  name: string
  attending: boolean
  partySize: number
  mealCount: number
  phone: string | null
  message: string | null
}

export interface RsvpSummary {
  total: number
  attending: number
  notAttending: number
  groomGuests: number
  brideGuests: number
  totalMeals: number
  /** 동일 (측, 이름)으로 접혀 집계에서 빠진 건수.
   *  0이 아니면 관리자가 목록을 눈으로 확인해야 한다 — 동측 동명이인이면 실제로 다른 사람이다. */
  duplicateSubmissions: number
}

export interface ValidationError {
  field: string
  message: string
}

// --- 아래는 Worker의 contract.ts에는 없는 항목들이다 --------------------------------
//
// Worker의 src/contract.ts에는 요청 타입만 있고, 실제 응답 와이어 포맷은 index.ts
// 안에서 json(...) 호출부에 암묵적으로만 존재한다(Worker 저장소 src/index.ts 참고).
// 사이트 쪽 fetch 코드가 타입 검사를 받으려면 이 응답 형태를 명시해야 하므로 여기 추가한다.
// Worker의 contract.ts는 건드리지 않는다 — 다음 기회에 그쪽에도 반영한다.

/** POST /rsvp 성공 응답 (index.ts의 `json({ ok: true, id: inserted.id }, 200, ...)`) */
export interface RsvpPostResponse {
  ok: true
  id: number
}

/** POST/GET /rsvp 실패 응답 공통 형태. fields는 필드 검증 실패(400)에서만 채워진다. */
export interface RsvpErrorBody {
  error: string
  fields?: ValidationError[]
}

/** GET /rsvp(관리자 조회) 성공 응답 (index.ts의 `json({ records, summary }, 200, ...)`) */
export interface RsvpListResponse {
  records: RsvpRecord[]
  summary: RsvpSummary
}

// 검증 상수도 Worker의 src/validate.ts와 동일해야 한다. 서버 상수가 바뀌면
// 폼의 maxLength/max가 조용히 어긋나므로, 하드코딩하지 않고 여기서 가져와 쓴다.
export const NAME_MAX = 20
export const MESSAGE_MAX = 500
export const PARTY_MAX = 10
