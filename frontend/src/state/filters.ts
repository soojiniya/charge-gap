import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOperatorIds } from '../api/hooks';
import type { ChargerFilterParams, DeletionFilter } from '../api/types';

/**
 * 필터 상태는 URL 쿼리에 저장합니다 (?region=11&type=04&deletion=not_deleted&operator=PI&ev_region=12).
 * 페이지를 옮겨도 충전기 필터가 유지되고, 링크로 같은 화면을 공유할 수 있습니다.
 * API 요청변수 이름으로의 변환은 toChargerParams에서만 합니다.
 */
const KEYS = {
  region: 'region',
  type: 'type',
  deletion: 'deletion',
  operator: 'operator',
  evRegion: 'ev_region',
} as const;

export type FilterKey = keyof typeof KEYS;

/**
 * API가 받는 값 목록 (backend/chargegap_api/data.py의 REGIONS_2026·TYPE_DEFINITIONS와 같아야 하며,
 * tests/url-filters.test.cjs가 두 정의의 일치를 확인합니다).
 * 충전기 지역과 2026-09 등록 지역은 같은 16개 코드입니다(전남광주 = 12).
 */
export const REGION_CODES: readonly string[] = ['11', '12', '26', '27', '28', '30', '31', '36', '41', '43', '44', '47', '48', '50', '51', '52'];
export const CHARGER_TYPE_CODES: readonly string[] = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
/** 운영기관 ID 형식 (현재 스냅샷은 영문·숫자 2자). 실제 존재 여부는 운영기관 목록을 받은 뒤 확인합니다. */
const OPERATOR_ID_PATTERN = /^[A-Za-z0-9]{1,16}$/;

/**
 * 사이드바 등 페이지 이동 링크에 붙일 공통 필터 쿼리만 남깁니다.
 * 페이지 전용 요청변수(예: 연도 구간)는 다른 페이지로 넘기지 않습니다.
 */
export function filterSearch(search: string): string {
  const current = new URLSearchParams(search);
  const next = new URLSearchParams();
  Object.values(KEYS).forEach((key) => {
    const value = current.get(key);
    if (value) next.set(key, value);
  });
  const query = next.toString();
  return query ? `?${query}` : '';
}

const DELETION_VALUES: DeletionFilter[] = ['all', 'not_deleted', 'deleted'];

export interface FilterState {
  region?: string;
  type?: string;
  deletion: DeletionFilter;
  operator?: string;
  evRegion?: string;
}

/**
 * URL 쿼리를 허용된 필터 값으로만 해석합니다. 잘못된 값은 무시(전국·전체)하고 invalid에 담아
 * URL에서 지울 수 있게 합니다. knownOperators가 없으면(목록을 아직 받지 않음) 운영기관은 형식만 확인합니다.
 */
export function parseFilters(params: URLSearchParams, knownOperators?: ReadonlySet<string>) {
  const invalid: FilterKey[] = [];
  const pick = (key: FilterKey, ok: (value: string) => boolean) => {
    const raw = params.get(KEYS[key]);
    if (raw === null) return undefined;
    if (raw !== '' && ok(raw)) return raw;
    invalid.push(key);
    return undefined;
  };
  const deletion = pick('deletion', (v) => (DELETION_VALUES as string[]).includes(v)) as DeletionFilter | undefined;
  const state: FilterState = {
    region: pick('region', (v) => REGION_CODES.includes(v)),
    type: pick('type', (v) => CHARGER_TYPE_CODES.includes(v)),
    deletion: deletion ?? 'all',
    operator: pick('operator', (v) => OPERATOR_ID_PATTERN.test(v) && (!knownOperators || knownOperators.has(v))),
    evRegion: pick('evRegion', (v) => REGION_CODES.includes(v)),
  };
  return { state, invalid };
}

export function useFilters() {
  const [params, setParams] = useSearchParams();
  // 운영기관 ID가 URL에 있을 때만 목록을 확인합니다(운영기관 선택 상자와 같은 캐시).
  const knownOperators = useOperatorIds(!!params.get(KEYS.operator));

  const { state, invalid } = useMemo(() => parseFilters(params, knownOperators), [params, knownOperators]);

  const update = useCallback(
    (patch: Partial<FilterState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          (Object.keys(patch) as (keyof FilterState)[]).forEach((key) => {
            const value = patch[key];
            const urlKey = KEYS[key];
            if (!value || (key === 'deletion' && value === 'all')) next.delete(urlKey);
            else next.set(urlKey, value);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const resetCharger = useCallback(
    () => update({ region: undefined, type: undefined, deletion: 'all', operator: undefined }),
    [update],
  );

  const chargerParams: ChargerFilterParams = useMemo(
    () => ({
      region_code: state.region,
      charger_type: state.type,
      deletion: state.deletion,
      operator_id: state.operator,
    }),
    [state.region, state.type, state.deletion, state.operator],
  );

  const activeChargerCount =
    (state.region ? 1 : 0) + (state.type ? 1 : 0) + (state.deletion !== 'all' ? 1 : 0) + (state.operator ? 1 : 0);

  return { state, invalid, update, resetCharger, chargerParams, activeChargerCount };
}
