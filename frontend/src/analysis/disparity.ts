/**
 * 전국 충전 인프라 구성 격차: 표시용 규칙 모음 (계산식은 백엔드 /api/regional-disparity 그대로).
 * - 지표 정의·단위·형식(OPTIONS), 응답에서 값·순위·분모를 읽는 함수
 * - 선택 지역 분석 문장(규칙 기반): 높음/낮음/같음, 공동 순위, 0건·0분모·미집계·전국값 없음 구분
 * - 히트맵 색 규칙(셀과 범례가 같은 함수를 씀)
 * - URL 상태(gap_metric, gap_type) 해석
 * 여기서 새 지표를 계산하지 않습니다. 화면용으로 하는 연산은 전국 대비 차이(지역 값 − 전국 값)와 공동 순위 개수 세기뿐입니다.
 * 문장은 높고 낮음을 좋고 나쁨으로 평가하지 않고, 공급 구성 차이를 충전 수요·충전소 부족으로 해석하지 않습니다.
 */
import type { DisparityMetricKey, RegionalDisparityData, RegionalDisparityRow } from '../api/types';
import { fmtInt, fmtPct } from '../lib/format';

export type DisparityOption = {
  key: DisparityMetricKey;
  label: string;
  /** 표 머리글 등 좁은 곳에 쓰는 짧은 이름 */
  short: string;
  /** 값 단위 */
  unit: string;
  /** 전국 대비 차이의 단위 */
  diffUnit: string;
  format: (n: number | null | undefined) => string;
};

