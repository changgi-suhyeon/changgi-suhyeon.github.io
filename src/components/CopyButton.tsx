import { useState } from 'react'
import { copyText } from '../lib/copy'

interface Props {
  value: string
  label: string
}

type State = 'idle' | 'copied' | 'failed'

export default function CopyButton({ value, label }: Props) {
  const [state, setState] = useState<State>('idle')

  async function handleClick() {
    const ok = await copyText(value)
    setState(ok ? 'copied' : 'failed')
    if (ok) setTimeout(() => setState('idle'), 2000)
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        className="rounded border px-3 py-1 text-xs"
        style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
        aria-label={`${label} 계좌번호 복사`}
      >
        {state === 'copied' ? '복사됨' : '복사'}
      </button>

      {/* 복사가 실패했을 때 하객이 계좌번호를 얻는 유일한 경로다.
          카카오톡 인앱 브라우저에서 실제로 발생하며, 이 안내를 못 읽으면
          축의를 보낼 방법이 없어진다. 작게 만들지 말 것. */}
      {state === 'failed' && (
        <span className="text-sm text-right" style={{ color: 'var(--muted)' }}>
          자동 복사가 안 돼요. 아래 번호를 길게 눌러 복사해 주세요.
          <br />
          <span className="select-all" style={{ color: 'var(--ink)', userSelect: 'all' }}>
            {value}
          </span>
        </span>
      )}
    </span>
  )
}
