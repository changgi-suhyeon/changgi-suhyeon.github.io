import { useEffect, useState } from 'react'
import { getDdayState, type DdayState } from '../lib/dday'

interface Props {
  weddingIso: string
}

export default function Countdown({ weddingIso }: Props) {
  // 정적 사이트라 astro build가 이 컴포넌트를 '빌드 시각'에 딱 한 번 렌더하고,
  // 그 HTML이 몇 달 뒤 하객에게 그대로 전달된다. 초기값을 Date.now()로 잡으면
  // 빌드 시각의 남은 시간이 HTML에 박제돼 하객 브라우저의 첫 렌더와 어긋나고,
  // React가 하이드레이션 실패를 던진다(프로덕션 Minified React error #418).
  // 첫 렌더는 서버와 클라이언트가 반드시 같아야 하므로, 실제 시각은 마운트
  // 이후에만 읽는다. 이 계약은 test/countdown.test.ts가 지킨다.
  const [state, setState] = useState<DdayState | null>(null)

  useEffect(() => {
    setState(getDdayState(weddingIso, Date.now()))
  }, [weddingIso])

  useEffect(() => {
    // 마운트 전(null)이거나 'before'가 아니면 갱신할 것이 없다. 타이머를 걸지 않는다.
    if (state?.phase !== 'before') return
    const id = setInterval(() => setState(getDdayState(weddingIso, Date.now())), 1000)
    return () => clearInterval(id)
  }, [weddingIso, state?.phase])

  if (state?.phase === 'today') {
    return (
      <p className="mt-9 text-center font-serif-kr text-[17px]" style={{ color: 'var(--ink)' }}>
        오늘 저희가 결혼합니다
      </p>
    )
  }

  if (state?.phase === 'after') {
    return (
      <p
        className="mt-9 text-center font-serif-kr text-base leading-[2]"
        style={{ color: 'var(--ink)' }}
      >
        저희 결혼식이 무사히 끝났습니다
        <br />
        함께해 주셔서 감사합니다
      </p>
    )
  }

  // state가 null이면 아직 마운트 전(=서버 렌더)이다. 숫자 대신 자리표시자를 그린다.
  // 빈칸이 아니라 자리표시자인 이유는 타일 크기를 미리 잡아두기 위해서다 —
  // 하이드레이션 직후 숫자가 채워질 때 레이아웃이 밀리지 않는다.
  const pad = (n: number) => String(n).padStart(2, '0')
  const tiles: [string, string][] =
    state === null
      ? [
          ['DAYS', '--'],
          ['HOUR', '--'],
          ['MIN', '--'],
          ['SEC', '--'],
        ]
      : [
          ['DAYS', pad(state.days)],
          ['HOUR', pad(state.hours)],
          ['MIN', pad(state.minutes)],
          ['SEC', pad(state.seconds)],
        ]

  return (
    <div className="mt-9 flex justify-center gap-5" aria-live="off">
      {tiles.map(([label, value]) => (
        <div key={label} className="text-center">
          <span className="block text-xl tabular-nums" style={{ color: 'var(--ink)' }}>
            {value}
          </span>
          <span className="block text-[10px] tracking-[0.1em]" style={{ color: 'var(--muted)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