export const DISPARITY_OPTIONS: DisparityOption[] = [
  { key: 'high_100kw', label: '100kW 이상 비중', short: '100kW 이상 비중', unit: '%', diffUnit: '%p', format: (n) => fmtPct(n, 2) },
  { key: 'chargers_per_station', label: '충전소당 평균 충전기', short: '충전소당 충전기', unit: '기/곳', diffUnit: '기/곳', format: (n) => (n == null ? '—' : `${n.toFixed(2)}기/곳`) },
  { key: 'type_mix', label: '충전기 유형별 구성', short: '유형 비중', unit: '%', diffUnit: '%p', format: (n) => fmtPct(n, 2) },
  { key: 'operator_hhi', label: '운영기관 집중도 (HHI)', short: 'HHI', unit: '점, 0–10,000', diffUnit: '점', format: (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('ko-KR')}점`) },
  { key: 'deletion_share', label: '삭제 표시 비중', short: '삭제 표시 비중', unit: '%', diffUnit: '%p', format: (n) => fmtPct(n, 2) },
];
export const DISPARITY_METRIC_KEYS = DISPARITY_OPTIONS.map((o) => o.key);
export const DEFAULT_METRIC: DisparityMetricKey = 'high_100kw';
export const DEFAULT_TYPE = '04';
export const optionOf = (key: DisparityMetricKey) => DISPARITY_OPTIONS.find((o) => o.key === key)!;

/* ---------------- 응답 읽기 (기존 화면과 같은 규칙) ---------------- */

export const metricValue = (row: RegionalDisparityRow, key: DisparityMetricKey, type: string) => {
  if (key === 'type_mix') return row.metrics.type_mix.find((x) => x.charger_type_code === type)?.value_pct ?? (row.charger_count ? 0 : null);
  const metric = row.metrics[key];
  return 'value_pct' in metric ? metric.value_pct : metric.value;
};
export const nationalValue = (data: RegionalDisparityData, key: DisparityMetricKey, type: string) => {
  if (key === 'type_mix') return data.national.type_mix.find((x) => x.charger_type_code === type)?.value_pct ?? (data.national.chargers_per_station.denominator ? 0 : null);
  const metric = data.national[key];
  return 'value_pct' in metric ? metric.value_pct : metric.value;
};
export const denominator = (row: RegionalDisparityRow, key: DisparityMetricKey, type: string) => {
  if (key === 'type_mix') return row.metrics.type_mix.find((x) => x.charger_type_code === type)?.denominator ?? row.charger_count;
  const m = row.metrics[key];
  return 'denominator' in m ? m.denominator : row.metrics.operator_hhi.operator_count;
};
export const rankOf = (row: RegionalDisparityRow, key: DisparityMetricKey, type: string) =>
  key === 'type_mix' ? row.metrics.type_mix.find((x) => x.charger_type_code === type)?.rank : row.metrics[key].rank;
export const diffFor = (value: number | null | undefined, base: number | null | undefined) => (value == null || base == null ? null : value - base);
export const diffText = (n: number | null, o: DisparityOption) =>
  n == null
    ? '—'
    : `${n >= 0 ? '+' : '−'}${o.key === 'operator_hhi' ? Math.round(Math.abs(n)).toLocaleString('ko-KR') : Math.abs(n).toFixed(2)}${o.diffUnit}`;
export const regionLabel = (r: { region_code: string; region_name: string }) => (r.region_code === '12' ? '전남광주' : r.region_name);
export const denomUnit = (key: DisparityMetricKey) => (key === 'operator_hhi' ? '개 기관' : key === 'chargers_per_station' ? '곳' : '기');
export const denomBasis = (key: DisparityMetricKey) =>
  key === 'high_100kw' ? '출력값이 양수인 충전기' : key === 'chargers_per_station' ? '고유 충전소 ID' : key === 'type_mix' ? '지역 충전기' : key === 'operator_hhi' ? '기관 ID·명칭 조합' : '삭제 상태 전체 충전기';

/** 표시 단위로 반올림한 차이가 0이면 '같음'으로 봅니다(화면 숫자와 문장이 어긋나지 않게). */
export function roundedDiff(n: number, key: DisparityMetricKey) {
  const r = key === 'operator_hhi' ? Math.round(n) : Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/* ---------------- 상태와 순위 ---------------- */

export type MetricStatus =
  /** 값이 있음 */
  | 'ok'
  /** 필터 조건의 충전기가 이 지역에 0기 → 계산하지 않음 */
  | 'no-chargers'
  /** 충전기는 있지만 이 지표의 분모가 0 (예: 출력값이 확인된 충전기 0기) */
  | 'zero-denominator'
  /** 응답에 이 지표가 없음 */
  | 'not-aggregated';

export interface MetricReading {
  status: MetricStatus;
  value: number | null;
  national: number | null;
  numerator: number | null;
  denominator: number | null;
  rank: number | null;
  /** 같은 순위를 가진 지역 수(자신 포함). 1이면 단독 */
  tiedCount: number;
  /** 순위가 매겨진 지역 수(값이 null인 지역 제외) */
  rankedCount: number;
  /** 유형 지표: 그 유형 충전기 수 / HHI: 운영기관 그룹 수 */
  count: number | null;
}

function readingOf(data: RegionalDisparityData, row: RegionalDisparityRow, key: DisparityMetricKey, type: string): MetricReading {
  const raw = row.metrics?.[key] as unknown;
  if (raw == null || (key === 'type_mix' && !Array.isArray(raw)))
    return { status: 'not-aggregated', value: null, national: null, numerator: null, denominator: null, rank: null, tiedCount: 0, rankedCount: 0, count: null };
  const value = metricValue(row, key, type) ?? null;
  const national = nationalValue(data, key, type) ?? null;
  const rank = rankOf(row, key, type) ?? null;
  const ranks = data.regions.map((r) => (r.metrics?.[key] == null ? undefined : rankOf(r, key, type))).filter((x): x is number => typeof x === 'number');
  const tiedCount = rank == null ? 0 : ranks.filter((x) => x === rank).length;
  let numerator: number | null = null;
  let denom: number | null = null;
  let count: number | null = null;
  let present = true;
  if (key === 'type_mix') {
    const item = row.metrics.type_mix?.find((x) => x.charger_type_code === type);
    count = item?.charger_count ?? (row.charger_count ? 0 : null);
    numerator = count;
    denom = item?.denominator ?? row.charger_count;
    present = Array.isArray(row.metrics.type_mix);
  } else if (key === 'operator_hhi') {
    const m = row.metrics.operator_hhi;
    present = !!m;
    count = m?.operator_count ?? null;
    denom = row.charger_count;
  } else {
    const m = row.metrics[key];
    present = !!m;
    numerator = m?.numerator ?? null;
    denom = m?.denominator ?? null;
  }
  let status: MetricStatus = 'ok';
  if (!present) status = 'not-aggregated';
  else if (value == null) {
    // deletion_share는 삭제 상태 필터와 무관한 모집단(분모)이므로 그 분모로 판단합니다.
    if (key === 'deletion_share') status = (denom ?? 0) === 0 ? 'no-chargers' : 'zero-denominator';
    else status = row.charger_count === 0 ? 'no-chargers' : 'zero-denominator';
  }
  return { status, value, national, numerator, denominator: denom, rank, tiedCount, rankedCount: ranks.length, count };
}
export { readingOf as metricReading };

/** 표시 단위 기준 전국 대비 구분: up/down/same, 계산 불가는 null */
export function compareToNational(value: number | null | undefined, national: number | null | undefined, key: DisparityMetricKey): 'up' | 'down' | 'same' | null {
  if (value == null || national == null) return null;
  const d = roundedDiff(value - national, key);
  return d > 0 ? 'up' : d < 0 ? 'down' : 'same';
}

/* ---------------- 분석 문장 ---------------- */

/** 값 뒤 조사 '(으)로': 마지막 한글에 받침이 있으면(ㄹ 제외) '으로'. %·숫자 등은 '로'(퍼센트로). */
export function ro(text: string) {
  const ch = [...text.replace(/[)\s]+$/, '')].pop() ?? '';
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const jong = (c - 0xac00) % 28;
    return jong === 0 || jong === 8 ? `${text}로` : `${text}으로`;
  }
  return `${text}로`;
}

function rankPhrase(r: MetricReading) {
  if (r.rank == null) return '순위 없음';
  return `${r.rankedCount}개 지역 중 ${r.rank}위${r.tiedCount > 1 ? `(${r.tiedCount}개 지역 공동)` : ''}`;
}

/** 전국 대비 비교 문장 조각: "전국 기준 8.04%보다 2.57%p 낮습니다" / "전국 기준과 같습니다(…)" */
function comparePhrase(r: MetricReading, o: DisparityOption, key: DisparityMetricKey) {
  if (r.national == null) return '전국 기준값이 없어 전국과 비교하지 않았습니다';
  const d = roundedDiff((r.value as number) - r.national, key);
  if (d === 0) return `전국 기준(${o.format(r.national)})과 같은 수준입니다(표시 단위에서 차이 없음)`;
  const amount = diffText(Math.abs(d), o).slice(1); // 부호 없이
  return `전국 기준(${o.format(r.national)})보다 ${amount} ${d > 0 ? '높습니다' : '낮습니다'}`;
}

export interface NarrativeContext {
  /** 유형 지표에서 쓰는 유형 이름 (예: 'DC콤보') */
  typeName?: string;
}

/**
 * 선택 지역의 한 지표에 대한 분석 문장. 숫자는 화면 표시와 같은 형식입니다.
 * 반환: 본문 문장들(배열). 화면은 이어 붙여 한 단락으로 표시합니다.
 */
export function narrate(data: RegionalDisparityData, row: RegionalDisparityRow, key: DisparityMetricKey, type: string, ctx: NarrativeContext = {}): string[] {
  const o = optionOf(key);
  const r = readingOf(data, row, key, type);
  const name = regionLabel(row);
  const typeLabel = `유형 ${type}${ctx.typeName ? ` ${ctx.typeName}` : ''}`;

  if (r.status === 'not-aggregated') return ['이 지표는 API 응답에 집계되지 않아(미집계) 값과 순위를 표시하지 않습니다.'];
  if (r.status === 'no-chargers')
    return [`현재 필터 조건에 맞는 충전기가 ${name}에 0기여서 이 지표를 계산하지 않았고 순위에서도 제외했습니다.`];
  if (r.status === 'zero-denominator') {
    if (key === 'high_100kw')
      return [`${name}에는 충전기 ${fmtInt(row.charger_count)}기가 있지만 출력값이 확인된 충전기가 0기여서(분모 0) 100kW 이상 비중을 계산할 수 없습니다.`];
    if (key === 'operator_hhi') return [`${name}의 운영기관 그룹이 0개여서 HHI를 계산할 수 없습니다(분모 0).`];
    return [`${name}의 이 지표 분모가 0이어서 값을 계산할 수 없습니다.`];
  }

  const v = o.format(r.value);
  const cmp = comparePhrase(r, o, key);
  const rank = rankPhrase(r);
  switch (key) {
    case 'high_100kw':
      return [
        `${name}의 100kW 이상 충전기 비중은 ${ro(v)} ${cmp}. ${rank}입니다.`,
        `출력값이 확인된 충전기 ${fmtInt(r.denominator ?? 0)}기 중 ${fmtInt(r.numerator ?? 0)}기가 100kW 이상입니다.`,
      ];
    case 'chargers_per_station':
      return [
        `${name}의 충전소당 평균 충전기 수는 ${ro(v)} ${cmp}. ${rank}입니다.`,
        `충전기 ${fmtInt(r.numerator ?? 0)}기를 고유 충전소 ${fmtInt(r.denominator ?? 0)}곳으로 나눈 값입니다.`,
      ];
    case 'type_mix':
      return [
        `${typeLabel} 충전기는 ${name} 충전기의 ${ro(`${v}(${fmtInt(r.count ?? 0)}기)`)} ${cmp}. ${rank}입니다.`,
        ...(r.count === 0 ? [`이 지역에는 ${typeLabel} 충전기가 없어 비중이 0%입니다.`] : []),
      ];
    case 'operator_hhi':
      return [
        `${name}의 운영기관 집중도(HHI)는 ${ro(v)} ${cmp}. ${rank}입니다.`,
        `HHI는 운영기관 그룹별 충전기 점유율을 제곱해 더한 값(0–10,000)으로, 클수록 충전기가 소수 운영기관에 몰려 있다는 뜻입니다. 이 지역 운영기관 그룹 ${fmtInt(r.count ?? 0)}개 기준입니다.`,
      ];
    case 'deletion_share':
      return [
        `${name} 충전기 ${fmtInt(r.denominator ?? 0)}기 중 삭제 표시 충전기는 ${fmtInt(r.numerator ?? 0)}기로 ${v}이며, ${cmp}. ${rank}입니다.`,
        '삭제 표시는 자료상 표기이며 실제 고장이나 사용 불가를 뜻하지 않습니다.',
      ];
  }
}

/**
 * 요약 카드의 핵심 분석 한 줄. 상세 문장(narrate)과 같은 값·같은 규칙에서 만듭니다.
 * 예: "전국 기준(8.04%)보다 2.57%p 낮습니다."
 */
export function headline(data: RegionalDisparityData, row: RegionalDisparityRow, key: DisparityMetricKey, type: string): string {
  const o = optionOf(key);
  const r = readingOf(data, row, key, type);
  if (r.status === 'not-aggregated') return '미집계: API 응답에 이 지표가 없습니다.';
  if (r.status === 'no-chargers') return '필터 조건의 충전기가 0기라 계산하지 않았습니다.';
  if (r.status === 'zero-denominator')
    return key === 'high_100kw' ? '출력값이 확인된 충전기가 0기라(분모 0) 계산할 수 없습니다.' : '분모가 0이라 계산할 수 없습니다.';
  return `${comparePhrase(r, o, key).replace(/\(표시 단위에서 차이 없음\)$/, '')}.`;
}

/** 요약 카드의 순위 줄: "16개 지역 중 14위(2개 지역 공동)" / 값이 없으면 "순위 없음(계산 제외)" */
export function rankLine(data: RegionalDisparityData, row: RegionalDisparityRow, key: DisparityMetricKey, type: string): string {
  const r = readingOf(data, row, key, type);
  return r.rank == null ? '순위 없음(계산 제외)' : rankPhrase(r);
}

/** 요약 패널 공통 안내 */
export const NARRATIVE_NOTE =
  '지표의 높고 낮음은 공급 구성의 차이이며 좋고 나쁨을 뜻하지 않습니다. 충전 수요나 충전소 부족을 나타내지도 않습니다.';

/* ---------------- 히트맵 색 규칙 (셀·범례 공용) ---------------- */

export const HEAT_UP_RGB = '129, 211, 203';
export const HEAT_DOWN_RGB = '177, 157, 255';
export const HEAT_MIN_ALPHA = 0.1;
export const HEAT_ALPHA_RANGE = 0.35;
/** 색 강도의 기준(이 크기 이상의 차이면 가장 진함) = |전국 기준값|, 전국 기준값이 0 또는 없음이면 1 */
export const heatScale = (national: number | null | undefined) => Math.abs(national ?? 0) || 1;
export function heatIntensity(delta: number | null, national: number | null | undefined) {
  return delta == null ? 0 : Math.min(1, Math.abs(delta) / heatScale(national));
}
/** 차이 ≥ 0(같음 포함)은 청록, 음수는 라벤더. 차이 없음(null)은 색 없음. */
export function heatColor(delta: number | null, national: number | null | undefined): string | undefined {
  if (delta == null) return undefined;
  const a = HEAT_MIN_ALPHA + heatIntensity(delta, national) * HEAT_ALPHA_RANGE;
  return `rgba(${delta >= 0 ? HEAT_UP_RGB : HEAT_DOWN_RGB}, ${Number(a.toFixed(4))})`;
}

/* ---------------- URL 상태 ---------------- */

export const GAP_KEYS = { metric: 'gap_metric', type: 'gap_type' } as const;

/**
 * gap_metric·gap_type 해석. 허용되지 않은 값은 기본값으로 보고 remove에 담아 URL에서 지웁니다.
 * gap_type은 유형 지표일 때만 의미가 있어, 다른 지표와 함께 오면 지웁니다. 기본값은 URL에 쓰지 않습니다.
 */
export function parseGapParams(params: URLSearchParams, typeCodes: readonly string[]) {
  const remove: string[] = [];
  const rawMetric = params.get(GAP_KEYS.metric);
  const rawType = params.get(GAP_KEYS.type);
  let metric: DisparityMetricKey = DEFAULT_METRIC;
  if (rawMetric !== null) {
    if ((DISPARITY_METRIC_KEYS as string[]).includes(rawMetric) && rawMetric !== DEFAULT_METRIC) metric = rawMetric as DisparityMetricKey;
    else remove.push(GAP_KEYS.metric);
  }
  let type = DEFAULT_TYPE;
  if (rawType !== null) {
    if (metric === 'type_mix' && typeCodes.includes(rawType) && rawType !== DEFAULT_TYPE) type = rawType;
    else remove.push(GAP_KEYS.type);
  }
  return { metric, type, remove };
}

/* ---------------- 설명 패널 문구(지표 정의·분자·분모·주의) ---------------- */

/**
 * 기본 화면은 한국어 설명만 씁니다(내부 필드명·영어 원문 없음).
 * fields: '기술 상세 · API 원문'을 펼쳤을 때만 보이는 원자료 필드 대응표입니다.
 */
export const DISPARITY_DEFS: Record<
  DisparityMetricKey,
  { definition: string; formula: string; numerator: string; denominator: string; caution: string; variables: string[]; fields: string[] }
> = {
  high_100kw: {
    definition: '출력값이 확인된 충전기 가운데 출력 100kW 이상인 충전기의 비중입니다.',
    formula: '100kW 이상 충전기 수 ÷ 출력값이 확인된 충전기 수 × 100',
    numerator: '출력이 100kW 이상인 충전기 수',
    denominator: '출력값이 확인된 충전기 수. 출력이 비어 있거나 0 이하이거나 숫자가 아닌 충전기는 분자와 분모 모두에서 뺍니다.',
    caution: '출력 정보가 없는 충전기는 계산에서 빠지므로, 분모(출력 확인 충전기 수)가 지역 충전기 수보다 작을 수 있습니다.',
    variables: ['지역', '충전기 출력', '충전기 유형·운영기관·삭제 표시 (상단 필터)'],
    fields: ['지역: zcode', '출력: output_kw (양수인 숫자만 분모에 포함)', '상단 필터: chgerType · busiId · delYn'],
  },
  chargers_per_station: {
    definition: '충전소 한 곳에 설치된 충전기의 평균 개수입니다.',
    formula: '지역 충전기 수 ÷ 지역 충전소 수',
    numerator: '지역 충전기 수',
    denominator: '지역 충전소 수(같은 충전소 ID는 한 곳으로 셉니다)',
    caution: '평균값이라 충전소 간 규모 차이는 보이지 않습니다. 충전소 크기 분포는 별도 그래프를 참고하세요.',
    variables: ['지역', '충전소', '충전기 유형·운영기관·삭제 표시 (상단 필터)'],
    fields: ['지역: zcode', '충전소: statId (고유값 개수)', '상단 필터: chgerType · busiId · delYn'],
  },
  type_mix: {
    definition: '지역 충전기 가운데 선택한 충전기 유형이 차지하는 비중입니다.',
    formula: '선택한 유형의 충전기 수 ÷ 지역 충전기 수 × 100',
    numerator: '선택한 유형의 충전기 수',
    denominator: '지역 충전기 수',
    caution: '유형 코드는 원자료 분류 그대로이며 여러 커넥터를 함께 가진 유형이 있습니다. 상단 유형 필터를 적용하면 그 유형만 남아 비중이 100% 또는 0%가 됩니다.',
    variables: ['지역', '충전기 유형', '운영기관·삭제 표시 (상단 필터)'],
    fields: ['지역: zcode', '충전기 유형: chgerType', '상단 필터: busiId · delYn'],
  },
  operator_hhi: {
    definition:
      '허핀달-허쉬만 지수(HHI)로 본 운영기관 집중도입니다. 운영기관마다 충전기 점유율(%)을 구해 제곱한 뒤 모두 더한 값(0–10,000)이며, 클수록 충전기가 소수 운영기관에 몰려 있고 작을수록 여러 운영기관에 나뉘어 있습니다.',
    formula: '운영기관별 (그 운영기관의 충전기 수 ÷ 지역 충전기 수 × 100)²을 모두 더함 · 한 기관이 전부 운영하면 10,000',
    numerator: '운영기관별 충전기 수(운영기관 ID와 이름이 같은 묶음을 한 기관으로 봅니다)',
    denominator: '지역 충전기 수(점유율의 분모)',
    caution: '운영기관 수가 적은 지역은 HHI가 크게 나오기 쉽습니다. 운영기관 집중도는 시장 지배력이나 서비스 품질을 직접 나타내지 않습니다.',
    variables: ['지역', '운영기관', '충전기 유형·삭제 표시 (상단 필터)'],
    fields: ['지역: zcode', '운영기관: busiId · busiNm 조합', '상단 필터: chgerType · delYn'],
  },
  deletion_share: {
    definition: '원자료에 삭제 표시가 된 충전기의 비중입니다.',
    formula: '삭제 표시 충전기 수 ÷ 전체 충전기 수 × 100',
    numerator: '삭제 표시가 된 충전기 수',
    denominator: '삭제 표시 여부와 관계없는 전체 충전기 수(이 지표에는 상단 삭제 표시 필터를 적용하지 않습니다)',
    caution: '삭제 표시는 자료상 표기입니다. 실제 고장, 철거, 사용 불가를 뜻한다고 확인되지 않았습니다.',
    variables: ['지역', '삭제 표시', '충전기 유형·운영기관 (상단 필터)'],
    fields: ['지역: zcode', '삭제 표시: delYn (Y = 삭제 표시)', '상단 필터: chgerType · busiId (delYn 필터는 이 지표에서 무시)'],
  },
};
