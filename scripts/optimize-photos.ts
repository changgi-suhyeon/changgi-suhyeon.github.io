import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SRC = process.argv[2]
const OUT_DIR = 'public/photos'
const MANIFEST = 'src/data/gallery.json'
const WIDTHS = [640, 1080, 1620]

if (!SRC) {
  console.error('사용법: npm run photos -- <원본_JPG_디렉터리>')
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
