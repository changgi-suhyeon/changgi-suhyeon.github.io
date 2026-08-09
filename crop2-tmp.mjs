import sharp from 'sharp'
const SP = process.argv[2]
const src = `${SP}/l65-1.png`
const { width, height } = await sharp(src).metadata()
// 약도 영역만: 로고 아래 ~ 지하철 아이콘 위
const left = Math.round(width * 0.075)
const top = Math.round(height * 0.093)
const w = Math.round(width * 0.85)
const h = Math.round(height * 0.40)
await sharp(src).extract({ left, top, width: w, height: h }).png().toFile(`${SP}/map-crop.png`)
console.log(`원본 ${width}x${height} → 크롭 ${w}x${h} (left=${left}, top=${top})`)
