/**
 * RSVP 흐름이 의존하는 공개 환경변수의 게이트.
 *
 * deploy.yml의 `vars.*`에서 온다. 저장소 변수 이름을 잘못 쓰거나 아직 안 만들었으면
 * Vite는 그것을 빈 문자열로 치환한다 — 빌드도 배포도 npm test도 전부 초록인 채로:
 *
 *   PUBLIC_RSVP_ENDPOINT === '' → fetch('/rsvp')가 Pages 오리진 기준 상대경로가 되어
 *                                 https://<user>.github.io/rsvp 로 간다 → 404 →
 *                                 모든 하객이 "전달에 실패했어요"만 본다.
 *
 * 하객만 겪고 신랑·신부는 끝까지 모른다. WEDDING_PRIVATE과 같은 원칙을 적용한다 —
 * 잘못된 배포보다 실패한 빌드가 낫다.
 *
 * `.trim()`은 ShareButtons의 카카오 키와 같은 이유다: 콘솔에서 값을 복사해 CI 변수에
 * 붙이면 개행이 딸려오기 쉽고, 공백만 든 값은 truthy라 모든 존재 검사를 통과한다.
 */
function required(name: string, raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  // 프로덕션 빌드에서만 던진다. 로컬 `astro dev`는 이 값들 없이도 다른 섹션을
  // 작업할 수 있어야 한다 — 여기서 던지면 개발이 통째로 막힌다.
  if (value === '' && import.meta.env.PROD) {
    throw new Error(
      `${name} 가 비어 있습니다. GitHub 저장소 Variables를 확인하세요. ` +
        '프로덕션 빌드를 중단합니다.',
    )
  }
  return value
}

export const RSVP_ENDPOINT = required(
  'PUBLIC_RSVP_ENDPOINT',
  import.meta.env.PUBLIC_RSVP_ENDPOINT,
)
