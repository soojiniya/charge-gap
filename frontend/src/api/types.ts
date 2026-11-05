/**
 * CHARGE GAP Flask API 응답 타입 — backend/API_SPEC.md, openapi.json 기준.
 * 필드명은 API 원문 그대로 유지합니다.
 */

export type DeletionFilter = 'all' | 'not_deleted' | 'deleted';

/** 충전기 공통 요청변수 (값 하나씩, 생략 시 전체) */
export interface ChargerFilterParams {
  region_code?: string;
  charger_type?: string;
  deletion?: DeletionFilter;
  operator_id?: string;
}

export interface ChargerCounts {
  charger_count: number;
  station_count: number;
  not_deleted_charger_count: number;
  deleted_charger_count: number;
}

export interface SourceInfo {
  provider?: string;
  author?: string;
  platform?: string;
  dataset?: string;
  reference_basis?: string;
  file_saved_date?: string;
  official_update_label_at_collection?: string;
  revision_note?: string;
  license?: string;
  license_confirmed?: boolean;
  file?: string;
  source?: string;
  source_url?: string;
  reference_month?: string;
  snapshot_date?: string;
  snapshot_start_at?: string;
  snapshot_end_at?: string;
  region_system?: string;
  unit?: string;
  fuel?: string;
  period?: string;
  partial_year?: number;
  measurement_cutoff_date?: string | null;
  source_filename_date?: string;
  geography?: string;
  reference?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  next_page: number | null;
}

export interface BaseMeta {
  api_version: string;
  sources: Record<string, SourceInfo>;
  units: Record<string, string>;
  filters: Record<string, unknown>;
  warnings: string[];
  same_period_shortage_rate_computed: false;
  snapshot_policy: string;
  matched?: ChargerCounts;
  count?: number;
  pagination?: Pagination;
}

export interface ApiEnvelope<D, M extends BaseMeta = BaseMeta> {
  data: D;
  meta: M;
}

export interface ApiErrorBody {
  error: { code: string; message: string; parameter: string | null };
  meta: { api_version: string };
}

/* ---------- /api/overview ---------- */
export interface CodeName {
  code: string;
  name: string;
}
export interface ChargerTypeOption extends CodeName {
  observed_charger_count: number;
}
export interface FilterOptions {
  charger_regions: CodeName[];
  ev_regions: CodeName[];
  charger_types: ChargerTypeOption[];
  deletion: DeletionFilter[];
}
export interface OverviewData {
  ev_registration: { ev_registration_count: number; region_count: number; reference_month: string };
  chargers: ChargerCounts;
  national_snapshot_totals: ChargerCounts & { ev_registration_count: number };
}
export interface OverviewMeta extends BaseMeta {
  filter_scopes: Record<string, string>;
  filter_options: FilterOptions;
}

/* ---------- /api/ev-registration ---------- */
export interface EvRegistrationRow {
  reference_month: string;
  region_system: string;
  region_code: string;
  region_name: string;
  ev_registration_count: number;
  ev_passenger_count: number;
  ev_bus_count: number;
  ev_truck_count: number;
  ev_special_count: number;
  ev_noncommercial_count: number;
  ev_commercial_count: number;
}
export interface EvRegistrationMeta extends BaseMeta {
  totals: { ev_registration_count: number };
}

/* ---------- charger aggregates ---------- */
export interface ShareRow extends ChargerCounts {
  share_pct: number | null;
}
export interface ChargerRegionRow extends ShareRow {
  region_code: string;
  region_name: string;
}
export interface ChargerTypeRow extends ShareRow {
  charger_type_code: string;
  official_definition: string;
  definition_verified: boolean;
}
export type OutputValueStatus = 'positive_numeric' | 'missing' | 'nonpositive' | 'nonnumeric';
export interface ChargerOutputRow extends ShareRow {
  output_raw: string;
  output_kw: number | null;
  value_status: OutputValueStatus;
}
export interface OutputStatistics {
  valid_positive_count: number;
  invalid_or_missing_count: number;
  median_kw: number | null;
  min_kw: number | null;
  max_kw: number | null;
}
export interface ChargerOutputMeta extends BaseMeta {
  output_statistics: OutputStatistics;
  output_note: string;
}
export interface ChargerTypesMeta extends BaseMeta {
  definition_source: string;
  classification_note: string;
}
export interface OperatorRow extends ShareRow {
  operator_id: string;
  operator_name: string;
}

