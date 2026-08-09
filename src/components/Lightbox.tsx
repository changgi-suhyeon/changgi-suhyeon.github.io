import { useCallback, useEffect, useRef, useState } from 'react'
import type { GalleryPhoto } from '../data/wedding'

interface Props {
  photos: GalleryPhoto[]
}

/** 스와이프로 인정할 최소 가로 이동(px). 너무 작으면 탭이 스와이프로 오인된다. */
const SWIPE_MIN_PX = 50

/**
 * 대체 텍스트. gallery.json의 alt가 비어 있으면 순번으로 채운다.
 *
 * 데이터에 38번 적어두지 않는 이유가 두 가지 있다. 하나는 `npm run photos`가 매 실행마다
 * gallery.json을 통째로 덮어쓰므로 손으로 채운 값이 사진을 교체하는 날 조용히 날아간다는
 * 것이고, 다른 하나는 순번이라는 규칙을 한 곳에만 두는 편이 낫다는 것이다.
 * 나중에 특정 사진에 진짜 설명을 넣고 싶으면 그 항목의 alt만 채우면 이 폴백을 이긴다.
 */
function altFor(photo: GalleryPhoto, index: number): string {
  return photo.alt.trim() || `웨딩 사진 ${index + 1}`
}

/**
 * 큰 사진 한 장과 로딩 표시.
 *
 * 별도 컴포넌트인 이유는 로딩 상태를 이펙트로 되돌리지 않기 위해서다. 부모가
 * `key`로 사진마다 이 컴포넌트를 새로 마운트하므로 `loaded`가 자연히 false에서
 * 시작한다. 부모에 상태를 두고 useEffect로 되돌리면 경합이 생긴다 — 렌더와
 * 이펙트 사이에 onLoad가 끼어들면 이펙트가 그것을 false로 덮어써 **다 받은 사진
 * 위에서 스피너가 영원히 돈다.** 마운트 자체가 초기화이면 그 창이 없다.
 *
 * ref 콜백의 complete 확인은 그 위의 보험이다. 엘리먼트가 붙는 시점에 이미
 * 로드가 끝나 있으면 onLoad가 오지 않을 수 있다.
 */
