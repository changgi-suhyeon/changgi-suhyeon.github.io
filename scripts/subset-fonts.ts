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

// 하객이 실제로 화면에서 보게 될 특수문자/한자. 지금 wedding.ts 값이 비어 있어
// (혼주 deceased=false, bgm.src='') 오늘 빌드에는 아래 몇몇 글자가 아예 등장하지 않는다.
// 그건 깨진 게 아니라 해당 기능이 아직 꺼져 있는 것뿐이다 — 값이 채워지고 다시 빌드되면
// 이 스크립트가 astro build 직후 매번 다시 돌기 때문에(package.json build 참고) 자동으로
// 수집되어 서브셋에 포함된다. 여기서는 강제 포함하지 않고, 수집 결과만 진단 로그로 남긴다.
const WATCH_CHARS = ['菊', '·', '♪', '※', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

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
  const visible = html.replace(/<[^>]*>/g, ' ')
  const chars = [...new Set(visible)].join('')

  console.log(`수집한 글자 수: ${chars.length} (dist/admin 제외)`)

  const missing = WATCH_CHARS.filter((c) => !chars.includes(c))
  if (missing.length > 0) {
    console.log(
      `  참고: 오늘 빌드에 없는 감시 대상 글자: ${missing.join(' ')} ` +
        `(wedding.ts 값이 비어 있어 아직 화면에 등장하지 않음 — 값을 채우면 다음 빌드에 자동 포함됨)`,
    )
  }

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
