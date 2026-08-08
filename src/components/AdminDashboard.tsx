import { useEffect, useState, type SyntheticEvent } from 'react'
import type { RsvpRecord, RsvpSummary } from '../lib/rsvp-contract'
import { toCsv } from '../lib/csv'

const ENDPOINT = import.meta.env.PUBLIC_RSVP_ENDPOINT as string
const TOKEN_KEY = 'rsvp-admin-token'

export default function AdminDashboard() {
  const [token, setToken] = useState('')
  const [records, setRecords] = useState<RsvpRecord[] | null>(null)
  const [summary, setSummary] = useState<RsvpSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // sessionStorage는 쿠키·사이트 데이터를 막은 브라우저와 일부 인앱 웹뷰에서 SecurityError를
  // 던진다. 여기서 던지면 에러 바운더리가 없어 아일랜드 전체가 언마운트되고 — 즉 관리자
  // 페이지가 통째로 사라진다. useState 초기화 함수 안이 아니라 effect 안에서, try/catch로
  // 감싸 읽는다.
  useEffect(() => {
    try {
      setToken(sessionStorage.getItem(TOKEN_KEY) ?? '')
    } catch {
      // 저장된 토큰 없이 시작한다. 하객 페이지에 미치는 영향은 없다 — 이 페이지는 관리자만 쓴다.
    }
  }, [])

  async function load(event?: SyntheticEvent<HTMLFormElement>) {
    event?.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${ENDPOINT}/rsvp`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        setError('토큰이 올바르지 않습니다.')
        return
      }
      if (!response.ok) {
        setError(`조회에 실패했습니다 (${response.status})`)
        return
      }
      const data = (await response.json()) as { records: RsvpRecord[]; summary: RsvpSummary }
      setRecords(data.records)
      setSummary(data.summary)
      // 실패해도 화면에 이미 뜬 결과에는 영향이 없으므로 조용히 넘어간다.
      try {
        sessionStorage.setItem(TOKEN_KEY, token)
      } catch {
        // 공용 기기 등에서 저장이 막혀도 조회 자체는 이미 끝났다.
      }
    } catch {
      setError('통신에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function download() {
    if (!records) return
    const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'rsvp.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  // 같은 (측, 이름)이 여러 번 나오면 표시해준다. 최신 건이 위에 온다.
  const duplicates = new Set<string>()
  const seen = new Set<string>()
  for (const r of records ?? []) {
    const key = `${r.side}|${r.name}`
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }

  return (
    <div className="font-system max-w-3xl mx-auto p-4 text-sm">
      <form onSubmit={load} className="flex gap-2 mb-6">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="관리자 토큰"
          className="flex-1 rounded border px-3 py-2"
          style={{ borderColor: 'var(--line)' }}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded px-4 disabled:opacity-60"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}
        >
          {loading ? '조회 중…' : '조회'}
        </button>
      </form>

      {error && (
        <p className="mb-4" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {summary && (
        <dl className="grid grid-cols-3 gap-2 mb-6">
          {(
            [
              ['총 응답', summary.total],
              ['참석', summary.attending],
              ['불참', summary.notAttending],
              ['신랑측 인원', summary.groomGuests],
              ['신부측 인원', summary.brideGuests],
              ['식사 인원', summary.totalMeals],
              // 0이 아니면 동측 동명이인이 접혔을 수 있다 — 실제로 다른 사람일 수 있으므로 목록을 봐야 한다.
              ['중복 제출', summary.duplicateSubmissions],
            ] as [string, number][]
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded border p-3 text-center"
              style={{ borderColor: 'var(--line)' }}
            >
              <dt className="text-xs" style={{ color: 'var(--muted)' }}>
                {label}
              </dt>
              <dd className="text-lg" style={{ color: 'var(--ink)' }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {records && (
        <>
          <button
            type="button"
            onClick={download}
            className="mb-4 rounded border px-3 py-2"
            style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
          >
            CSV 다운로드
          </button>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  {['제출', '구분', '성함', '참석', '인원', '식사', '연락처', '말씀'].map((h) => (
                    <th
                      key={h}
                      className="border-b py-2 pr-3 text-xs font-normal whitespace-nowrap"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const isDup = duplicates.has(`${r.side}|${r.name}`)
                  return (
                    <tr key={r.id} style={isDup ? { background: 'var(--surface)' } : undefined}>
                      {/* createdAt이 아니라 createdMs를 쓴다. createdAt은 타임존 표식이 없는
                          UTC 문자열이라 new Date()가 로컬로 파싱해 9시간 이르게 표시된다. */}
                      <td
                        className="border-b py-2 pr-3 text-xs whitespace-nowrap"
                        style={{ borderColor: 'var(--line)' }}
                      >
                        {new Date(r.createdMs).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                      </td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.side === 'groom' ? '신랑측' : '신부측'}
                      </td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.name}
                        {isDup && <span title="중복 제출"> ※</span>}
                      </td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.attending ? '참석' : '불참'}
                      </td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.partySize}
                      </td>
                      <td className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                        {r.mealCount}
                      </td>
                      <td
                        className="border-b py-2 pr-3 text-xs"
                        style={{ borderColor: 'var(--line)' }}
                      >
                        {r.phone ?? ''}
                      </td>
                      <td className="border-b py-2 text-xs" style={{ borderColor: 'var(--line)' }}>
                        {r.message ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {duplicates.size > 0 && (
            <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              ※ 표시는 같은 이름으로 여러 번 제출된 건입니다. 집계는 가장 최근 건만 반영합니다.
            </p>
          )}
        </>
      )}
    </div>
  )
}
