import galleryJson from './gallery.json'

// 지도앱 검색에 쓰는 질의. venue.address 전체(건물명 포함)를 넣으면 검색이 어긋날 수 있어
// 도로명 주소만 쓴다. 두 값은 의도적으로 다르며, 식장이 바뀌면 둘 다 함께 고쳐야 한다.
// 딥링크는 이 상수에서만 파생되므로 여기 한 곳만 고치면 세 링크가 함께 따라온다.
const VENUE_SEARCH_QUERY = '서울 동대문구 왕산로 200'

// 식장 좌표(WGS84). OpenStreetMap이 '롯데캐슬 SKY-L65 랜드마크타워'로 표기하는 지점이며,
// 예식장이 있는 타워동이다(단지 내 주거동은 남서쪽 37.5789, 127.0450 쪽이라 다르다).
// 인터랙티브 지도의 중심·마커와 티맵 딥링크가 모두 이 한 쌍에서 나온다.
//
// 더 정확한 값이 필요하면 카카오맵에서 해당 지점을 우클릭 → '여기가 어디죠?'로 얻어
// 여기만 고치면 된다. 지도와 딥링크가 함께 따라온다.
const VENUE_LAT = 37.5797891
const VENUE_LNG = 127.0463135

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
    lat: VENUE_LAT,
    lng: VENUE_LNG,
    map: {
      // 좌표 없이도 되는 주소 검색 딥링크. 실제 식장 위치로 검색 결과가 뜬다.
      kakao: `https://map.kakao.com/link/search/${encodeURIComponent(VENUE_SEARCH_QUERY)}`,
      naver: `https://map.naver.com/p/search/${encodeURIComponent(VENUE_SEARCH_QUERY)}`,
      // 티맵은 검색이 아니라 좌표로 목적지를 잡는다. goalx가 경도, goaly가 위도다 —
      // 순서가 x=경도라 위경도 표기와 반대다. 바꿔 넣으면 서해 한복판을 안내한다.
      tmap:
        `tmap://route?goalname=${encodeURIComponent('L65호텔웨딩컨벤션')}` +
        `&goalx=${VENUE_LNG}&goaly=${VENUE_LAT}`,
      // 인터랙티브 지도(KakaoMap 아일랜드)가 못 뜰 때의 폴백. 카카오 JS 키 미설정,
      // 도메인 미등록, 인앱 웹뷰의 스크립트 차단 — 어느 경우든 이 이미지가 남는다.
      staticImage: '/photos/map.webp', // PLACEHOLDER — 실제 지도 스크린샷으로 교체 필요
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
