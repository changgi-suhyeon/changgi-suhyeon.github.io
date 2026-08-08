import { useEffect, useState } from 'react'
import { getDdayState, type DdayState } from '../lib/dday'

interface Props {
  weddingIso: string
}

export default function Countdown({ weddingIso }: Props) {
  const [state, setState] = useState<DdayState>(() => getDdayState(weddingIso, Date.now()))

  useEffect(() => {
    // 'before'가 아니면 갱신할 것이 없다. 타이머를 걸지 않는다.
    if (state.phase !== 'before') return
    const id = setInterval(() => setState(getDdayState(weddingIso, Date.now())), 1000)
    return () => clearInterval(id)
  }, [weddingIso, state.phase])

  if (state.phase === 'today') {
    return (
      <p className="mt-9 text-center font-serif-kr text-[17px]" style={{ color: 'var(--ink)' }}>
        오늘 저희가 결혼합니다
      </p>
    )
  }

  if (state.phase === 'after') {
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

  const tiles: [string, number][] = [
    ['DAYS', state.days],
    ['HOUR', state.hours],
    ['MIN', state.minutes],
    ['SEC', state.seconds],
  ]

  return (
    <div className="mt-9 flex justify-center gap-5" aria-live="off">
      {tiles.map(([label, value]) => (
        <div key={label} className="text-center">
          <span className="block text-xl tabular-nums" style={{ color: 'var(--ink)' }}>
            {String(value).padStart(2, '0')}
          </span>
          <span className="block text-[10px] tracking-[0.1em]" style={{ color: 'var(--muted)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
