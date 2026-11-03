/**
 * 지도 클러스터링 순수 함수 (Leaflet·DOM 의존 없음, tests/map-cluster.test.cjs에서 직접 검사).
 *
 * 화면 픽셀 좌표 격자로 점을 묶습니다. 같은 칸의 점을 먼저 모으고, 점이 많은 칸부터
 * 이웃 8칸 중 무게중심이 한 칸 거리 안에 있는 칸을 흡수해 칸 경계에서 갈라지는 묶음을 줄입니다.
 * 점 n개에 대해 O(n) + 칸 정렬 비용이라 수천~수만 점도 한 프레임 안에 처리됩니다.
 */

export interface Projected {
  x: number;
  y: number;
}

export interface Cluster<T> {
  /** 묶인 원본 항목 (한 개면 개별 충전소로 그립니다) */
  members: T[];
  /** 투영 좌표 무게중심 */
  x: number;
  y: number;
  /** 위경도 평균과 범위 (클러스터를 누르면 이 범위로 확대) */
  lat: number;
  lng: number;
  south: number;
  west: number;
  north: number;
  east: number;
}

interface Bucket<T> {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  items: T[];
  pts: Projected[];
  used: boolean;
}

export function gridCluster<T>(
  items: readonly T[],
  project: (item: T) => Projected,
  latLng: (item: T) => [number, number],
  cellPx: number,
): Cluster<T>[] {
  const cell = Math.max(1, cellPx);
  const buckets = new Map<string, Bucket<T>>();
  for (const item of items) {
    const p = project(item);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const key = `${cx}:${cy}`;
    let b = buckets.get(key);
    if (!b) {
      b = { cx, cy, sx: 0, sy: 0, items: [], pts: [], used: false };
      buckets.set(key, b);
    }
    b.sx += p.x;
    b.sy += p.y;
    b.items.push(item);
    b.pts.push(p);
  }

  const order = [...buckets.values()].sort((a, b) => b.items.length - a.items.length || a.cx - b.cx || a.cy - b.cy);
  const out: Cluster<T>[] = [];
  for (const b of order) {
    if (b.used) continue;
    b.used = true;
    const members = [...b.items];
    let sx = b.sx;
    let sy = b.sy;
    const mx = b.sx / b.items.length;
    const my = b.sy / b.items.length;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (!dx && !dy) continue;
        const n = buckets.get(`${b.cx + dx}:${b.cy + dy}`);
        if (!n || n.used) continue;
        const nx = n.sx / n.items.length;
        const ny = n.sy / n.items.length;
        if (Math.hypot(nx - mx, ny - my) < cell) {
          n.used = true;
          members.push(...n.items);
          sx += n.sx;
          sy += n.sy;
        }
      }
    }
    let lat = 0;
    let lng = 0;
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;
    for (const m of members) {
      const [a, o] = latLng(m);
      lat += a;
      lng += o;
      if (a < south) south = a;
      if (a > north) north = a;
      if (o < west) west = o;
      if (o > east) east = o;
    }
    out.push({
      members,
      x: sx / members.length,
      y: sy / members.length,
      lat: lat / members.length,
      lng: lng / members.length,
      south,
      west,
      north,
      east,
    });
  }
  return out;
}

/** 클러스터 반지름(px): 충전소 수의 로그에 비례, 12~30px */
export function clusterRadius(count: number) {
  return Math.min(30, 12 + 5.4 * Math.log10(Math.max(1, count)));
}

export const REGION_SIZE_LEGEND = '시도별 충전소 수 (최소 크기 보정)';

/** 시도 집계 원 반지름(px): 제곱근 비율에 최소 반지름 11px을 더함. 면적 비례는 아님. */
export function regionRadius(stationCount: number, maxStationCount: number) {
  return 11 + Math.sqrt(Math.max(0, stationCount) / Math.max(1, maxStationCount)) * 20;
}

/** 개별 충전소 점 반지름(px): 필터 일치 충전기 수, 4~9px */
export function stationRadius(chargerCount: number) {
  return Math.min(9, 4 + Math.sqrt(Math.max(0, chargerCount)) * 0.9);
}

/**
 * 묶음의 모든 점이 사실상 같은 위치(위경도 차이 0.00002° ≈ 2m 이내)인지.
 * 이런 묶음은 최대로 확대해도 나뉘지 않으므로 확대 대신 목록으로 보여 줍니다.
 */
export const COLOCATED_DEG = 0.00002;
export function isColocated(c: { north: number; south: number; east: number; west: number }) {
  return c.north - c.south <= COLOCATED_DEG && c.east - c.west <= COLOCATED_DEG;
}

/** 이 줌 이상에서는 같은 위치의 충전소만 묶고 나머지는 개별 충전소로 그립니다. */
export const CLUSTER_OFF_ZOOM = 16;
/** 클러스터 격자 크기(px) */
export const CLUSTER_CELL_PX = 64;
