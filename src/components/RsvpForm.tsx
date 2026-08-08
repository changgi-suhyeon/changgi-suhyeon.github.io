import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import {
  MESSAGE_MAX,
  NAME_MAX,
  PARTY_MAX,
  type RsvpErrorBody,
  type RsvpPostResponse,
  type Side,
  type ValidationError,
} from '../lib/rsvp-contract'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          callback: (t: string) => void
          'error-callback'?: () => void
        },
      ) => string
      reset: (id?: string) => void
    }
  }
}

const ENDPOINT = import.meta.env.PUBLIC_RSVP_ENDPOINT as string
const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string
const STORAGE_KEY = 'rsvp-submitted'

type Status = 'idle' | 'sending' | 'done' | 'error'

interface Props {
  /** 예식이 지났으면 폼 대신 마감 안내를 보여준다. */
  closed: boolean
  /** 반복 실패 시 안내할 대체 연락처 */
  fallbackPhone: string
}

export default function RsvpForm({ closed, fallbackPhone }: Props) {
  const [side, setSide] = useState<Side | ''>('')
  const [name, setName] = useState('')
  const [attending, setAttending] = useState<boolean | null>(null)
  const [partySize, setPartySize] = useState(1)
  const [mealCount, setMealCount] = useState(1)
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const [status, setStatus] = useState<Status>('idle')
  const [fieldErrors, setFieldErrors] = useState<ValidationError[]>([])
  const [errorText, setErrorText] = useState('')
  const [failCount, setFailCount] = useState(0)
  const [alreadySent, setAlreadySent] = useState(false)

  const tokenRef = useRef('')
  const widgetRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)

  // localStorage는 쿠키·사이트 데이터를 막은 브라우저와 일부 인앱 웹뷰에서 SecurityError를 던진다.
  // 여기서 던지면 에러 바운더리가 없어 아일랜드 전체가 언마운트되고 — 즉 RSVP 폼이 통째로 사라진다.
  useEffect(() => {
    try {
      setAlreadySent(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      setAlreadySent(false)
    }
  }, [])

  // 참석 인원을 줄이면 식사 인원도 따라 줄인다. 서버가 거부할 조합을 애초에 못 만들게 한다.
  // `partySize < 1`일 때 건너뛰는 가드가 핵심이다. `Number('')`는 0이므로, 하객이 인원을
  // 1에서 3으로 고치려고 백스페이스를 누르는 순간 partySize가 0이 되고, 가드가 없으면
  // 그 찰나에 mealCount가 0으로 확정된다. 서버는 0 <= 0 <= 3이라 정상 수락한다.
  useEffect(() => {
    if (partySize < 1) return
    setMealCount((current) => Math.min(current, partySize))
  }, [partySize])

  // Turnstile 스크립트 로드와 위젯 렌더
  useEffect(() => {
    if (closed) return
    const src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    const existing = document.querySelector(`script[src="${src}"]`)

    const render = () => {
      if (!widgetRef.current || !window.turnstile || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => {
          tokenRef.current = token
        },
        'error-callback': () => {
          tokenRef.current = ''
        },
      })
    }

    if (existing) {
      render()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = render
    document.head.appendChild(script)
    // `status`가 deps에 있어야 done → idle 복귀 시 이펙트가 다시 돌아 위젯을 렌더한다.
    // `[closed]`만 두면 폼으로 돌아와도 컨테이너가 빈 채 남는다.
  }, [closed, status])

  const errorFor = (field: string) => fieldErrors.find((e) => e.field === field)?.message

  // 화면에 렌더 슬롯이 있는 필드 목록. 여기 없는 필드 에러(turnstileToken, `_` 등)는
  // 어느 칸에도 표시되지 않아 하객이 "입력값을 확인해 주세요"만 보고 갈 곳을 잃는다.
  // 그래서 남는 것들은 아래 에러 박스에 함께 출력한다.
  const RENDERED_FIELDS = ['side', 'name', 'attending', 'partySize', 'mealCount', 'phone', 'message']
  const unrenderedErrors = fieldErrors.filter((e) => !RENDERED_FIELDS.includes(e.field))

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setFieldErrors([])
    setErrorText('')

    try {
      const response = await fetch(`${ENDPOINT}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          name,
          attending,
          partySize: attending ? partySize : 0,
          mealCount: attending ? mealCount : 0,
          phone: phone || undefined,
          message: message || undefined,
          turnstileToken: tokenRef.current,
        }),
      })

      const raw: unknown = await response.json().catch(() => ({}))
      const data = raw as Partial<RsvpErrorBody & RsvpPostResponse>

      // 상태 코드로 분기하지 않는다. 서버가 새 상태 코드(503/500 등)를 추가해도
      // !response.ok 판정 하나로 전부 실패 경로에 걸리게 한다 — 성공으로 새어나가지 않는다.
      if (!response.ok) {
        // 입력값은 절대 지우지 않는다. 폼이 비워지면 다시 쓰지 않는다.
        setFieldErrors(data.fields ?? [])
        setErrorText(data.error ?? '전달에 실패했어요. 잠시 후 다시 시도해 주세요.')
        setFailCount((n) => n + 1)
        setStatus('error')
        window.turnstile?.reset(widgetIdRef.current)
        tokenRef.current = ''
        return
      }

      // 200인데 본문이 계약과 다르면 저장 여부를 확신할 수 없다. 성공으로 취급하지 않는다.
      if (data.ok !== true || typeof data.id !== 'number') {
        setErrorText('전달 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
        setFailCount((n) => n + 1)
        setStatus('error')
        window.turnstile?.reset(widgetIdRef.current)
        tokenRef.current = ''
        return
      }

      // 상태를 먼저 확정한 뒤 localStorage를 건드린다. 순서가 반대면,
      // 저장은 성공했는데 setItem이 던지는 브라우저에서 아래 catch가 그것을 잡아
      // "전달에 실패했어요"를 띄우고, 하객이 재제출해 중복 행이 생긴다.
      setStatus('done')
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // 플래그를 못 남겨도 제출 자체는 성공했다. 조용히 넘어간다.
      }

      // Turnstile 토큰은 일회용이다. 성공 후에도 비우지 않으면
      // "수정" 경로에서 소비된 토큰이 재전송돼 서버가 403을 준다.
      window.turnstile?.reset(widgetIdRef.current)
      tokenRef.current = ''
    } catch {
      setErrorText('전달에 실패했어요. 통신 상태를 확인하고 다시 시도해 주세요.')
      setFailCount((n) => n + 1)
      setStatus('error')
      window.turnstile?.reset(widgetIdRef.current)
      tokenRef.current = ''
    }
  }

  if (closed) {
    return (
      <p className="text-center text-sm leading-loose font-system">
        참석 여부 접수가 마감되었습니다.
        <br />
        함께해 주셔서 감사합니다.
      </p>
    )
  }

  if (status === 'done') {
    return (
      <div className="text-center text-sm leading-loose font-system">
        <p style={{ color: 'var(--ink)' }}>참석 여부를 전달했습니다. 감사합니다.</p>
        <button
          type="button"
          onClick={() => {
            // done 화면이 뜨는 동안 폼 서브트리가 언마운트돼 Turnstile 위젯 컨테이너도 사라진다.
            // widgetIdRef를 비우지 않으면 렌더 이펙트의 가드가 막아 위젯이 영영 안 뜬다.
            widgetIdRef.current = undefined
            tokenRef.current = ''
            setStatus('idle')
          }}
          className="mt-4 underline"
          style={{ color: 'var(--muted)' }}
        >
          수정이 필요하면 다시 제출해 주세요
        </button>
      </div>
    )
  }

  const inputClass = 'w-full rounded border px-3 py-2 text-sm font-system'
  const inputStyle = { borderColor: 'var(--line)', background: 'var(--input-bg)', color: 'var(--ink)' }

  return (
    <form onSubmit={submit} className="space-y-4 font-system">
      {alreadySent && (
        <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
          이미 전달해 주셨어요. 내용을 바꾸시려면 다시 제출하시면 됩니다.
        </p>
      )}

      <fieldset>
        <legend className="text-sm mb-2">어느 쪽 하객이신가요?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['groom', 'bride'] as Side[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSide(value)}
              className="rounded border py-2 text-sm"
              style={{
                borderColor: side === value ? 'var(--ink)' : 'var(--line)',
                background: side === value ? 'var(--ink)' : 'transparent',
                color: side === value ? 'var(--bg)' : 'var(--ink)',
              }}
              aria-pressed={side === value}
            >
              {value === 'groom' ? '신랑측' : '신부측'}
            </button>
          ))}
        </div>
        {errorFor('side') && (
          <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errorFor('side')}</p>
        )}
      </fieldset>

      <div>
        <label htmlFor="rsvp-name" className="block text-sm mb-1">성함</label>
        <input id="rsvp-name" value={name} onChange={(e) => setName(e.target.value)}
               maxLength={NAME_MAX} className={inputClass} style={inputStyle} autoComplete="name" />
        {errorFor('name') && (
          <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errorFor('name')}</p>
        )}
      </div>

      <fieldset>
        <legend className="text-sm mb-2">참석하시나요?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setAttending(value)}
              className="rounded border py-2 text-sm"
              style={{
                borderColor: attending === value ? 'var(--ink)' : 'var(--line)',
                background: attending === value ? 'var(--ink)' : 'transparent',
                color: attending === value ? 'var(--bg)' : 'var(--ink)',
              }}
              aria-pressed={attending === value}
            >
              {value ? '참석' : '불참'}
            </button>
          ))}
        </div>
        {errorFor('attending') && (
          <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errorFor('attending')}</p>
        )}
      </fieldset>

      {/* 불참이면 인원을 묻지 않는다. 물으면 이탈한다. */}
      {attending === true && (
        <>
          <div>
            <label htmlFor="rsvp-party" className="block text-sm mb-1">
              본인 포함 총 참석 인원
            </label>
            <input id="rsvp-party" type="number" inputMode="numeric" min={1} max={PARTY_MAX}
                   value={partySize}
                   onChange={(e) => setPartySize(Number(e.target.value))}
                   className={inputClass} style={inputStyle} />
            {errorFor('partySize') && (
              <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errorFor('partySize')}</p>
            )}
          </div>

          <div>
            <label htmlFor="rsvp-meal" className="block text-sm mb-1">
              식사하실 인원
            </label>
            <input id="rsvp-meal" type="number" inputMode="numeric" min={0} max={partySize}
                   value={mealCount}
                   onChange={(e) => setMealCount(Number(e.target.value))}
                   className={inputClass} style={inputStyle} />
            {errorFor('mealCount') && (
              <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errorFor('mealCount')}</p>
            )}
          </div>
        </>
      )}

      <div>
        <label htmlFor="rsvp-phone" className="block text-sm mb-1">
          연락처 <span style={{ color: 'var(--muted)' }}>(선택)</span>
        </label>
        <input id="rsvp-phone" type="tel" inputMode="tel" value={phone}
               onChange={(e) => setPhone(e.target.value)}
               className={inputClass} style={inputStyle} autoComplete="tel" />
        {errorFor('phone') && (
          <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errorFor('phone')}</p>
        )}
      </div>

      <div>
        <label htmlFor="rsvp-message" className="block text-sm mb-1">
          전하실 말씀 <span style={{ color: 'var(--muted)' }}>(선택)</span>
        </label>
        <textarea id="rsvp-message" value={message} rows={3} maxLength={MESSAGE_MAX}
                  onChange={(e) => setMessage(e.target.value)}
                  className={inputClass} style={inputStyle} />
        {errorFor('message') && (
          <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errorFor('message')}</p>
        )}
      </div>

      <div ref={widgetRef} className="flex justify-center" />

      {status === 'error' && (
        <div className="rounded border px-3 py-2 text-xs leading-relaxed"
             style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          <p>{errorText}</p>
          {/* 렌더 슬롯이 없는 필드 에러를 여기서 건진다. 보안 확인 실패가 대표적인데,
              이걸 빠뜨리면 하객은 어느 칸도 빨갛지 않은 채 "입력값을 확인하라"는 말만 본다. */}
          {unrenderedErrors.map((e) => (
            <p key={e.field} className="mt-1">{e.message}</p>
          ))}
          {/* 막다른 길을 만들지 않는다. */}
          {failCount >= 2 && (
            <p className="mt-2">
              계속 실패한다면 <a href={`sms:${fallbackPhone}`} className="underline">
              문자로 알려주셔도</a> 됩니다.
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={status === 'sending'}
              className="w-full rounded py-3 text-sm disabled:opacity-60"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
        {status === 'sending' ? '전달 중…' : '전달하기'}
      </button>

      <p className="text-center text-[13px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        입력하신 정보는 예식 준비 목적으로만 사용하며 예식 후 파기합니다.
      </p>
    </form>
  )
}
