import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { api } from './endpoints';
import type { BBox, ChargerFilterParams } from './types';

/**
 * 각 훅의 queryKey에는 해당 엔드포인트가 실제로 받는 요청변수만 들어갑니다.
 * 그래서 충전기 필터를 바꾸면 충전기 차트만 다시 요청되고,
 * 등록·연도 통계처럼 필터와 무관한 차트는 캐시를 그대로 사용합니다.
 */
const norm = (f: ChargerFilterParams) => ({
  region_code: f.region_code ?? null,
  charger_type: f.charger_type ?? null,
  deletion: f.deletion ?? 'all',
  operator_id: f.operator_id ?? null,
});

export function useOverview(f: ChargerFilterParams, evRegion?: string) {
  return useQuery({
    queryKey: ['overview', norm(f), evRegion ?? null],
    queryFn: ({ signal }) => api.overview({ ...f, ev_region_code: evRegion }, signal),
    placeholderData: keepPreviousData,
  });
}

/** 필터 선택지(지역·유형·삭제 표시)는 필터 없는 overview 응답의 meta.filter_options에서 받습니다. */
export function useFilterOptions() {
  return useQuery({
    queryKey: ['filter-options'],
    queryFn: ({ signal }) => api.overview({}, signal),
    select: (res) => res.meta.filter_options,
    staleTime: Infinity,
  });
}

/** 필터 없는 overview 응답 전체 (기준 시점·전국 스냅샷 총수). useFilterOptions와 캐시를 공유합니다. */
export function useBaseOverview() {
  return useQuery({
    queryKey: ['filter-options'],
    queryFn: ({ signal }) => api.overview({}, signal),
    staleTime: Infinity,
  });
}

export function useEvRegistration(regionCode?: string) {
  return useQuery({
    queryKey: ['ev-registration', regionCode ?? null],
    queryFn: ({ signal }) => api.evRegistration(regionCode, signal),
    placeholderData: keepPreviousData,
  });
}

export function useChargerRegions(f: ChargerFilterParams) {
  return useQuery({
    queryKey: ['charger-regions', norm(f)],
    queryFn: ({ signal }) => api.chargerRegions(f, signal),
    placeholderData: keepPreviousData,
  });
}

export function useChargerTypes(f: ChargerFilterParams) {
  return useQuery({
    queryKey: ['charger-types', norm(f)],
    queryFn: ({ signal }) => api.chargerTypes(f, signal),
    placeholderData: keepPreviousData,
  });
}

export function useChargerOutput(f: ChargerFilterParams) {
  return useQuery({
    queryKey: ['charger-output', norm(f)],
    queryFn: ({ signal }) => api.chargerOutput(f, signal),
    placeholderData: keepPreviousData,
  });
}

export function useOperators(f: ChargerFilterParams, page: number, limit: number) {
  return useQuery({
    queryKey: ['operators', norm(f), page, limit],
    queryFn: ({ signal }) => api.operators({ ...f, page, limit }, signal),
    placeholderData: keepPreviousData,
  });
}

const allOperatorsKey = ['operators-all'] as const;

async function fetchAllOperators({ signal }: { signal: AbortSignal }) {
  const rows = [];
  let page: number | null = 1;
  while (page !== null) {
    const res = await api.operators({ page, limit: 200 }, signal);
    rows.push(...res.data);
    page = res.meta.pagination?.next_page ?? null;
  }
  return rows;
}

/**
 * 운영기관 선택지: 필터 없이 전체 (기관 ID, 명칭) 조합을 limit=200으로 모두 받습니다.
 * 현재 342개 조합 → 2회 요청. next_page가 null이 될 때까지 이어서 받습니다.
 */
export function useAllOperators() {
  return useQuery({
    queryKey: allOperatorsKey,
    staleTime: Infinity,
    queryFn: fetchAllOperators,
  });
}

const toOperatorIds = (rows: Awaited<ReturnType<typeof fetchAllOperators>>) => new Set(rows.map((r) => r.operator_id));

/**
 * URL의 운영기관 ID 검증용: useAllOperators와 같은 캐시를 씁니다.
 * enabled가 false이면 요청하지 않고, 이미 받은 목록이 있으면 그대로 돌려줍니다.
 */
export function useOperatorIds(enabled: boolean) {
  return useQuery({
    queryKey: allOperatorsKey,
    staleTime: Infinity,
    queryFn: fetchAllOperators,
    enabled,
    select: toOperatorIds,
  }).data;
}

export function useGrowth(yearFrom?: number, yearTo?: number) {
  return useQuery({
    queryKey: ['growth', yearFrom ?? null, yearTo ?? null],
    queryFn: ({ signal }) => api.growth({ year_from: yearFrom, year_to: yearTo }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useLocationsPage(f: ChargerFilterParams, page: number, limit: number, bbox: BBox | null) {
  return useQuery({
    queryKey: ['locations-page', norm(f), page, limit, bbox],
    queryFn: ({ signal }) => api.locations({ ...f, page, limit, bbox }, signal),
  });
}

/** 지도용: bbox 안의 충전소를 limit=1000 단위로 next_page를 따라 이어 받습니다. */
export function useMapLocations(f: ChargerFilterParams, bbox: BBox | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['locations-map', norm(f), bbox],
    enabled: enabled && bbox !== null,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api.locations({ ...f, page: pageParam, limit: 1000, bbox }, signal),
    getNextPageParam: (last) => last.meta.pagination.next_page ?? undefined,
  });
}

export function useStaticCharts() {
  return useQuery({
    queryKey: ['charts'],
    queryFn: ({ signal }) => api.charts(undefined, signal),
    staleTime: Infinity,
  });
}

/**
 * 지역 × 출력 히트맵: /api/charger-output을 16개 지역 코드별로 각각 요청합니다.
 * region_code를 제외한 충전기 필터(유형·삭제 표시·운영기관)는 그대로 적용합니다.
 * 각 요청은 단일 지역 캐시 키를 써서, 다른 화면의 지역 필터 요청과 캐시를 공유합니다.
 */
export function useRegionOutputMatrix(f: ChargerFilterParams, regionCodes: string[]) {
  const base = { ...f, region_code: undefined };
  return useQueries({
    queries: regionCodes.map((code) => ({
      queryKey: ['charger-output', norm({ ...base, region_code: code })],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.chargerOutput({ ...base, region_code: code }, signal),
      // Never mix previous-filter regions with completed current-filter regions.
    })),
    combine: (results) => ({
      data: results.length > 0 && results.every((r) => r.data && !r.isPlaceholderData)
        ? results.map((r, i) => ({ code: regionCodes[i], res: r.data as Awaited<ReturnType<typeof api.chargerOutput>> }))
        : undefined,
      isLoading: results.some((r) => r.isLoading || r.isPlaceholderData),
      isFetching: results.some((r) => r.isFetching),
      error: results.find((r) => r.error)?.error ?? null,
      refetch: () => results.forEach((r) => r.error && r.refetch()),
    }),
  });
}

/** 박스플롯: 충전소당 충전기 수 분포. 전달한 충전기 필터를 그대로 요청변수로 사용합니다. */
export function useStationSize(f: ChargerFilterParams) {
  return useQuery({
    queryKey: ['station-size', norm(f)],
    queryFn: ({ signal }) => api.stationSize(f, signal),
    placeholderData: keepPreviousData,
  });
}
