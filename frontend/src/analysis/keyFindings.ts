import type { RegionalDisparityData, RegionalDisparityRow } from '../api/types';
import { regionLabel } from './disparity';
import { ols, pearson } from '../lib/stats';

/**
 * Overview "주요 분석 발견": /api/regional-disparity(필터 없음, 16개 지역) 응답에서만 계산합니다.
 * 모든 수치는 같은 충전기 조회 시점(2026-10-15) 자료이며, 전기차 등록 통계와 결합하지 않습니다.
 * 표시용 계산은 최댓값·최솟값 선택, 뺄셈·나눗셈, 피어슨 상관계수(lib/stats)뿐입니다.
 */

export interface FindingPoint { code: string; name: string; value: number }
export interface Extremes {
  max: FindingPoint;
  min: FindingPoint;
  national: number;
  points: FindingPoint[];
  above: number;
  below: number;
  /** 충전기 수가 가장 많은 지역의 값과 API 순위(대수와 구성 비율이 별개임을 보여 주는 대조) */
  largest: FindingPoint & { chargers: number; rank: number | null };
}
export interface ScatterPoint { code: string; name: string; x: number; y: number }
export interface Correlation {
  r: number;
  n: number;
  points: ScatterPoint[];
  national: { x: number; y: number };
  fit: { intercept: number; slope: number } | null;
  xMax: ScatterPoint;
  xMin: ScatterPoint;
}
export interface KeyFindings { fast: Extremes; correlation: Correlation; hhi: Extremes }

const val = (row: RegionalDisparityRow, key: 'high_100kw' | 'chargers_per_station' | 'operator_hhi') => {
  const m = row.metrics[key];
  const v = key === 'high_100kw' ? m.value_pct : m.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const nat = (data: RegionalDisparityData, key: 'high_100kw' | 'chargers_per_station' | 'operator_hhi') => {
  const m = data.national[key];
  const v = key === 'high_100kw' ? m.value_pct : m.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

function extremes(data: RegionalDisparityData, key: 'high_100kw' | 'operator_hhi'): Extremes | null {
  const national = nat(data, key);
  const points = data.regions
    .map((r) => ({ code: r.region_code, name: regionLabel(r), value: val(r, key) }))
    .filter((p): p is FindingPoint => p.value != null);
  if (national == null || points.length < 2) return null;
  // 같은 값이면 지역 코드 순으로 정해 결과가 매번 같도록 합니다.
  const sorted = [...points].sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
  const big = [...data.regions].sort((a, b) => b.charger_count - a.charger_count || a.region_code.localeCompare(b.region_code))[0];
  const bigValue = val(big, key);
  if (bigValue == null) return null;
  return {
    largest: { code: big.region_code, name: regionLabel(big), value: bigValue, chargers: big.charger_count, rank: big.metrics[key].rank ?? null },
    max: sorted[0],
    min: sorted[sorted.length - 1],
    national,
    points,
    above: points.filter((p) => p.value > national).length,
    below: points.filter((p) => p.value < national).length,
  };
}

function correlation(data: RegionalDisparityData): Correlation | null {
  const points = data.regions
    .map((r) => ({ code: r.region_code, name: regionLabel(r), x: val(r, 'chargers_per_station'), y: val(r, 'high_100kw') }))
    .filter((p): p is ScatterPoint => p.x != null && p.y != null);
  const nx = nat(data, 'chargers_per_station');
  const ny = nat(data, 'high_100kw');
  const r = pearson(points.map((p) => p.x), points.map((p) => p.y));
  if (r == null || nx == null || ny == null) return null;
  const fit = ols(points.map((p) => p.x), points.map((p) => p.y));
  const byX = [...points].sort((a, b) => b.x - a.x || a.code.localeCompare(b.code));
  return { r, n: points.length, points, national: { x: nx, y: ny }, fit: fit && { intercept: fit.intercept, slope: fit.slope }, xMax: byX[0], xMin: byX[byX.length - 1] };
}

/** 세 발견을 모두 계산할 수 있으면 반환하고, 하나라도 계산할 수 없으면 null(화면은 빈 상태 표시). */
export function computeKeyFindings(data: RegionalDisparityData | undefined): KeyFindings | null {
  if (!data?.regions?.length) return null;
  const fast = extremes(data, 'high_100kw');
  const hhi = extremes(data, 'operator_hhi');
  const corr = correlation(data);
  return fast && hhi && corr ? { fast, correlation: corr, hhi } : null;
}

/** 상관계수 표기: −0.90처럼 소수 둘째 자리, 음수는 유니코드 마이너스 */
export const fmtR = (r: number) => `${r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}`;
