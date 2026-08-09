import galleryJson from './gallery.json'

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
    name: '홍창기',
    order: '장남',
    father: { name: '홍성수', deceased: false },
    mother: { name: '박종희', deceased: false },
  },
  bride: {
    name: '정수현',
    order: '장녀',
    father: { name: '정성택', deceased: false },
    mother: { name: '김경란', deceased: false },
  },

  venue: {
    name: 'L65호텔웨딩컨벤션',
    hall: '타워동 6층 가든홀',
    address: '서울 동대문구 왕산로 200 청량리역 롯데캐슬스카이-L65',
    tel: '02-2184-4500', // 식장 대표번호 — 개인정보가 아니므로 여기 둔다
    lat: VENUE_LAT,
    lng: VENUE_LNG,
    map: {
      // 검색이 아니라 장소 ID 직링크다. 검색은 동명의 다른 장소가 먼저 뜰 수 있지만
      // 이건 곧장 식장으로 간다. 대신 각 지도 서비스에서 따로 얻어야 하므로,
      // 식장이 바뀌면 아래 좌표와 함께 이 두 줄도 손으로 고쳐야 한다.
      //
      // 확인된 목적지(2026-08-09):
      //   kakao → 'L65호텔웨딩컨벤션 | 카카오맵'
      //   naver → map.naver.com/p/entry/place/13171608
      // naver.me는 단축 URL이라 열어보기 전엔 어디로 가는지 알 수 없다. 위 목적지를
      // 적어두는 이유이며, 링크를 갈아끼울 때는 실제로 열어 확인할 것.
      kakao: 'https://place.map.kakao.com/1274388923',
      naver: 'https://naver.me/xyTG1krB',
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
