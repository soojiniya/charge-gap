import type { ApiEnvelope, ApiErrorBody, BaseMeta } from './types';
import { createReadiness, WakeTimeoutError } from './readiness';

/** Flask 서버 주소. .env의 VITE_API_BASE_URL로 바꿀 수 있습니다. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://127.0.0.1:5000';

/** API 오류(HTTP 상태 + 서버 error 객체) 또는 네트워크 오류 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly parameter: string | null;

  constructor(message: string, status: number | null, code: string, parameter: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.parameter = parameter;
  }

  get isNetwork() {
    return this.status === null;
  }
}

export type QueryParams = Record<string, string | number | undefined | null>;

/**
 * API 요청변수 규칙: 빈 값·반복 변수는 400이므로 undefined/null/'' 값은 아예 보내지 않습니다.
 * 키를 정렬해 캐시 키와 URL이 결정적으로 같게 만듭니다.
 */
export function buildUrl(path: string, params: QueryParams = {}): string {
  const search = new URLSearchParams();
  Object.keys(params)
    .sort()
    .forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });
  const query = search.toString();
  return `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
}

export function assetUrl(relative: string): string {
  return `${API_BASE_URL}${relative.startsWith('/') ? '' : '/'}${relative}`;
}

/**
 * 연결 실패 안내. 공개(production) 빌드에서는 방문자가 할 수 있는 일만 안내하고,
 * 로컬 개발 서버에서는 기존처럼 Flask 실행 방법을 알려 줍니다.
 */
function connectionErrorMessage(): string {
  return import.meta.env.DEV
    ? `API 서버(${API_BASE_URL})에 연결할 수 없습니다. backend 폴더에서 run.py로 Flask 서버를 실행했는지 확인하세요.`
    : '데이터 서버에 연결하지 못했습니다. 서버가 절전 상태에서 다시 시작되는 중이면 1~2분 정도 걸릴 수 있습니다. 잠시 후 \'다시 요청\'을 눌러 주세요.';
}

function unavailableMessage(): string {
  return import.meta.env.DEV
    ? `API 서버(${API_BASE_URL})가 JSON이 아닌 응답을 보냈습니다. 주소(VITE_API_BASE_URL)와 Flask 서버 상태를 확인하세요.`
    : '데이터 서버가 아직 준비 중입니다. 서버가 절전 상태에서 다시 시작되는 중이면 1~2분 정도 걸릴 수 있습니다. 잠시 후 \'다시 요청\'을 눌러 주세요.';
}

function wakeTimeoutMessage(): string {
  return import.meta.env.DEV
    ? `API 서버(${API_BASE_URL})가 3분 동안 응답하지 않았습니다. backend 폴더에서 run.py로 Flask 서버를 실행했는지 확인하세요.`
    : '데이터 서버가 3분 동안 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.';
}

/** 서버 절전 복귀 대기 시간이 지나 끝난 요청 (화면 위 통합 안내에서 다시 시도) */
export const WAKE_TIMEOUT_CODE = 'SERVER_WAKE_TIMEOUT';

/** 연결 실패·서버 준비 중처럼 잠시 후 다시 시도하면 해결될 수 있는 오류 */
export function isTransientApiError(error: unknown): boolean {
  return error instanceof ApiError && error.code !== WAKE_TIMEOUT_CODE
    && (error.isNetwork || error.code === 'SERVER_UNAVAILABLE' || (error.status ?? 0) >= 500);
}

/**
 * 서버가 깨어나는 중일 수 있는 실패: 연결 자체가 안 됨, 또는 앱이 아닌 곳의 JSON이 아닌 응답.
 * 앱이 보낸 JSON 오류(400·404·500 등)는 서버가 깨어 있다는 뜻이므로 포함하지 않습니다.
 */
export function isWakeError(error: unknown): boolean {
  return error instanceof ApiError && error.code !== WAKE_TIMEOUT_CODE && (error.isNetwork || error.code === 'SERVER_UNAVAILABLE');
}

/** 상태 확인: 가장 가벼운 고정 응답. 앱이 JSON으로 답하면(오류여도) 서버는 준비된 것입니다. */
async function probeServer(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(buildUrl('/api/charts', { chart_id: 1 }), { signal, headers: { Accept: 'application/json' } });
    const body: unknown = await response.json();
    return !!body && typeof body === 'object' && ('data' in body || 'error' in body);
  } catch {
    return false;
  }
}

/** 앱 전체가 공유하는 서버 준비 대기열 */
export const serverReadiness = createReadiness(probeServer);

async function waitForServer(signal?: AbortSignal) {
  try {
    await serverReadiness.waitUntilReady(signal);
  } catch (error) {
    if (error instanceof WakeTimeoutError) throw new ApiError(wakeTimeoutMessage(), null, WAKE_TIMEOUT_CODE);
    throw error;
  }
}

/**
 * API 요청. 서버가 깨어나는 중이면 요청마다 오류를 내지 않고 서버 준비 대기열에서 기다린 뒤
 * 한 번 다시 요청합니다(대기 중에 새로 생긴 요청은 바로 대기열로 들어가 불필요한 요청을 보내지 않음).
 */
export async function apiGet<D, M extends BaseMeta = BaseMeta>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<D, M>> {
  if (serverReadiness.getSnapshot().phase === 'waking') await waitForServer(signal);
  try {
    return await fetchApi<D, M>(path, params, signal);
  } catch (error) {
    if (!isWakeError(error)) throw error;
    await waitForServer(signal);
    return fetchApi<D, M>(path, params, signal);
  }
}

/** 요청 1회: HTTP 상태와 error를 먼저 확인한 뒤 data/meta를 분리해 반환합니다. */
export async function fetchApi<D, M extends BaseMeta = BaseMeta>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<D, M>> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(connectionErrorMessage(), null, 'NETWORK_ERROR');
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  // JSON이 아닌 응답(예: 호스팅 서버가 깨어나는 동안의 HTML 안내 페이지, 프록시 오류 페이지)은
  // API 요청 오류가 아니라 일시적인 연결 문제로 다룹니다.
  if (body === null) {
    throw new ApiError(unavailableMessage(), response.status, 'SERVER_UNAVAILABLE');
  }

  if (!response.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      err?.message ?? `요청을 처리하지 못했습니다. (HTTP ${response.status})`,
      response.status,
      err?.code ?? 'HTTP_ERROR',
      err?.parameter ?? null,
    );
  }
  if (!body || typeof body !== 'object' || !('data' in body) || !('meta' in body)) {
    throw new ApiError('API 응답 형식이 명세와 다릅니다.', response.status, 'INVALID_RESPONSE');
  }
  return body as ApiEnvelope<D, M>;
}