function LightboxImage({ photo, index }: { photo: GalleryPhoto; index: number }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <>
      {/* LQIP를 배경으로 깔아 큰 사진이 오기 전에도 화면이 즉시 바뀐다.
          width/height를 주는 것이 중요하다 — 로드 전에는 내용이 없어 박스가
          접히고, 그러면 배경도 스피너도 놓일 자리가 없다. */}
      <img
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) setLoaded(true)
        }}
        src={`${photo.base}-1620.webp`}
        alt={altFor(photo, index)}
        width={photo.width}
        height={photo.height}
        onLoad={() => setLoaded(true)}
        // 못 받아도 스피너가 영원히 돌지는 않게 한다.
        onError={() => setLoaded(true)}
        className="max-w-full max-h-[100dvh] object-contain"
        style={{
          backgroundImage: `url(${photo.lqip})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {!loaded && (
        <span
          className="lightbox-spinner absolute w-8 h-8 rounded-full border-2 pointer-events-none"
          style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'rgba(255,255,255,0.9)' }}
          role="status"
          aria-label="사진 불러오는 중"
        />
      )}
    </>
  )
}

export default function Lightbox({ photos }: Props) {
  const [index, setIndex] = useState<number | null>(null)
  const isOpen = index !== null

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  // 스와이프 직후 브라우저가 click을 함께 쏘는 경우가 있다. 그대로 두면 사진을
  // 넘기려던 동작이 라이트박스를 닫아버린다.
  const swipedRef = useRef(false)

  const close = useCallback(() => setIndex(null), [])

  const go = useCallback(
    (delta: number) =>
      setIndex((i) => (i === null ? i : Math.min(photos.length - 1, Math.max(0, i + delta)))),
    [photos.length],
  )

  // 뒤로가기 = 닫기.
  useEffect(() => {
    if (!isOpen) return
    history.pushState({ lightbox: true }, '')
    const onPop = () => setIndex(null)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // 버튼으로 닫은 경우엔 우리가 쌓은 항목이 남아 있으므로 걷어낸다.
      // 뒤로가기로 닫힌 경우엔 이미 빠져 있어 조건이 false다.
      if (window.history.state?.lightbox) window.history.back()
    }
  }, [isOpen])

  // 배경 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  // 키보드
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close, go])

  // 앞뒤 사진을 미리 받아둔다. 하객은 대개 순서대로 넘기므로 다음 장은 거의 항상
  // 캐시에서 나오고, 그러면 버튼·스와이프가 즉시 반응한다. 이 프리페치가
  // 스피너보다 체감에 더 크게 기여한다 — 스피너는 기다림을 알려줄 뿐이고
  // 이건 기다림 자체를 없앤다.
  useEffect(() => {
    if (index === null) return
    for (const i of [index + 1, index - 1]) {
      const photo = photos[i]
      if (!photo) continue
      const img = new Image()
      img.src = `${photo.base}-1620.webp`
    }
  }, [index, photos])

  return (
    <>
      <ul className="grid grid-cols-3 gap-1">
        {photos.map((photo, i) => (
          <li key={photo.base}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block w-full aspect-square overflow-hidden"
              aria-label={`사진 ${i + 1} 크게 보기`}
            >
              <img
                src={`${photo.base}-640.webp`}
                alt={altFor(photo, i)}
                loading="lazy"
                decoding="async"
                width={photo.width}
                height={photo.height}
                style={{ backgroundImage: `url(${photo.lqip})`, backgroundSize: 'cover' }}
                className="w-full h-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92"
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
          // touchAction: 가로 제스처는 우리가 처리하고, 세로와 핀치줌은 브라우저에 남긴다.
          // 'none'으로 두면 사진 확대가 막힌다.
          style={{ touchAction: 'pan-y pinch-zoom' }}
          onClick={() => {
            // 스와이프가 끝나면서 함께 온 click이면 무시한다. 아니면 탭이므로 닫는다.
            if (swipedRef.current) {
              swipedRef.current = false
              return
            }
            close()
          }}
          onTouchStart={(e) => {
            const t = e.touches[0]
            if (!t || e.touches.length > 1) {
              // 두 손가락은 핀치줌이다. 스와이프로 세지 않는다.
              touchStartRef.current = null
              return
            }
            touchStartRef.current = { x: t.clientX, y: t.clientY }
          }}
          onTouchEnd={(e) => {
            const start = touchStartRef.current
            touchStartRef.current = null
            const t = e.changedTouches[0]
            if (!start || !t) return

            const dx = t.clientX - start.x
            const dy = t.clientY - start.y
            // 세로 이동이 더 크면 넘기려던 게 아니다. 사선 제스처를 사진 이동으로
            // 오인하면 하객이 의도하지 않은 사진으로 튄다.
            if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return

            swipedRef.current = true
            go(dx > 0 ? -1 : 1)
          }}
        >
          <LightboxImage key={photos[index]!.base} photo={photos[index]!} index={index} />

          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="absolute top-3 right-3 w-11 h-11 text-white text-2xl leading-none"
          >
            ×
          </button>

          {index > 0 && (
            <button
              type="button"
              aria-label="이전 사진"
              onClick={(e) => { e.stopPropagation(); go(-1) }}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-11 h-16 text-white text-2xl"
            >‹</button>
          )}
          {index < photos.length - 1 && (
            <button
              type="button"
              aria-label="다음 사진"
              onClick={(e) => { e.stopPropagation(); go(1) }}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-16 text-white text-2xl"
            >›</button>
          )}

          <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">
            {index + 1} / {photos.length}
          </p>
        </div>
      )}
    </>
  )
}
