import type { RsvpRecord } from './rsvp-contract'

/** 엑셀이 UTF-8로 인식하게 하는 BOM. 없으면 한글이 깨진다. */
export const CSV_BOM = '﻿'

const HEADERS = ['제출시각', '구분', '성함', '참석여부', '참석인원', '식사인원', '연락처', '전하실말씀']

function escape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(records: RsvpRecord[]): string {
  const rows = records.map((r) =>
    [
      // createdAt이 아니라 createdMs를 쓴다. createdAt은 타임존 표식이 없는 UTC 문자열이라
      // 그대로 쓰면 이미 9시간 밀린 텍스트가 식장에 넘길 CSV에 그대로 실린다.
      new Date(r.createdMs).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      r.side === 'groom' ? '신랑측' : '신부측',
      r.name,
      r.attending ? '참석' : '불참',
      String(r.partySize),
      String(r.mealCount),
      r.phone ?? '',
      r.message ?? '',
    ]
      .map(escape)
      .join(','),
  )

  return CSV_BOM + [HEADERS.join(','), ...rows].join('\n') + '\n'
}
