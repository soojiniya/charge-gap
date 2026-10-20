import { apiGet } from './client';
import type {
  BBox,
  ChargerFilterParams,
  ChargerOutputMeta,
  ChargerOutputRow,
  ChargerRegionRow,
  ChargerTypeRow,
  ChargerTypesMeta,
  ChartsMeta,
  EvRegistrationMeta,
  EvRegistrationRow,
  GrowthMeta,
  GrowthRow,
  LocationRow,
  LocationsMeta,
  OperatorRow,
  OverviewData,
  OverviewMeta,
  BaseMeta,
  StaticChart,
  StationSizeMeta,
  StationSizeRow,
} from './types';

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

  chargerTypes: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<ChargerTypeRow[], ChargerTypesMeta>('/api/charger-types', chargerParams(f), signal),

  chargerOutput: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<ChargerOutputRow[], ChargerOutputMeta>('/api/charger-output', chargerParams(f), signal),

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
      { ...chargerParams(f), page: f.page, limit: f.limit, bbox: f.bbox ? f.bbox.map((v) => v.toFixed(4)).join(',') : undefined },
      signal,
    ),

  /** 지역별 충전소당 충전기 수 분포 (박스플롯 통계). page/limit/bbox 없음 */
  stationSize: (f: ChargerFilterParams, signal?: AbortSignal) =>
    apiGet<StationSizeRow[], StationSizeMeta>('/api/station-size-distribution', chargerParams(f), signal),

  charts: (chartId?: number, signal?: AbortSignal) =>
    apiGet<StaticChart[], ChartsMeta & BaseMeta>('/api/charts', { chart_id: chartId }, signal),
};
