import { useEffect, useRef, useState } from 'react'

// 카카오 지도 SDK의 최소 타입. 전체 타입 패키지(@types/kakao.maps.d.ts)를 넣으면
// 쓰지도 않는 수백 개 선언이 딸려온다 — 여기서 실제로 부르는 것만 적는다.
interface KakaoLatLng {}
interface KakaoMapInstance {
  setDraggable: (v: boolean) => void
  setZoomable: (v: boolean) => void
  relayout: () => void
  setCenter: (latlng: KakaoLatLng) => void
}
interface KakaoMaps {
  load: (cb: () => void) => void
  LatLng: new (lat: number, lng: number) => KakaoLatLng
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance
  Marker: new (options: { map: KakaoMapInstance; position: KakaoLatLng }) => unknown
  CustomOverlay: new (options: {
    map: KakaoMapInstance
    position: KakaoLatLng
    content: string
    yAnchor: number
  }) => unknown
}

declare global {
  interface Window {
    kakao?: { maps?: KakaoMaps }
  }
}

// ShareButtons와 같은 키를 쓴다. `.trim()`을 하는 이유도 같다 — 콘솔에서 복사한 값에
// 개행이 딸려오면 공백뿐인 문자열이 truthy라 모든 존재 검사를 통과하고, 지도는
// 영영 안 뜨는데 원인은 안 보인다.
const KAKAO_KEY = (import.meta.env.PUBLIC_KAKAO_JS_KEY as string | undefined)?.trim() ?? ''
const HAS_KAKAO = Boolean(KAKAO_KEY)

const SDK_SRC = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`

interface Props {
  lat: number
  lng: number
  /** 마커 위에 띄울 이름. 지도만 있으면 어느 건물인지 알 수 없다. */
  label: string
  /** 클수록 축소. 3이면 건물 몇 개가 보이는 정도다. */
  level?: number
}

/**
 * 카카오 지도 인터랙티브 지도.
 *
 * **실패하면 아무것도 그리지 않는다.** 부모(Location.astro)가 정적 지도 이미지를 먼저
 * 깔아두고 이 아일랜드를 그 위에 절대배치하므로, 지도가 안 뜨면 하객은 이미지를 본다.
 * 빈 회색 박스가 남는 것보다 낫고, 어차피 지도앱 딥링크 버튼은 그 아래에 따로 있다.
 * 실패 경로가 여럿이라 이 폴백이 중요하다 — 키 미설정, 도메인 미등록(카카오 콘솔에
 * 배포 주소를 넣지 않으면 SDK가 거부한다), 카카오톡 인앱 웹뷰의 스크립트 차단.
 */
export default function KakaoMap({ lat, lng, label, level = 3 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  // 지도가 처음에는 드래그·확대를 받지 않는다. 폰에서 페이지를 스크롤하다 손가락이
  // 지도 위에 닿으면 스크롤 대신 지도가 끌려가 페이지에 갇히기 때문이다.
  // 한 번 탭하면 그때부터 조작할 수 있다.
  const [active, setActive] = useState(false)
  const mapRef = useRef<KakaoMapInstance | null>(null)

  useEffect(() => {
    if (!HAS_KAKAO) return

    let cancelled = false

    function init() {
      if (cancelled) return
      const maps = window.kakao?.maps
      const container = containerRef.current
      if (!maps || !container) return

      // autoload=false로 받았으므로 maps.load()를 거쳐야 생성자들이 준비된다.
      maps.load(() => {
        if (cancelled || !containerRef.current) return
        try {
          const center = new maps.LatLng(lat, lng)
          const map = new maps.Map(containerRef.current, { center, level })
          map.setDraggable(false)
          map.setZoomable(false)
          new maps.Marker({ map, position: center })
          new maps.CustomOverlay({
            map,
            position: center,
            yAnchor: 2.2,
            content:
              `<div style="padding:4px 10px;border-radius:9999px;white-space:nowrap;` +
              `background:var(--bg);border:1px solid var(--line);color:var(--ink);` +
              `font-size:13px;line-height:1.6">${label}</div>`,
          })
          mapRef.current = map
          setReady(true)
        } catch {
          // 생성 중 어떤 이유로든 던지면 지도를 포기한다. 정적 이미지가 남는다.
        }
      })
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`)
    if (existing) {
      // 다른 인스턴스가 이미 심어뒀다. 로드가 끝났으면 바로, 아니면 onload를 기다린다.
      if (window.kakao?.maps) init()
      else existing.addEventListener('load', init)
      return () => {
        cancelled = true
        existing.removeEventListener('load', init)
      }
    }

    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.onload = init
    // onerror는 붙이지만 할 일이 없다 — ready가 false로 남아 정적 이미지가 그대로 보인다.
    document.head.appendChild(script)

    return () => {
      cancelled = true
      script.onload = null
    }
  }, [lat, lng, label, level])

  if (!HAS_KAKAO) return null

  function activate() {
    const map = mapRef.current
    if (!map) return
    map.setDraggable(true)
    map.setZoomable(true)
    setActive(true)
  }

  return (
    <>
      {/* 지도가 준비되기 전에는 투명하게 둔다. 뒤에 깔린 정적 이미지가 그대로 보이고,
          준비되면 그 위를 덮는다. display:none으로 숨기면 컨테이너 크기가 0이라
          지도가 잘못된 크기로 초기화된다. */}
      <div
        ref={containerRef}
        aria-hidden={!ready}
        className="absolute inset-0 rounded-lg"
        style={{ opacity: ready ? 1 : 0, pointerEvents: ready && active ? 'auto' : 'none' }}
      />
      {ready && !active && (
        <button
          type="button"
          onClick={activate}
          className="absolute inset-0 flex items-end justify-center rounded-lg pb-3"
          aria-label="지도 조작 활성화"
        >
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--body)' }}
          >
            탭하면 지도를 움직일 수 있어요
          </span>
        </button>
      )}
    </>
  )
}
