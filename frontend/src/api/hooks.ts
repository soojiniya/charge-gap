import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
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

/** Single API request for the 16-region disparity analysis; region selection is intentionally excluded. */
export function useRegionalDisparity(f: ChargerFilterParams) {
  const base = { ...f, region_code: undefined };
  return useQuery({
    queryKey: ['regional-disparity', norm(base)],
    queryFn: ({ signal }) => api.regionalDisparity(base, signal),
  });
}

export function useChargerTypes(f: ChargerFilterParams) {
  return useQuery({
    queryKey: ['charger-types', norm(f)],
    queryFn: ({ signal }) => api.chargerTypes(f, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * 충전기 출력 구성(/api/charger-output). 키·옵션은 그대로입니다.
 * shareRegionRequest: Regional Explorer의 지역 비교·분석 패널처럼 히트맵과 같은 화면에서 지역 하나를 볼 때,
 * 같은 지역 외 필터의 통합 요청(/api/charger-output/regions, 히트맵과 같은 쿼리)을 함께 써서 그 지역 값을 꺼냅니다.
 * 화면을 처음 열 때(URL에 지역·비교 지역이 있을 때) 히트맵 요청이 끝나기 전이어도 지역별 요청을 따로 보내지 않습니다.
 * 꺼낸 값은 /api/charger-output?region_code=…와 같습니다. 지역이 없거나 옵션이 없으면 기존과 같이 단일 요청입니다.
 */
export function useChargerOutput(f: ChargerFilterParams, opts: { shareRegionRequest?: boolean } = {}) {
  const queryClient = useQueryClient();
  const viaRegions = !!opts.shareRegionRequest && !!f.region_code;
  return useQuery({
    queryKey: ['charger-output', norm(f)],
    queryFn: async ({ signal }) => {
      if (!viaRegions) return api.chargerOutput(f, signal);
      const base = { ...f, region_code: undefined };
      const list = await queryClient.fetchQuery({ queryKey: regionOutputsKey(base), queryFn: (ctx) => loadRegionOutputs(queryClient, base, ctx.signal) });
      const hit = list.find((x) => x.code === f.region_code);
      return hit ? hit.res : api.chargerOutput(f, signal);
    },
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
 * 운영기관 선택지: 필터 없이 전체 운영기관 ID를 limit=200으로 모두 받습니다.
 * 현재 운영기관 ID 144개 → 1회 요청. next_page가 null이 될 때까지 이어서 받습니다.
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

/** 지도 줌 11~15용: 화면 영역(bbox) 전체 충전소의 격자 집계. 지도 줌이 바뀌면 칸 크기도 바뀌므로 줌을 키에 포함 */
export function useMapGrid(f: ChargerFilterParams, bbox: BBox | null, zoom: number, enabled: boolean) {
  return useQuery({
    queryKey: ['locations-grid', norm(f), bbox, zoom],
    enabled: enabled && bbox !== null,
    queryFn: ({ signal }) => api.locationGrid({ ...f, bbox: bbox as BBox, zoom }, signal),
  });
}

export function useStaticCharts() {
  return useQuery({
    queryKey: ['charts'],
    queryFn: ({ signal }) => api.charts(undefined, signal),
    staleTime: Infinity,
  });
}

type ChargerOutputResponse = Awaited<ReturnType<typeof api.chargerOutput>>;
/** 히트맵 한 행의 원본: 지역 코드와 그 지역의 /api/charger-output 응답 */
export interface RegionOutput {
  code: string;
  res: ChargerOutputResponse;
}

/**
 * /api/charger-output/regions 응답 → 지역별 /api/charger-output 응답 목록(서버의 16개 지역 순서).
 * 각 응답은 { data, meta: { ...common_meta, filters, matched, count, output_statistics } }로, 같은 필터의
 * 지역별 요청 응답과 data·meta가 같습니다(backend/tests/test_charger_output_regions.py).
 */
export function regionOutputResponses(res: Awaited<ReturnType<typeof api.chargerOutputRegions>>): RegionOutput[] {
  const common = res.data.common_meta;
  return res.data.regions.map((r) => ({
    code: r.region_code,
    res: { data: r.data, meta: { ...common, filters: r.filters, matched: r.matched, count: r.count, output_statistics: r.output_statistics } },
  }));
}

/** 요청한 지역 순서로 고릅니다. 한 지역이라도 없으면 undefined(일부 지역만으로 그리지 않음). 순서가 같으면 같은 배열을 그대로 돌려줍니다. */
export function pickRegions(list: RegionOutput[] | undefined, codes: readonly string[]): RegionOutput[] | undefined {
  if (!list || !codes.length) return undefined;
  if (list.length === codes.length && list.every((x, i) => x.code === codes[i])) return list;
  const byCode = new Map(list.map((x) => [x.code, x]));
  const picked = codes.map((c) => byCode.get(c));
  return picked.every((x): x is RegionOutput => !!x) ? picked : undefined;
}

/**
 * 지역 × 출력 히트맵: 16개 지역의 출력 구성을 /api/charger-output/regions 한 번으로 받습니다(이전: 지역마다 1회, 16회).
 * region_code를 제외한 충전기 필터(유형·삭제 표시·운영기관)는 그대로 적용합니다.
 *  - 이전 필터 결과(placeholder)를 쓰지 않아, 필터를 바꾸면 새 필터 응답이 올 때까지 로딩으로 보입니다.
 *  - 쿼리 키에 필터가 들어가므로 늦게 도착한 이전 필터 응답은 이전 필터의 캐시에만 들어가 최신 화면을 덮지 않습니다.
 *  - 받은 결과로 지역별 캐시(['charger-output', 지역 필터])를 채워, 지역 비교·분석 패널·Charging Infrastructure가
 *    이전과 같이 추가 요청 없이 재사용합니다(값은 지역별 요청 응답과 같음).
 */
export function useRegionOutputMatrix(f: ChargerFilterParams, regionCodes: string[]) {
  const queryClient = useQueryClient();
  const base = { ...f, region_code: undefined };
  const q = useQuery({
    queryKey: regionOutputsKey(base),
    enabled: regionCodes.length > 0,
    queryFn: ({ signal }) => loadRegionOutputs(queryClient, base, signal),
  });
  return {
    data: q.isPlaceholderData ? undefined : pickRegions(q.data, regionCodes),
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ?? null,
    refetch: () => {
      void q.refetch();
    },
  };
}

const regionOutputsKey = (base: ChargerFilterParams) => ['charger-output-regions', norm(base)] as const;

/** 통합 요청 1회 → 지역별 응답 목록. 받은 결과로 지역별 캐시(['charger-output', 지역 필터])도 채웁니다. */
async function loadRegionOutputs(queryClient: QueryClient, base: ChargerFilterParams, signal: AbortSignal) {
  const list = regionOutputResponses(await api.chargerOutputRegions(base, signal));
  list.forEach(({ code, res }) => queryClient.setQueryData<ChargerOutputResponse>(['charger-output', norm({ ...base, region_code: code })], res));
  return list;
}

/** 박스플롯: 충전소당 충전기 수 분포. 전달한 충전기 필터를 그대로 요청변수로 사용합니다. */
export function useStationSize(f: ChargerFilterParams) {
  return useQuery({
    queryKey: ['station-size', norm(f)],
    queryFn: ({ signal }) => api.stationSize(f, signal),
    placeholderData: keepPreviousData,
  });
}
