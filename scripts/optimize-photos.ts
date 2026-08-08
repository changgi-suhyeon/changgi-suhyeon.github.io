import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SRC = process.argv[2]
const OUT_DIR = 'public/photos'
const MANIFEST = 'src/data/gallery.json'
const WIDTHS = [640, 1080, 1620]

if (!SRC) {
  console.error('사용법: npm run photos -- <원본_JPG_디렉터리>')
  console.error('  히어로와 갤러리 사진을 한 디렉터리에 모아 한 번만 돌리면 된다.')
  console.error('  hero.jpg 는 webp로 변환되지만 갤러리 매니페스트에서는 제외된다.')
  process.exit(1)
}

interface GalleryPhoto {
  base: string
  width: number
  height: number
  lqip: string
  alt: string
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const files = (await readdir(SRC))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()

  const manifest: GalleryPhoto[] = []

  for (const file of files) {
    const name = path.parse(file).name
    const input = path.join(SRC, file)
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

    // hero는 갤러리 항목이 아니다. 히어로 섹션이 /photos/hero-*.webp 를 직접 참조하므로
    // webp 산출물은 위에서 이미 만들었고, 매니페스트에서만 뺀다.
    //
    // 이 세 줄이 없으면 원본을 한 디렉터리에 모아 돌렸을 때 히어로가 라이트박스에
    // 섞여 들어간다. 디렉터리를 나눠 두 번 돌려 피할 수도 있지만, 매니페스트는 매 실행마다
    // 통째로 덮어써지므로 순서가 반대면 갤러리 사진이 조용히 사라진다.
    // 실제 스튜디오 사진을 넣는 날 그걸 기억하고 있을 사람에게 기대지 말 것.
    if (/^hero$/i.test(name)) {
      console.log(`  ${file} → ${name}-{${WIDTHS.join(',')}}.webp (히어로 — 갤러리 제외)`)
      continue
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

    console.log(`  ${file} → ${name}-{${WIDTHS.join(',')}}.webp`)
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`\n${manifest.length}장 처리, ${MANIFEST} 갱신`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
