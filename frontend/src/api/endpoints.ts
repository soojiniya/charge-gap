import { apiGet } from './client';
import type {
  BBox,
  ChargerFilterParams,
  ChargerOutputMeta,
  ChargerOutputRegionsData,
  ChargerOutputRegionsMeta,
  ChargerOutputRow,
  ChargerRegionRow,
  ChargerTypeRow,
  ChargerTypesMeta,
  ChartsMeta,
  EvRegistrationMeta,
  EvRegistrationRow,
  GrowthMeta,
  GridCell,
  GrowthRow,
  LocationGridMeta,
  LocationRow,
  LocationsMeta,
  OperatorRow,
  RegionalDisparityData,
  RegionalDisparityMeta,
  OverviewData,
  OverviewMeta,
  BaseMeta,
  StaticChart,
  StationSizeMeta,
  StationSizeRow,
} from './types';

/**
 * bbox 요청변수. 받은 좌표의 정밀도를 줄이지 않습니다(소수 7자리 ≈ 1cm까지, 부동소수점 잔여값만 정리).
 * 지도 화면 bbox는 이미 바깥쪽으로 맞춘 소수 5자리 값이라 그대로 전달됩니다(geo/bbox.ts).
 * 이전의 toFixed(4)는 가장 가까운 값으로 반올림해 바깥쪽으로 맞춘 범위를 다시 안쪽으로 줄일 수 있었습니다.
 */
export function bboxParam(b: BBox): string {
  return b.map((v) => String(Number(v.toFixed(7)))).join(',');
}

/** deletion 기본값(all)은 서버 기본값과 같으므로 생략해 URL을 짧게 유지합니다. */
function chargerParams(f: ChargerFilterParams) {
  return {
    region_code: f.region_code,
    charger_type: f.charger_type,
    deletion: f.deletion && f.deletion !== 'all' ? f.deletion : undefined,
    operator_id: f.operator_id,
  };
}

export const api = {
  overview: (f: ChargerFilterParams & { ev_region_code?: string }, signal?: AbortSignal) =>
    apiGet<OverviewData, OverviewMeta>('/api/overview', { ...chargerParams(f), ev_region_code: f.ev_region_code }, signal),

  /** region_code는 2026-09의 16개 지역 코드, 전남광주=12. */
  evRegistration: (regionCode: string | undefined, signal?: AbortSignal) =>
    apiGet<EvRegistrationRow[], EvRegistrationMeta>('/api/ev-registration', { region_code: regionCode }, signal),

  chargerRegions: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<ChargerRegionRow[]>('/api/charger-regions', chargerParams(f), signal),

  regionalDisparity: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<RegionalDisparityData, RegionalDisparityMeta>('/api/regional-disparity', chargerParams(f), signal),

  chargerTypes: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<ChargerTypeRow[], ChargerTypesMeta>('/api/charger-types', chargerParams(f), signal),

  chargerOutput: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<ChargerOutputRow[], ChargerOutputMeta>('/api/charger-output', chargerParams(f), signal),

  /** 16개 지역의 /api/charger-output 결과를 한 번에 (지역 × 출력 히트맵). 지역 필터는 보내지 않습니다(서버도 무시). */
  chargerOutputRegions: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<ChargerOutputRegionsData, ChargerOutputRegionsMeta>('/api/charger-output/regions', chargerParams({ ...f, region_code: undefined }), signal),

  /** limit 1~200 (기본 50) */
  operators: (f: ChargerFilterParams & { page?: number; limit?: number }, signal?: AbortSignal) =>
    apiGet<OperatorRow[]>('/api/operators', { ...chargerParams(f), page: f.page, limit: f.limit }, signal),

  /** year_from/year_to 2011~2026 */
  growth: (range: { year_from?: number; year_to?: number }, signal?: AbortSignal) =>
    apiGet<GrowthRow[], GrowthMeta>('/api/growth', range, signal),

  /** limit 1~1000 (기본 200), bbox=최소경도,최소위도,최대경도,최대위도 */
  locations: (
    f: ChargerFilterParams & { page?: number; limit?: number; bbox?: BBox | null },
    signal?: AbortSignal,
  ) =>
    apiGet<LocationRow[], LocationsMeta>(
      '/api/locations',
      { ...chargerParams(f), page: f.page, limit: f.limit, bbox: f.bbox ? bboxParam(f.bbox) : undefined },
      signal,
    ),

  /** 지도 줌 11~15: 화면 영역 전체 충전소를 고정 격자 칸으로 집계 (bbox·zoom 필수) */
  locationGrid: (f: ChargerFilterParams & { bbox: BBox; zoom: number }, signal?: AbortSignal) =>
    apiGet<GridCell[], LocationGridMeta>(
      '/api/locations/grid',
      { ...chargerParams(f), bbox: bboxParam(f.bbox), zoom: f.zoom },
      signal,
    ),

  /** 지역별 충전소당 충전기 수 분포 (박스플롯 통계). page/limit/bbox 없음 */
  stationSize: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<StationSizeRow[], StationSizeMeta>('/api/station-size-distribution', chargerParams(f), signal),

  charts: (chartId?: number, signal?: AbortSignal) =>
    apiGet<StaticChart[], ChartsMeta & BaseMeta>('/api/charts', { chart_id: chartId }, signal),
};
