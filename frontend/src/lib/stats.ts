/**
 * 실제 API 응답으로부터 계산하는 기초 통계 (가짜 값 생성 없음).
 * 모든 함수는 입력 배열만 사용하며, 입력이 부족하면 null을 반환합니다.
 */

export function sum(values: number[]) {
  return values.reduce((s, v) => s + v, 0);
}

/** 피어슨 상관계수 */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = sum(xs) / n;
  const my = sum(ys) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** 최소제곱 단순회귀 y = a + b·x */
export function ols(xs: number[], ys: number[]): { intercept: number; slope: number; r2: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = sum(xs) / n;
  const my = sum(ys) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = pearson(xs, ys);
  return { intercept, slope, r2: r === null ? 0 : r * r };
}

export interface WeightedValue {
  value: number;
  weight: number;
}

/** 가중 백분위수 (값 오름차순, 누적 가중치 기준) */
export function weightedQuantile(items: WeightedValue[], q: number): number | null {
  const sorted = items.filter((d) => d.weight > 0).sort((a, b) => a.value - b.value);
  const total = sum(sorted.map((d) => d.weight));
  if (!total) return null;
  const target = q * total;
  let acc = 0;
  for (const d of sorted) {
    acc += d.weight;
    if (acc >= target) return d.value;
  }
  return sorted[sorted.length - 1].value;
}

export interface HistBin {
  lo: number;
  hi: number;
  /** 구간 중심 (로그 공간이면 log10 값) */
  mid: number;
  count: number;
}

/**
 * log10 공간 등폭 히스토그램. 값별 건수(가중치)를 그대로 구간에 더합니다.
 * edges는 log10 값 배열.
 */
export function logHistogram(items: WeightedValue[], edges: number[]): HistBin[] {
  const bins: HistBin[] = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], mid: (lo + edges[i + 1]) / 2, count: 0 }));
  for (const d of items) {
    if (d.value <= 0) continue;
    const lv = Math.log10(d.value);
    const idx = bins.findIndex((b, i) => lv >= b.lo && (lv < b.hi || (i === bins.length - 1 && lv <= b.hi)));
    if (idx >= 0) bins[idx].count += d.weight;
  }
  return bins;
}

/**
 * 가중 가우시안 KDE (log10 공간). 결과는 히스토그램과 같은 축척(건수/구간폭)으로 맞춥니다.
 * bandwidth는 log10 단위.
 */
export function weightedKde(items: WeightedValue[], grid: number[], bandwidth: number, binWidth: number): number[] {
  const pts = items.filter((d) => d.value > 0 && d.weight > 0).map((d) => ({ x: Math.log10(d.value), w: d.weight }));
  const total = sum(pts.map((p) => p.w));
  if (!total || bandwidth <= 0) return grid.map(() => 0);
  const norm = 1 / (Math.sqrt(2 * Math.PI) * bandwidth);
  return grid.map((g) => {
    let dens = 0;
    for (const p of pts) {
      const z = (g - p.x) / bandwidth;
      dens += p.w * norm * Math.exp(-0.5 * z * z);
    }
    // density(=1/total 기준) × total × binWidth → 구간 건수 축척
    return dens * binWidth;
  });
}
