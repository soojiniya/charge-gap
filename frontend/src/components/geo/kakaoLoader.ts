/**
 * 카카오맵 JavaScript SDK 로더.
 * - 앱 키는 코드에 적지 않고 빌드 환경 변수 VITE_KAKAO_MAP_KEY(frontend/.env 또는 배포 환경 변수)에서 읽습니다.
 *   (카카오 JavaScript 키는 브라우저에 노출되는 공개 키이며, 카카오 개발자 콘솔에 등록한 도메인에서만 동작합니다.)
 * - autoload=false 로 불러온 뒤 kakao.maps.load()가 끝나면 사용합니다(document.write 사용 안 함).
 * - 키 없음 · 스크립트 로드 실패 · 시간 초과 · SDK 초기화 실패를 구분해 화면에 안내할 수 있게 합니다.
 */
import type { KakaoMaps } from './kakao';

export type KakaoLoadReason = 'missing-key' | 'network' | 'timeout' | 'init';

export class KakaoLoadError extends Error {
  reason: KakaoLoadReason;
  constructor(reason: KakaoLoadReason, message: string) {
    super(message);
    this.name = 'KakaoLoadError';
    this.reason = reason;
  }
}

export const KAKAO_SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js';
const LOAD_TIMEOUT_MS = 15000;

let pending: Promise<KakaoMaps> | null = null;

function appKey(): string {
  const raw = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;
  return (raw ?? '').trim();
}

/** 이미 불러온 SDK가 있으면 그대로, 없으면 한 번만 불러옵니다. 실패하면 다음 호출에서 다시 시도합니다. */
export function loadKakaoMaps(timeoutMs = LOAD_TIMEOUT_MS): Promise<KakaoMaps> {
  const ready = window.kakao?.maps;
  if (ready && typeof ready.Map === 'function') return Promise.resolve(ready);
  if (pending) return pending;
  const key = appKey();
  if (!key) {
    return Promise.reject(
      new KakaoLoadError('missing-key', '카카오맵 앱 키(VITE_KAKAO_MAP_KEY)가 설정되지 않았습니다. frontend/.env 또는 배포 환경 변수를 확인해 주세요.'),
    );
  }
  pending = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${KAKAO_SDK_URL}?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.dataset.kakaoSdk = 'true';
    let settled = false;
    const fail = (err: KakaoLoadError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.remove();
      pending = null;
      reject(err);
    };
    const timer = window.setTimeout(
      () => fail(new KakaoLoadError('timeout', '카카오맵 응답이 없습니다. 네트워크 상태 또는 앱 키·등록 도메인을 확인해 주세요.')),
      timeoutMs,
    );
    script.onerror = () => fail(new KakaoLoadError('network', '카카오맵 SDK를 내려받지 못했습니다. 네트워크 또는 보안 정책(CSP) 차단 여부를 확인해 주세요.'));
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps || typeof maps.load !== 'function') {
        fail(new KakaoLoadError('init', '카카오맵 SDK를 초기화하지 못했습니다. 앱 키와 등록 도메인을 확인해 주세요.'));
        return;
      }
      maps.load(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(maps);
      });
    };
    document.head.appendChild(script);
  });
  return pending;
}
