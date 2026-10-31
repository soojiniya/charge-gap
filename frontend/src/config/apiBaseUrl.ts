/**
 * Production 빌드용 API 주소 검사 (vite.config.ts에서만 사용, 앱 번들에는 포함되지 않음).
 *
 * VITE_API_BASE_URL은 빌드 시 JS에 고정됩니다. 값이 비면 client.ts가 http://127.0.0.1:5000으로
 * 대체하므로, 공개 배포 빌드에서 값이 빠지거나 localhost를 가리키면 모든 방문자의 API 요청이 실패합니다.
 * 허용: 같은 origin의 상대 경로(예: Docker Compose의 /backend) 또는 localhost가 아닌 http(s) 주소.
 */
const LOCAL_HOSTNAMES = new Set(['localhost', '0.0.0.0', '::1', '[::1]', '::', '[::]']);

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.localhost') || /^127(\.\d{1,3}){3}$/.test(host);
}

/** 문제가 없으면 null, 있으면 빌드 실패 사유를 돌려줍니다. 입력값은 메시지에 넣지 않습니다. */
export function apiBaseUrlProblem(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) {
    return 'VITE_API_BASE_URL이 비어 있습니다. 비어 있으면 http://127.0.0.1:5000으로 대체되어 배포 사이트가 API에 연결하지 못합니다.';
  }
  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? 'VITE_API_BASE_URL에 프로토콜 생략 주소(//host)는 사용할 수 없습니다.' : null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'VITE_API_BASE_URL은 /로 시작하는 상대 경로이거나 http(s):// 주소여야 합니다.';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'VITE_API_BASE_URL은 http 또는 https 주소여야 합니다.';
  }
  if (isLocalHostname(url.hostname)) {
    return 'VITE_API_BASE_URL이 localhost(로컬 주소)를 가리킵니다. 배포 사이트 방문자의 브라우저에서는 연결되지 않습니다.';
  }
  return null;
}

/** 로컬 미리보기용 빌드만 명시적으로 허용하는 환경변수 (VITE_ 접두사가 아니므로 번들에 들어가지 않음). */
export const ALLOW_LOCAL_API_BUILD_ENV = 'CHARGE_GAP_ALLOW_LOCAL_API_BUILD';
