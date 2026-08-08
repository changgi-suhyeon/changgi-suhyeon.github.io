import galleryJson from './gallery.json'

export const wedding = {
  date: '2026-10-31T12:00:00+09:00',

  groom: {
    name: '',
    order: '장남',
    father: { name: '', deceased: false },
    mother: { name: '', deceased: false },
  },
  bride: {
    name: '',
    order: '장녀',
    father: { name: '', deceased: false },
    mother: { name: '', deceased: false },
  },

  venue: {
    name: 'L65호텔웨딩컨벤션',
    hall: '타워동 6층 가든홀',
    address: '서울 동대문구 왕산로 200 청량리역 롯데캐슬스카이-L65',
    tel: '', // 식장 대표번호 — 개인정보가 아니므로 여기 둔다
    map: {
      kakao: '',
      naver: '',
      tmap: '',
      staticImage: '/photos/map.webp',
    },
    transit: {
      subway: '',
      bus: '',
      train: '', // 청량리역은 KTX·ITX 정차역이라 별도 항목으로 둔다
      car: '',
      parking: '',
    },
  },

  meal: { type: '', hours: '', reception: null as null | { place: string; at: string } },
  shuttle: { departAt: '', boardingPoint: '' }, // 담당자 연락처는 privateData.phones.shuttle

  greeting: '',
  gallery: galleryJson as GalleryPhoto[],
  bgm: { src: '', title: '', credit: '' },
}
// as const 를 쓰지 않는다. 갤러리 배열이 readonly가 되면 Task 7의 매니페스트 주입과
// Lightbox의 배열 사용에서 타입이 어긋난다.

export interface GalleryPhoto {
  base: string   // 확장자·너비 제외한 경로. 예: '/photos/01'
  width: number
  height: number
  lqip: string   // base64 data URI
  alt: string
}
