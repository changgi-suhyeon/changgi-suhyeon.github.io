import { useEffect, useState } from 'react'
import { copyText } from '../lib/copy'

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean
      init: (key: string) => void
      Share: { sendDefault: (options: unknown) => void }
    }
  }
}

// `.trim()`이 핵심이다. 카카오 콘솔에서 키를 복사해 CI 변수에 붙이면 개행이 딸려오기 쉬운데,
// 그러면 값이 truthy라 버튼은 렌더되지만 `Kakao.init`이 실패해 영구히 비활성인 버튼이 남는다.
// 키가 없을 때 버튼을 숨기기로 한 이유가 바로 그 "죽은 버튼"을 피하려는 것이었다.
const KAKAO_KEY = (import.meta.env.PUBLIC_KAKAO_JS_KEY as string | undefined)?.trim() ?? ''
// 카카오 개발자 콘솔에서 앱을 만들어야 나오는 값이라 지금은 비어 있다.
// 죽은(disabled) 버튼을 보여주는 대신 아예 렌더하지 않는다 — 이 프로젝트의
// 선례(빈 값인 버튼·섹션을 숨기는 방식)를 따른다. 키가 채워지면 자동으로
// 두 버튼 레이아웃(grid-cols-2)이 된다.
const HAS_KAKAO = Boolean(KAKAO_KEY)

interface Props {
  title: string
  description: string
  imageUrl: string
  pageUrl: string
}

export default function ShareButtons({ title, description, imageUrl, pageUrl }: Props) {
  const [kakaoReady, setKakaoReady] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!HAS_KAKAO) return
    const src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js'
    if (document.querySelector(`script[src="${src}"]`)) return

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY)
      setKakaoReady(Boolean(window.Kakao?.isInitialized()))
    }
    document.head.appendChild(script)
  }, [])

  function shareKakao() {
    window.Kakao?.Share.sendDefault({
      objectType: 'feed',
      content: {
        title,
        description,
        imageUrl,
        link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
      },
      buttons: [{ title: '청첩장 보기', link: { mobileWebUrl: pageUrl, webUrl: pageUrl } }],
    })
  }

  async function copyLink() {
    const ok = await copyText(pageUrl)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 2000)
  }

  const buttonStyle = { borderColor: 'var(--line)', color: 'var(--ink)' }

  // 남은 버튼 수에 맞춰 열 수를 맞춘다(Location.astro의 mapGridClass와 동일한 방식).
  // 동적 문자열 보간(`grid-cols-${n}`)은 Tailwind가 소스에서 리터럴로 못 읽어
  // 스캔에서 빠지므로 쓰지 않는다 — 두 리터럴을 그대로 남겨 감지되게 한다.
  const gridClass = HAS_KAKAO ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'

  return (
    <div className={gridClass}>
      {HAS_KAKAO && (
        <button
          type="button"
          onClick={shareKakao}
          disabled={!kakaoReady}
          className="rounded border py-3 text-sm disabled:opacity-50"
          style={buttonStyle}
        >
          카카오톡 공유
        </button>
      )}
      <button type="button" onClick={copyLink} className="rounded border py-3 text-sm" style={buttonStyle}>
        {copied ? '복사됨' : '링크 복사'}
      </button>
    </div>
  )
}
