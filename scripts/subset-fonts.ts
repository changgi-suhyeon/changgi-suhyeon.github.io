import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import subsetFont from 'subset-font'

const DIST = 'dist'
const FONT_DIR = 'public/fonts'
const OUT_DIR = 'dist/fonts'

// 관리자 페이지는 서브셋 대상 텍스트에서 제외한다 — /admin은 --font-system(시스템 폰트)만
// 쓰고, AdminDashboard 자체도 client:only="react"라 정적 HTML에는 마운트 포인트뿐이다.
// 그래도 astro build 산출 구조가 바뀌어도(디렉터리 포맷 유지 전제) 안전하도록 명시적으로 뺀다.
const EXCLUDE = ['admin']

// 하객이 실제로 화면에서 보게 될 특수문자. 수집 결과 진단용이다.
const WATCH_CHARS = ['·', '♪', '※', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

// 원본 폰트 4개 어디에도 없는 글자. 서브셋은 원본에 없는 글자를 만들어낼 수 없으므로
// 강제 포함 목록에 넣어도 아무 일도 일어나지 않는다 — 넣어두면 "처리했다"는 착각만 남는다.
// 실측(2026-08-09): U+83CA(菊)는 GowunBatang Regular/Bold, Pretendard Regular/SemiBold
// 네 파일 모두에 glyph가 없다. 혼주가 고인일 때 이 한 글자는 항상 시스템 폴백 서체
// (iOS면 AppleMyungjo)로 렌더된다 — 고운바탕 본문 속에 한 글자만 다른 서체로 섞인다.
// 해결하려면 서브셋이 아니라 한자를 가진 폰트를 추가하거나 다른 표식을 써야 한다.
const NOT_IN_SOURCE_FONTS = ['菊']

// 아일랜드의 비초기 상태 문자열은 dist HTML에 절대 나타나지 않는다.
// collectText()는 astro build가 렌더한 HTML만 읽으므로, 빌드 시점에 존재하지 않는
// React 상태(카운트다운의 today/after, 복사 성공·실패, 라이트박스 열림)에서만
// 그려지는 글자는 영영 수집되지 않는다. 빠지면 tofu가 아니라 더 나쁜 것이 된다 —
// CSS 폰트 매칭이 글자 단위로 폴백해서 한 문장이 두 서체로 섞여 나온다.
//
// 여기에 적힌 것만이 서브셋에 들어간다 — 컴포넌트의 조건부 문구를 추가·수정할 때
// 반드시 함께 갱신할 것. 비용은 30KB 서브셋에 수백 바이트다.
const FORCED = [
  '오늘 저희가 결혼합니다', // Countdown.tsx phase:'today' — 예식 당일에만 뜬다
  '저희 결혼식이 무사히 끝났습니다', // Countdown.tsx phase:'after'
  '함께해 주셔서 감사합니다',
  '복사됨', // CopyButton.tsx / ShareButtons.tsx
  '자동 복사가 안 돼요. 아래 번호를 길게 눌러 복사해 주세요.', // CopyButton.tsx 실패 안내
  '‹›', // Lightbox.tsx 이전/다음 — 다이얼로그가 열려야 렌더된다
  '♪', // BgmToggle.tsx playing:true. 정지 상태(♪̸)만 정적 HTML에 나온다
  // 아래 RSVP 문구는 --font-system(시스템 폰트)이라 엄밀히는 불필요하다.
  // 넣어도 비용이 없고, 나중에 클래스가 바뀌어도 깨지지 않도록 함께 둔다.
  '전달 중…',
  '참석 여부를 전달했습니다. 감사합니다.',
  '수정이 필요하면 다시 제출해 주세요',
].join('')

async function collectText(dir: string): Promise<string> {
  let text = ''
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDE.includes(entry.name)) continue
      text += await collectText(full)
    } else if (entry.name.endsWith('.html')) {
      text += await readFile(full, 'utf8')
    }
  }
  return text
}

async function main() {
  const html = await collectText(DIST)
  // 태그를 걷어내고 남은 글자만 쓴다. (속성값만 담긴 텍스트 — 예: meta content — 는
  // 이 방식으로는 못 잡는다. 이 프로젝트에서는 og:description 등이 본문에도 같은
  // 텍스트로 노출되므로 문제되지 않았다. 새 텍스트를 attribute-only로 추가할 때는 유의할 것.)
  // 엔티티는 원문 그대로 두면 `&nbsp;`가 & n b s p ; 여섯 글자로 수집되고
  // 정작 U+00A0은 서브셋에서 빠진다. 태그를 걷어낸 뒤 디코드한다.
  // 지금 트리에는 &nbsp; 하나뿐이라 실질 영향은 없지만, 청첩장 조판에 흔히 쓰는
  // &middot; &hellip; &ndash; &mdash; 를 나중에 누가 손으로 써 넣으면 그 글자만
  // 다른 서체로 렌더된다 — 값이 채워진 뒤에는 아무도 다시 안 본다.
  const visible = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')

  const collected = new Set(visible)
  const chars = [...new Set(visible + FORCED)].join('')

  console.log(`수집한 글자 수: ${chars.length} (dist/admin 제외, 강제 포함 문자열 합산)`)

  // 정적 HTML에 없어서 FORCED가 건져낸 감시 글자를 알려준다. 목록이 비면
  // 데이터가 채워져 자연 수집됐다는 뜻이다 — 둘 다 정상이다.
  const rescued = WATCH_CHARS.filter((c) => !collected.has(c))
  if (rescued.length > 0) {
    console.log(
      `  참고: 정적 HTML에 없어 강제 포함으로 채운 감시 대상 글자: ${rescued.join(' ')}`,
    )
  }
  console.log(
    `  주의: 원본 폰트에 glyph가 없어 서브셋으로 해결 불가능한 글자: ` +
      `${NOT_IN_SOURCE_FONTS.join(' ')} (항상 시스템 폴백 서체로 렌더됨)`,
  )

  await mkdir(OUT_DIR, { recursive: true })

  for (const file of await readdir(FONT_DIR)) {
    if (!file.endsWith('.woff2')) continue
    const original = await readFile(path.join(FONT_DIR, file))
    const subset = await subsetFont(original, chars, { targetFormat: 'woff2' })
    await writeFile(path.join(OUT_DIR, file), subset)
    const before = (original.length / 1024).toFixed(0)
    const after = (subset.length / 1024).toFixed(0)
    console.log(`  ${file}: ${before}KB → ${after}KB`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