export type DisparityMetricKey = 'high_100kw' | 'chargers_per_station' | 'type_mix' | 'operator_hhi' | 'deletion_share';
export interface DisparityValue { numerator?: number; denominator?: number; value?: number | null; value_pct?: number | null; rank?: number; scale?: string; operator_count?: number; }
export interface DisparityTypeValue { charger_type_code: string; charger_count: number; denominator: number; value_pct: number | null; rank?: number; }
export interface RegionalDisparityRow {
  region_code: string; region_name: string; charger_count: number; station_count: number;
  metrics: { high_100kw: DisparityValue; chargers_per_station: DisparityValue; type_mix: DisparityTypeValue[]; operator_hhi: DisparityValue; deletion_share: DisparityValue };
}
export interface RegionalDisparityData {
  regions: RegionalDisparityRow[];
  national: { high_100kw: DisparityValue; chargers_per_station: DisparityValue; type_mix: DisparityTypeValue[]; operator_hhi: DisparityValue; deletion_share: DisparityValue };
}
export interface RegionalDisparityMeta extends BaseMeta {
  region_count: number; metric_rules: Record<string, string>; national_basis: string;
  region_filter_policy: string; deletion_share_policy: string; ranking_policy: string; deletion_warning: string;
}

/* ---------- /api/growth ---------- */
export interface GrowthRow {
  year: number;
  annual_installed_count: number;
  cumulative_count: number;
  completed_calendar_year: boolean;
  is_partial_year: boolean;
  measurement_cutoff_date: string | null;
}
export interface GrowthMeta extends BaseMeta {
  growth_warning: string;
}

/* ---------- /api/locations ---------- */
export interface LocationRow extends ChargerCounts {
  station_id: string;
  station_name: string;
  address: string;
  region_code: string;
  region_name: string;
  latitude: number;
  longitude: number;
}
export interface LocationsMeta extends BaseMeta {
  matched: ChargerCounts;
  pagination: Pagination;
  invalid_coordinate_rows_excluded_from_representative_selection: number;
  stations_without_valid_coordinates_excluded: number;
  representative_coordinate_rule: string;
  coordinate_reference_system: string;
}
/** 최소경도,최소위도,최대경도,최대위도 */
export type BBox = [number, number, number, number];

/* ---------- /api/charts ---------- */
export interface StaticChart {
  id: number;
  filename: string;
  title: string;
  chart_type: string;
  purpose: string;
  data: string;
  reason: string;
  results: string;
  caution: string;
  period: string;
  metrics: Record<string, unknown>;
  image_pixels: [number, number];
  dpi: [number, number];
  sha256: string;
  image_url: string;
  filters_apply: false;
}
export interface ChartsMeta extends BaseMeta {
  static_chart_warning: string;
}

/* ---------- /api/station-size-distribution ---------- */
export interface OutlierBin {
  /** 충전소 1곳의 충전기 수 (기/곳) */
  charger_count: number;
  /** 그 값을 가진 이상치 충전소 수 (곳) */
  station_count: number;
}
export interface StationSizeRow {
  region_code: string;
  region_name: string;
  station_count: number;
  sample_count: number;
  charger_count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  iqr: number;
  fence_low: number;
  fence_high: number;
  whisker_low: number;
  whisker_high: number;
  outlier_count: number;
  outlier_distribution: OutlierBin[];
}
export interface StationSizeMeta extends BaseMeta {
  matched: ChargerCounts;
  sample_count: number;
  count: number;
  quantile_method: string;
  whisker_iqr_multiplier: number;
  whisker_rule: string;
  sample_unit: string;
  deletion_policy: string;
  empty_policy: string;
}
