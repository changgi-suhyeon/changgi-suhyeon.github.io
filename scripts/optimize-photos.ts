import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT_DIR = 'public/photos'
const MANIFEST = 'src/data/gallery.json'
const WIDTHS = [640, 1080, 1620]

// OG 표준 크기. 카카오톡·페이스북 스크래퍼가 이 비율(1.91:1)을 기대하고,
// 어긋나면 스크래퍼가 제멋대로 잘라서 구도를 통제할 수 없다.
const OG_SIZE = { width: 1200, height: 630 }

// OG는 webp가 아니라 jpg로 낸다. 카카오 스크래퍼의 webp 지원이 확실하지 않고,
// 미리보기가 안 뜨는 것은 재배포로도 바로 고쳐지지 않는다(스크래퍼가 캐시한다).
// 갤러리와 달리 딱 한 장이라 용량 이득도 무의미하다.
const OG_FILE = 'og.jpg'

interface GalleryPhoto {
  base: string
  width: number
  height: number
  lqip: string
  alt: string
}

function usage(message: string): never {
  console.error(`오류: ${message}\n`)
  console.error('사용법: npm run photos -- <원본_디렉터리> --hero <파일명> [--og <파일명>]')
  console.error('  <원본_디렉터리>  jpg·png·webp 원본을 모아둔 디렉터리 (저장소 밖에 두는 것을 권장)')
  console.error('  --hero <파일명>  히어로 배경 사진. 갤러리에도 함께 들어간다.')
  console.error('  --og   <파일명>  카카오톡 공유 미리보기 사진. 1200x630으로 중앙 크롭된다.')
  console.error('\n예: npm run photos -- ~/Desktop/wedding-photos --hero KIPT3152-3.webp --og KIPT1396-3.webp')
  process.exit(1)
}

function parseArgs(argv: string[]) {
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--hero' || arg === '--og') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) usage(`${arg} 뒤에 파일명이 없다.`)
      flags[arg.slice(2)] = value
    } else {
      positional.push(arg)
    }
  }
  return { src: positional[0], hero: flags.hero, og: flags.og }
}

async function main() {
  const { src, hero, og } = parseArgs(process.argv.slice(2))

  if (!src) usage('원본 디렉터리를 지정해야 한다.')
  if (!hero) usage('--hero 로 히어로 사진을 지정해야 한다.')

  await mkdir(OUT_DIR, { recursive: true })

  // webp를 빠뜨리면 안 된다. 스튜디오에서 받는 원본이 jpg라는 보장이 없고,
  // 확장자가 안 걸리면 그 파일은 조용히 건너뛰어진다 — 에러 없이, 그냥 없는 사진이 된다.
  const files = (await readdir(src))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()

  // 한 장도 못 찾았는데 계속 진행하면 매니페스트를 빈 배열로 덮어써서 갤러리가 통째로
  // 사라진다. 그것도 빌드는 성공한 채로. 조용히 지우느니 여기서 죽는 편이 낫다.
  if (files.length === 0) {
    usage(`${src} 에서 jpg·png·webp 파일을 하나도 찾지 못했다.`)
  }

  // 오타 하나로 히어로가 없는 사이트가 배포되는 것을 막는다. 아래 루프에서
  // 매칭에 실패해도 아무 일도 일어나지 않으므로, 시작 전에 확인해야 한다.
  if (!files.includes(hero)) {
    usage(`--hero 로 지정한 '${hero}' 가 ${src} 에 없다. 있는 파일: ${files.slice(0, 5).join(', ')} …`)
  }
  if (og && !files.includes(og)) {
    usage(`--og 로 지정한 '${og}' 가 ${src} 에 없다.`)
  }

  const manifest: GalleryPhoto[] = []

  for (const file of files) {
    const name = path.parse(file).name
    const input = path.join(src, file)
    const meta = await sharp(input).metadata()
    const srcWidth = meta.width ?? 0
    const srcHeight = meta.height ?? 0

    for (const width of WIDTHS) {
      // 원본보다 크게 늘리지 않는다.
      if (width > srcWidth) continue
      await sharp(input)
        .resize({ width })
        .webp({ quality: 78 })
        .toFile(path.join(OUT_DIR, `${name}-${width}.webp`))
    }

    // 히어로는 Hero.astro가 /photos/hero-{width}.webp 를 직접 참조하므로 그 이름으로
    // 한 벌 더 만든다. 원본 이름의 산출물과 내용이 같아 ~430KB가 중복되지만, 그 대가로
    // Hero.astro가 매니페스트 순서나 파일명에 전혀 의존하지 않게 된다. 사진을 교체하는
    // 날 갤러리 정렬이 바뀌어도 히어로는 그대로다 — 그 견고함이 430KB보다 값싸다.
    if (file === hero) {
      for (const width of WIDTHS) {
        if (width > srcWidth) continue
        await sharp(input)
          .resize({ width })
          .webp({ quality: 78 })
          .toFile(path.join(OUT_DIR, `hero-${width}.webp`))
      }
    }

    // LQIP — 16px 폭 blur. 인라인 data URI라 추가 요청이 없다.
    const lqipBuffer = await sharp(input)
      .resize({ width: 16 })
      .blur(1)
      .webp({ quality: 40 })
      .toBuffer()

    manifest.push({
      base: `/photos/${name}`,
      width: srcWidth,
      height: srcHeight,
      lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
      alt: '',
    })

    const tag = file === hero ? ' (히어로 — 갤러리에도 포함)' : ''
    console.log(`  ${file} → ${name}-{${WIDTHS.join(',')}}.webp${tag}`)
  }

  if (og) {
    // fit:'cover' + position:'center' 로 1.91:1을 채운다. 위아래(세로 원본이면 좌우)가
    // 잘려나가므로, 실제로 잘린 결과를 눈으로 확인하고 나서 이 파일명을 정할 것.
    // 세로 사진(2:3)을 넣으면 얼굴 높이에서 잘린다.
    await sharp(path.join(src, og))
      .resize({ ...OG_SIZE, fit: 'cover', position: 'center' })
      .jpeg({ quality: 82 })
      .toFile(path.join(OUT_DIR, OG_FILE))
    console.log(`  ${og} → ${OG_FILE} (${OG_SIZE.width}x${OG_SIZE.height} 중앙 크롭)`)
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`\n${manifest.length}장 처리, ${MANIFEST} 갱신`)
  if (!og) {
    console.log('참고: --og 를 주지 않아 og.jpg 는 그대로 두었다.')
  }
  console.log(`다음: ${MANIFEST} 의 alt 값을 채울 것 (현재 전부 빈 문자열).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
