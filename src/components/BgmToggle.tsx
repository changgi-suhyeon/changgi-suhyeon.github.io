import { useRef, useState } from 'react'

interface Props {
  src: string
  title: string
}

export default function BgmToggle({ src, title }: Props) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(src)
      audioRef.current.loop = true
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
      return
    }
    // 자동재생 차단으로 실패할 수 있다. 조용히 무시하지 않고 상태를 되돌린다.
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? `${title} 음악 끄기` : `${title} 음악 켜기`}
      aria-pressed={playing}
      className="fixed top-3 right-3 z-40 w-11 h-11 rounded-full border text-sm"
      style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink)' }}
    >
      {playing ? '♪' : '♪̸'}
    </button>
  )
}
