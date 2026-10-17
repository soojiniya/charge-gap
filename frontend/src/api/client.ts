import type { ApiEnvelope, ApiErrorBody, BaseMeta } from './types';

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

/** HTTP 상태와 error를 먼저 확인한 뒤 data/meta를 분리해 반환합니다. */
export async function apiGet<D, M extends BaseMeta = BaseMeta>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<D, M>> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(
      `API 서버(${API_BASE_URL})에 연결할 수 없습니다. backend 폴더에서 run.py로 Flask 서버를 실행했는지 확인하세요.`,
      null,
      'NETWORK_ERROR',
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
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
