import { useCallback, useEffect, useState } from 'react'
import type { GalleryPhoto } from '../data/wedding'

interface Props {
  photos: GalleryPhoto[]
}

export default function Lightbox({ photos }: Props) {
  const [index, setIndex] = useState<number | null>(null)
  const isOpen = index !== null

  const close = useCallback(() => setIndex(null), [])

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
      if (e.key === 'ArrowLeft') setIndex((i) => (i === null ? i : Math.max(0, i - 1)))
      if (e.key === 'ArrowRight')
        setIndex((i) => (i === null ? i : Math.min(photos.length - 1, i + 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, photos.length, close])

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
                alt={photo.alt}
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
          onClick={close}
        >
          <img
            src={`${photos[index]!.base}-1620.webp`}
            alt={photos[index]!.alt}
            className="max-w-full max-h-[100dvh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

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
              onClick={(e) => { e.stopPropagation(); setIndex(index - 1) }}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-11 h-16 text-white text-2xl"
            >‹</button>
          )}
          {index < photos.length - 1 && (
            <button
              type="button"
              aria-label="다음 사진"
              onClick={(e) => { e.stopPropagation(); setIndex(index + 1) }}
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
