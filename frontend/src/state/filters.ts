import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChargerFilterParams, DeletionFilter } from '../api/types';

/**
 * 필터 상태는 URL 쿼리에 저장합니다 (?region=11&type=04&deletion=not_deleted&operator=PI&ev_region=29).
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

const DELETION_VALUES: DeletionFilter[] = ['all', 'not_deleted', 'deleted'];

export interface FilterState {
  region?: string;
  type?: string;
  deletion: DeletionFilter;
  operator?: string;
  evRegion?: string;
}

export function useFilters() {
  const [params, setParams] = useSearchParams();

  const state: FilterState = useMemo(() => {
    const deletion = params.get(KEYS.deletion) as DeletionFilter | null;
    return {
      region: params.get(KEYS.region) || undefined,
      type: params.get(KEYS.type) || undefined,
      deletion: deletion && DELETION_VALUES.includes(deletion) ? deletion : 'all',
      operator: params.get(KEYS.operator) || undefined,
      evRegion: params.get(KEYS.evRegion) || undefined,
    };
  }, [params]);

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

  return { state, update, resetCharger, chargerParams, activeChargerCount };
}
