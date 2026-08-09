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
import { RSVP_ENDPOINT } from '../lib/public-env'

// 값이 비면 프로덕션 빌드를 중단시킨다. 이유는 public-env.ts 주석 참고.
const ENDPOINT = RSVP_ENDPOINT
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

  // 허니팟. 사람은 볼 수 없는 칸이라 항상 ''이어야 한다 — 값이 차 있으면 서버가 봇으로 본다.
  const [honeypot, setHoneypot] = useState('')

  // 폼이 뜬 시각. 제출까지 3초도 안 걸렸으면 서버가 봇으로 본다.
  // useState 초기화자가 아니라 useEffect에서 채우는 이유: 이 아일랜드는 SSR도 되므로
  // 초기화자에 Date.now()를 넣으면 빌드 시각이 렌더 결과에 섞여 들어갈 수 있다.
  // Countdown이 정확히 그 이유로 하이드레이션이 깨졌었다.
  const mountedAtRef = useRef(0)

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

  // 마운트 시각을 한 번만 기록한다. "수정" 경로로 돌아와도 아일랜드는 언마운트되지
  // 않으므로 값이 유지되고, 그때 elapsed는 더 커진다 — 오래 머문 하객을 막지 않는다.
  useEffect(() => {
    mountedAtRef.current = Date.now()
  }, [])

  const errorFor = (field: string) => fieldErrors.find((e) => e.field === field)?.message

  // 화면에 렌더 슬롯이 있는 필드 목록. 여기 없는 필드 에러(`_` 등)는
  // 어느 칸에도 표시되지 않아 하객이 "입력값을 확인해 주세요"만 보고 갈 곳을 잃는다.
  // 그래서 남는 것들은 아래 에러 박스에 함께 출력한다.
  const RENDERED_FIELDS = ['side', 'name', 'attending', 'partySize', 'mealCount', 'phone', 'message']
  const unrenderedErrors = fieldErrors.filter((e) => !RENDERED_FIELDS.includes(e.field))

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    // setStatus보다 먼저 읽는다. await 뒤로 밀면 그 사이 재렌더가 끼어들 수 있다.
    // 마운트 이펙트가 아직 안 돌았으면(0) 값을 보내지 않는다 — 서버는 없는 값을
    // 통과시키므로, 측정 못 한 것을 이유로 하객을 막지 않는다.
    const elapsedMs = mountedAtRef.current > 0 ? Date.now() - mountedAtRef.current : undefined

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
          honeypot,
          elapsedMs,
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
        return
      }

      // 200인데 본문이 계약과 다르면 저장 여부를 확신할 수 없다. 성공으로 취급하지 않는다.
      if (data.ok !== true || typeof data.id !== 'number') {
        setErrorText('전달 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
        setFailCount((n) => n + 1)
        setStatus('error')
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
    } catch {
      setErrorText('전달에 실패했어요. 통신 상태를 확인하고 다시 시도해 주세요.')
      setFailCount((n) => n + 1)
      setStatus('error')
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
          onClick={() => setStatus('idle')}
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

      {/* 허니팟 — 사람에게는 보이지 않고 봇에게만 보이는 칸.
          - display:none 대신 화면 밖으로 밀어낸다. 숨긴 필드를 건너뛰는 봇이 있다.
          - autoComplete는 반드시 'off'이고 name도 표준 autofill 토큰이 아니어야 한다.
            'company'나 'nickname'처럼 브라우저가 아는 이름을 쓰면 자동완성이 값을 채워
            **진짜 하객이 봇으로 몰려 차단된다.** 이 칸의 유일한 실패 방식이 그것이다.
          - tabIndex=-1과 aria-hidden으로 키보드·스크린리더 흐름에서도 뺀다. */}
      <input
        type="text"
        name="rsvp-extra"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
      />

      {status === 'error' && (
        // role="alert"이 없으면 스크린리더 사용자는 제출이 실패한 사실을 통보받지
        // 못한다. 메시지가 제출 버튼 위에 조용히 나타날 뿐이라, 버튼만 다시 누르게 된다.
        <div role="alert"
             className="rounded border px-3 py-2 text-xs leading-relaxed"
             style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          <p>{errorText}</p>
          {/* 렌더 슬롯이 없는 필드 에러('_')를 여기서 건진다. 이걸 빠뜨리면 하객은
              어느 칸도 빨갛지 않은 채 "입력값을 확인하라"는 말만 보고 갈 곳을 잃는다. */}
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

      {/* text-balance가 없으면 390px 폭에서 마지막 줄에 '다.' 한 글자만 떨어져 나온다.
          두 줄 길이를 고르게 나눠 그 고아 줄을 없앤다. */}
      <p
        className="text-center text-[13px] leading-relaxed text-balance"
        style={{ color: 'var(--muted)' }}
      >
        입력하신 정보는 예식 준비 목적으로만 사용하며 예식 후 파기합니다.
      </p>
    </form>
  )
}
