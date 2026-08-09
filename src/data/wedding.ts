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
    // 도로명과 건물명을 나눠 둔다. 한 문자열로 두면 폰 폭에서 '롯데캐슬스카이-'
    // 뒤 하이픈에서 끊겨 'L65'만 다음 줄에 홀로 남는다. 그 지점이 유일한 분리
    // 기회라 text-balance도 word-break:keep-all도 손대지 못한다(둘 다 실측 확인).
    // 화면의 줄 나눔을 브라우저 추측에 맡기지 않고 데이터에서 정한다.
    address: '서울 동대문구 왕산로 200',
    addressDetail: '청량리역 롯데캐슬스카이-L65',
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
      //
      // 식장이 배포한 공식 약도(L65호텔웨딩컨벤션_약도.pdf 1쪽)를 잘라 쓴다. 출구 번호와
      // 주차장 진입 방향이 표시돼 있어 일반 지도 스크린샷보다 하객에게 유용하다.
      // 비율이 1.424라 Location.astro의 컨테이너 비율을 여기에 맞춰 두었다 — 한쪽만
      // 바꾸면 약도의 좌우(청과물도매시장·회기역 라벨)가 잘려 나간다.
      staticImage: '/photos/map.webp',
    },
    // 아래 네 값은 식장이 배포한 공식 약도(L65호텔웨딩컨벤션_약도.pdf)를 옮긴 것이다.
    // 공식 홈페이지(www.L65hotelwedding.co.kr)에는 지하철 1호선만 안내돼 있어 약도가
    // 더 자세하다. 식장이 안내를 갱신하면 여기도 함께 고칠 것.
    transit: {
      subway:
        '1호선 청량리역 5번 출구 — 바로 앞\n' +
        '경의중앙선 · 경춘선 · 수인분당선 청량리역 1번 출구 — 바로 앞',
      bus:
        '청량리역환승센터 하차 — 바로 앞\n\n' +
        '간선 105, 120, 121, 147, 202, 241, 260, 261, 270, 271, 272, 420, 720\n' +
        '지선 1213, 1222, 1224, 1227, 2115, 2230, 3216, 3220\n' +
        '일반 51, 65, 166, 170, 707\n' +
        '직행 1330-2, 1330-3, 1330-4, 1330-44, 3200, 8005\n' +
        '좌석 330-1 · 공항 6002',
      // 이 한 항목만 약도에 없는 내용이다. 청량리역은 KTX-이음(강릉선·중앙선)과
      // ITX·무궁화호가 서는 역이라, 지방에서 오시는 하객을 위해 덧붙였다.
      train:
        '청량리역은 KTX · ITX 정차역입니다.\n' +
        '하차 후 1호선 5번 출구 또는 경의중앙선 1번 출구로 나오시면 바로 앞입니다.',
      car:
        '내비게이션에 "L65호텔웨딩컨벤션" 또는 "청량리역 5번출구"로 검색해 주세요.\n' +
        '주소 검색 — 서울 동대문구 왕산로 200 (지번 전농동 620-69)',
      parking:
        '지하 3층 · 4층만 주차할 수 있습니다.\n' +
        '주차장이 혼잡하니 가능하면 대중교통을 이용해 주세요.',
    },
  },

  meal: { type: '', hours: '', reception: null as null | { place: string; at: string } },
  shuttle: { departAt: '', boardingPoint: '' }, // 담당자 연락처는 privateData.phones.shuttle

  // 이 문자열의 줄바꿈이 곧 화면 레이아웃이다 — Invitation.astro가 whitespace-pre-line으로
  // 그대로 그린다. 그래서 한 줄이 한 행이 되도록 문자열을 줄 단위로 이어 붙였다.
  //
  // 줄 길이 상한은 22자다(iPhone 13 기준 문단 폭 342px, 명조 16px, 한 글자 14.9px).
  // 넘으면 자동 줄바꿈이 끼어들어 의도한 행 나눔이 무너진다. 작은 폰까지 감안해
  // 17자 이하로 맞췄으니, 문구를 고칠 때도 그 선을 지킬 것.
  greeting:
    '우연처럼 찾아온 인연이\n' +
    '어느새 서로의 하루가 되었습니다.\n' +
    '\n' +
    '같이 웃고 함께 꿈꾸며\n' +
    '깊어진 마음 끝에\n' +
    '가을이 가장 깊어지는 날\n' +
    '같은 길을 걷기로 했습니다.\n' +
    '\n' +
    '이 좋은 날 걸음 하시어\n' +
    '저희의 첫걸음을 축복해 주시면\n' +
    '오래도록 따뜻하게 간직하겠습니다.',
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
