/**
 * `subset-font`는 타입 선언을 제공하지 않는 CommonJS 패키지다(@types 패키지도 없다).
 * 여기서 실제로 쓰는 만큼만 타입을 선언한다 — `any`를 쓰지 않기 위함이다.
 * https://github.com/papandreou/subset-font
 */
declare module 'subset-font' {
  export interface SubsetFontOptions {
    targetFormat: 'sfnt' | 'truetype' | 'woff' | 'woff2'
    preserveNameIds?: number[]
    noLayoutClosure?: boolean
  }

  export default function subsetFont(
    buffer: Buffer,
    text: string,
    options: SubsetFontOptions,
  ): Promise<Buffer>
}
