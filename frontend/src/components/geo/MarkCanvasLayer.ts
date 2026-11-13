import type { ChargerRegionRow, GridCell, LocationRow } from '../../api/types';
import { zoomOfLevel, type KakaoMaps, type KMap, type KMouseEvent, type KPoint } from './kakao';
import { fmtCompact } from '../../lib/format';
import {
  CLUSTER_CELL_PX,
  CLUSTER_OFF_ZOOM,
  COLOCATED_DEG,
  clusterRadius,
  gridCluster,
  isColocated,
  weightedGridCluster,
  regionRadius,
  stationRadius,
  type Cluster,
} from './cluster';

/**
 * 시도 집계 원·충전소 클러스터·개별 충전소를 캔버스 한 장에 그리는 카카오맵 위 레이어.
 * 마커마다 DOM 요소를 만들지 않으므로 충전소가 수천 곳이어도 DOM 크기는 일정합니다.
 * 캔버스는 지도 위에 겹쳐 두고(pointer-events: none) 지도 이동·확대마다 카카오 좌표 변환으로 다시 그립니다.
 * 누르기·호버는 카카오 지도 마우스 이벤트 좌표로 그린 도형 목록을 판정합니다.
 */

export interface RegionPoint {
  row: ChargerRegionRow;
  lat: number;
  lng: number;
}

export interface MarkLayerState {
  /** regions: 시도 집계(줌 11 미만) · clusters: 서버 격자 집계 묶음(줌 11~15) · stations: 개별 충전소(줌 16 이상) */
  mode: 'regions' | 'clusters' | 'stations';
  regions: RegionPoint[];
  /** clusters 모드: /api/locations/grid 칸 (화면 영역 전체 충전소) */
  cells: GridCell[];
  /** stations 모드: /api/locations 충전소 행 */
  stations: LocationRow[];
  selectedRegion: string | null;
  selectedStation: LocationRow | null;
}

export type Mark =
  | {
      kind: 'region';
      key: string;
      x: number;
      y: number;
      r: number;
      row: ChargerRegionRow;
      lat: number;
      lng: number;
      /** 실제 위치가 화면 밖이라 지도 가장자리에 붙여 그린 원(예: 줌 8 전국 보기의 제주). 누르면 그 지역으로 이동 */
      offscreen?: boolean;
    }
  | {
      kind: 'cluster';
      key: string;
      x: number;
      y: number;
      r: number;
      /** 묶인 충전소 수 */
      count: number;
      /** 필터 일치 충전기 수 합 */
      chargers: number;
      /** 충전소 대표 좌표의 평균·범위 (누르면 이 범위로 확대) */
      lat: number;
      lng: number;
      south: number;
      west: number;
      north: number;
      east: number;
      /** 같은 위치에 겹친 충전소 묶음(개별 충전소 줌이거나 모두 약 2m 이내): 확대 대신 목록으로 */
      stack: boolean;
      /** 묶인 충전소 행. 개별 충전소 줌(/api/locations)에서만 있고, 격자 집계 묶음은 null */
      members: LocationRow[] | null;
    }
  | { kind: 'station'; key: string; x: number; y: number; r: number; row: LocationRow };

export interface MarkLayerHandlers {
  onMarkClick: (mark: Mark) => void;
  onHover: (mark: Mark | null, x: number, y: number) => void;
}

/** 화면 밖 이 여백(px) 안의 도형까지 포함합니다(가장자리에 걸친 원이 잘려 보이지 않게). */
const EDGE = 48;
/** 화면 밖 시도 원을 가장자리에 붙일 때 원과 지도 테두리 사이 간격(px) */
const PIN_GAP = 6;
/** 묶음 계산의 '같은 위치' 판정 거리를 화면 px로 환산할 때 쓰는 기준점(대한민국 중부) */
const REF_LAT = 36;
const REF_LNG = 127;
const FONT = '"Archivo Variable", Archivo, "IBM Plex Sans KR", system-ui, sans-serif';

/**
 * 지도 표식 색(민트 계열, CHARGE GAP 포인트 색 #c7d8cf와 같은 색상 계열을 지도 위에서 보이도록 진하게 조정).
 * 카카오 원본 지도(밝은 육지·하늘색 바다) 위에서 원 테두리를 짙은 녹색으로 둘러 경계를 분명히 하고,
 * 숫자는 짙은 녹색 글씨(채움 대비 9.1:1), 선택한 지역은 짙은 민트 채움 + 흰 글씨(6.1:1)로 표시합니다.
 * 범례(StationMap)도 같은 값을 씁니다.
 */
export const MAP_COLORS = {
  cluster: '#7fd1b4',
  clusterHalo: 'rgba(47, 164, 127, 0.28)',
  label: '#08241c',
  edge: '#0f3d30',
  select: '#1f6f58',
  selectLabel: '#ffffff',
  selectHalo: 'rgba(31, 111, 88, 0.3)',
  active: '#2fa47f',
  deletedOnly: '#ffffff',
  deletedEdge: '#2fa47f',
  hover: '#08241c',
  hoverRing: '#ffffff',
};
const COLORS = MAP_COLORS;

/** 지도 위에 떠 있는 컨트롤(범례·확대 버튼·상단 상태 줄): 시도 원이 이 아래에 숨지 않게 피합니다. */
const OBSTACLE_SELECTOR = '.geo-legend, .geo-zoom, .geo-topbar > *';
/** 애니메이션이 idle 없이 끝나지 않을 때의 안전 종료(ms) */
const TRACK_TIMEOUT = 1500;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 카카오 지도 애니메이션(애니메이션 확대·panTo) 동안 캔버스를 지도 타일과 같이 움직이기 위한 상태.
 * 실제 SDK는 애니메이션 중에 bounds_changed·zoom_changed를 보내지 않고 끝에서 한 번만 보내며,
 * 애니메이션 확대 중에는 getLevel·투영이 이미 최종값이라 다시 그려서는 맞출 수 없습니다.
 * 그래서 시작 순간 화면 타일 몇 장의 위치·크기를 기록하고, 매 프레임 그 변화(배율 g, 이동 tx·ty)를
 * 캔버스 CSS transform으로 똑같이 입힌 뒤, idle에서 transform을 지우고 최종 상태로 다시 그립니다.
 */
interface Tracking {
  refs: { el: Element; x: number; y: number; w: number }[];
  /** 추적 시작 전에 이미 입혀져 있던 변환(애니메이션이 이어질 때) */
  base: [number, number, number];
  cur: [number, number, number];
  raf: number;
  timer: number;
  /** 카카오가 타일 스타일을 바꾸는 즉시(그리기 전) 따라가기 위한 감시자 */
  observer: MutationObserver | null;
}

export class MarkCanvasLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private marks: Mark[] = [];
  private hoverKey: string | null = null;
  private frame = 0;
  private clusterCache: { level: number; stations: LocationRow[]; clusters: Cluster<LocationRow>[] } | null = null;
  private cellCache: { level: number; cells: GridCell[]; clusters: Cluster<GridCell>[] } | null = null;
  private state: MarkLayerState = { mode: 'regions', regions: [], cells: [], stations: [], selectedRegion: null, selectedStation: null };
  private handlers: MarkLayerHandlers;
  private track: Tracking | null = null;
  private readonly observed = new WeakSet<Element>();
  private readonly listeners: [string, (...args: never[]) => void][];
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onLeave = () => this.handleOut();

  constructor(
    private readonly maps: KakaoMaps,
    private readonly map: KMap,
    /** 지도 컨테이너(카카오 지도가 그려지는 요소). 캔버스는 이 요소의 부모에 겹쳐 붙습니다. */
    private readonly container: HTMLElement,
    handlers: MarkLayerHandlers,
  ) {
    this.handlers = handlers;
    const canvas = document.createElement('canvas');
    canvas.className = 'cg-mark-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    // 브라우저 회귀 검사용 읽기 전용 접근자(화면에는 영향 없음): 현재 그려진 도형 목록
    Object.defineProperty(canvas, 'cgMarks', { get: () => this.marks });
    container.insertAdjacentElement('afterend', canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const redraw = () => this.scheduleDraw();
    this.listeners = [
      ['bounds_changed', redraw],
      ['zoom_changed', redraw],
      ['zoom_start', () => this.beginTracking()],
      ['idle', () => (this.track ? this.endTracking() : this.scheduleDraw())],
      ['click', ((e: KMouseEvent) => this.handleClick(e)) as (...args: never[]) => void],
      ['mousemove', ((e: KMouseEvent) => this.handleMove(e)) as (...args: never[]) => void],
    ];
    for (const [type, fn] of this.listeners) maps.event.addListener(map, type, fn);
    container.addEventListener('mouseleave', this.onLeave);
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(container);
    this.resize();
    if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => this.scheduleDraw());
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.stopTracking();
    for (const [type, fn] of this.listeners) this.maps.event.removeListener(this.map, type, fn);
    this.container.removeEventListener('mouseleave', this.onLeave);
    this.resizeObserver?.disconnect();
    this.container.classList.remove('is-pointer');
    this.canvas.remove();
  }

  setHandlers(handlers: MarkLayerHandlers) {
    this.handlers = handlers;
  }

  setState(next: MarkLayerState) {
    this.state = next;
    this.scheduleDraw();
  }

  private size() {
    return { x: this.container.clientWidth, y: this.container.clientHeight };
  }

  private resize() {
    const size = this.size();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(size.x * dpr);
    this.canvas.height = Math.round(size.y * dpr);
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    this.draw();
  }

  private scheduleDraw() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** 앱이 panTo로 애니메이션 이동을 시작하기 직전에 부릅니다(애니메이션 확대는 zoom_start로 자동 시작). */
  beginPanAnimation() {
    this.beginTracking();
  }

  private containerRect() {
    return this.container.getBoundingClientRect();
  }

  /** 지도 안에 보이는 타일 이미지(기준점) 위치·크기를 컨테이너 좌표로 기록 */
  private snapshotTiles() {
    const cr = this.containerRect();
    const refs: Tracking['refs'] = [];
    for (const el of Array.from(this.container.querySelectorAll('img'))) {
      const r = el.getBoundingClientRect();
      if (r.width < 64 || r.height < 64) continue;
      if (r.right <= cr.left || r.left >= cr.right || r.bottom <= cr.top || r.top >= cr.bottom) continue;
      refs.push({ el, x: r.left - cr.left, y: r.top - cr.top, w: r.width });
      if (refs.length >= 6) break;
    }
    return refs;
  }

  private beginTracking() {
    let base: Tracking['base'] = [1, 0, 0];
    if (this.track) {
      // 애니메이션이 끝나기 전에 다음 애니메이션이 시작됨: 지금까지의 변환 위에 이어서 추적
      base = this.track.cur;
      this.stopTracking(false);
    } else {
      // 시작 직전에 예약된 그리기(예: setCenter 직후)까지 지금 상태(시작 시점의 줌·투영)로 그려 둡니다.
      // zoom_start 시점에는 getLevel·투영이 아직 시작 상태입니다(실제 SDK 실측).
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.draw(true);
    }
    const t: Tracking = { refs: this.snapshotTiles(), base, cur: base, raf: 0, timer: 0, observer: null };
    this.track = t;
    t.timer = window.setTimeout(() => this.endTracking(), TRACK_TIMEOUT);
    // 카카오는 자기 requestAnimationFrame에서 타일 left/top/width를 바꿉니다. 우리 rAF가 먼저 돌면 한 프레임 늦으므로,
    // 타일 스타일이 바뀌는 즉시(같은 프레임, 화면에 그리기 전) 변환을 맞춥니다. rAF는 예비로 둡니다.
    if (t.refs.length && typeof MutationObserver !== 'undefined') {
      t.observer = new MutationObserver(() => {
        if (this.track === t) this.trackFrame(t);
      });
      t.observer.observe(this.container, { subtree: true, attributes: true, attributeFilter: ['style'], childList: true });
    }
    const step = () => {
      if (this.track !== t) return;
      this.trackFrame(t);
      t.raf = requestAnimationFrame(step);
    };
    t.raf = requestAnimationFrame(step);
  }

  private trackFrame(t: Tracking) {
    const cr = this.containerRect();
    for (const ref of t.refs) {
      if (!ref.el.isConnected) continue;
      const r = ref.el.getBoundingClientRect();
      if (r.width < 1) continue;
      const g = r.width / ref.w;
      const tx = r.left - cr.left - g * ref.x;
      const ty = r.top - cr.top - g * ref.y;
      // 추적 변환 ∘ 시작 전 변환
      const [g0, x0, y0] = t.base;
      t.cur = [g * g0, g * x0 + tx, g * y0 + ty];
      this.applyTransform(t.cur);
      return;
    }
    // 기준 타일을 찾지 못하면(SDK 대역 등) 현재 투영으로 매 프레임 다시 그립니다(이동 애니메이션은 투영이 중간값을 줌).
    this.applyTransform(null);
    this.draw(true);
  }

  private applyTransform(m: [number, number, number] | null) {
    const style = this.canvas.style;
    if (!m || (Math.abs(m[0] - 1) < 1e-4 && Math.abs(m[1]) < 0.05 && Math.abs(m[2]) < 0.05)) {
      if (style.transform) style.transform = '';
      return;
    }
    style.transformOrigin = '0 0';
    style.transform = `matrix(${m[0]}, 0, 0, ${m[0]}, ${m[1]}, ${m[2]})`;
  }

  private stopTracking(clear = true) {
    const t = this.track;
    if (!t) return;
    cancelAnimationFrame(t.raf);
    window.clearTimeout(t.timer);
    t.observer?.disconnect();
    this.track = null;
    if (clear) this.applyTransform(null);
  }

  /** 애니메이션 끝: 변환을 지우고 같은 프레임에 최종 상태로 다시 그립니다. */
  private endTracking() {
    if (!this.track) return;
    this.stopTracking();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.draw();
  }

  /** 시도 원이 피해야 할 지도 위 컨트롤의 영역(컨테이너 좌표) */
  private obstacles(): Rect[] {
    const host = this.container.parentElement;
    if (!host) return [];
    const cr = this.containerRect();
    const out: Rect[] = [];
    for (const el of Array.from(host.querySelectorAll(OBSTACLE_SELECTOR))) {
      if (el === this.canvas || this.container.contains(el)) continue;
      // 범례를 펼치고 접을 때도 다시 그리도록 크기 변화를 지켜봅니다.
      if (this.resizeObserver && !this.observed.has(el)) {
        this.observed.add(el);
        this.resizeObserver.observe(el);
      }
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push({ left: r.left - cr.left, top: r.top - cr.top, right: r.right - cr.left, bottom: r.bottom - cr.top });
    }
    return out;
  }

  private toContainer(lat: number, lng: number): KPoint {
    return this.map.getProjection().containerPointFromCoords(new this.maps.LatLng(lat, lng));
  }

  private clustersFor(level: number) {
    const { stations } = this.state;
    const c = this.clusterCache;
    if (c && c.level === level && c.stations === stations) return c.clusters;
    const proj = this.map.getProjection();
    const world = (lat: number, lng: number) => {
      const p = proj.pointFromCoords(new this.maps.LatLng(lat, lng));
      return { x: p.x, y: p.y };
    };
    const zoom = zoomOfLevel(level);
    // 개별 충전소 줌에서는 약 2m 이내(같은 대표 좌표)만 묶습니다.
    const coloPx = Math.max(0.5, Math.abs(world(REF_LAT, REF_LNG + COLOCATED_DEG).x - world(REF_LAT, REF_LNG).x));
    const clusters = gridCluster(
      stations,
      (s) => world(s.latitude, s.longitude),
      (s) => [s.latitude, s.longitude],
      zoom >= CLUSTER_OFF_ZOOM ? coloPx : CLUSTER_CELL_PX,
    );
    this.clusterCache = { level, stations, clusters };
    return clusters;
  }

  /** 서버 격자 칸(약 32px)을 기존과 같은 64px 화면 칸 기준으로 다시 묶습니다(충전소 수 가중). */
  private cellClustersFor(level: number) {
    const { cells } = this.state;
    const c = this.cellCache;
    if (c && c.level === level && c.cells === cells) return c.clusters;
    const proj = this.map.getProjection();
    const clusters = weightedGridCluster(
      cells,
      (g) => {
        const p = proj.pointFromCoords(new this.maps.LatLng(g.latitude, g.longitude));
        return { x: p.x, y: p.y };
      },
      (g) => ({ weight: g.station_count, lat: g.latitude, lng: g.longitude, south: g.south, west: g.west, north: g.north, east: g.east }),
      CLUSTER_CELL_PX,
    );
    this.cellCache = { level, cells, clusters };
    return clusters;
  }

  private buildMarks(): Mark[] {
    const size = this.size();
    const inside = (x: number, y: number, r: number) => x + r >= -EDGE && y + r >= -EDGE && x - r <= size.x + EDGE && y - r <= size.y + EDGE;
    const marks: Mark[] = [];
    const s = this.state;

    if (s.mode === 'regions') {
      const max = Math.max(1, ...s.regions.map((p) => p.row.station_count));
      // 좁은 지도(모바일)에서는 원을 줄여 수도권·충청권 겹침을 줄입니다.
      const scale = Math.min(1, Math.max(0.62, size.x / 640));
      const obstacles = this.obstacles();
      for (const p of s.regions) {
        const pt = this.toContainer(p.lat, p.lng);
        const r = regionRadius(p.row.station_count, max) * scale;
        // 화면 밖 시도 원은 가장 가까운 가장자리 안쪽에 붙여 그려, 전국 보기에서 빠져 보이지 않게 합니다.
        const pad = r + PIN_GAP;
        let x = Math.min(Math.max(pt.x, pad), size.x - pad);
        let y = Math.min(Math.max(pt.y, pad), size.y - pad);
        // 범례·확대 버튼·상단 줄 아래에 가려지면 가장 가까운 빈 자리로 옮겨 같은 '가장자리 고정' 모양으로 그립니다.
        const moved = avoidObstacles(x, y, r + PIN_GAP, obstacles, size);
        x = moved.x;
        y = moved.y;
        const offscreen = Math.abs(x - pt.x) > 0.5 || Math.abs(y - pt.y) > 0.5;
        marks.push({ kind: 'region', key: `r:${p.row.region_code}`, x, y, r, row: p.row, lat: p.lat, lng: p.lng, offscreen });
      }
      // 큰 원을 먼저 그려 작은 원이 위에 보이게 합니다.
      return marks.sort((a, b) => b.r - a.r);
    }

    const level = this.map.getLevel();
    const zoom = zoomOfLevel(level);
    const bounds = (c: Cluster<unknown>) => ({ lat: c.lat, lng: c.lng, south: c.south, west: c.west, north: c.north, east: c.east });

    if (s.mode === 'clusters') {
      for (const c of this.cellClustersFor(level)) {
        const pt = this.toContainer(c.lat, c.lng);
        const single = c.count === 1 ? c.members[0].station : null;
        if (single) {
          const r = stationRadius(single.charger_count);
          if (inside(pt.x, pt.y, r)) marks.push({ kind: 'station', key: `s:${single.station_id}`, x: pt.x, y: pt.y, r, row: single });
          continue;
        }
        const r = clusterRadius(c.count);
        if (!inside(pt.x, pt.y, r)) continue;
        const chargers = c.members.reduce((n, m) => n + m.charger_count, 0);
        const first = c.members[0].cell;
        marks.push({ kind: 'cluster', key: `g:${first[0]}:${first[1]}:${c.count}`, x: pt.x, y: pt.y, r, count: c.count, chargers, ...bounds(c),
          stack: isColocated(c), members: null });
      }
      return marks;
    }

    for (const c of this.clustersFor(level)) {
      const pt = this.toContainer(c.lat, c.lng);
      if (c.members.length === 1) {
        const row = c.members[0];
        const r = stationRadius(row.charger_count);
        if (inside(pt.x, pt.y, r)) marks.push({ kind: 'station', key: `s:${row.station_id}`, x: pt.x, y: pt.y, r, row });
      } else {
        const r = clusterRadius(c.members.length);
        if (!inside(pt.x, pt.y, r)) continue;
        const chargers = c.members.reduce((n, m) => n + m.charger_count, 0);
        const stack = zoom >= CLUSTER_OFF_ZOOM || isColocated(c);
        marks.push({ kind: 'cluster', key: `c:${c.members[0].station_id}:${c.members.length}`, x: pt.x, y: pt.y, r, count: c.members.length, chargers, ...bounds(c),
          stack, members: c.members });
      }
    }
    return marks;
  }

  private draw(duringTracking = false) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx) return;
    // 애니메이션 추적 중에는 캔버스를 다시 그리지 않고(변환과 어긋남) 끝날 때 한 번에 그립니다.
    if (this.track && !duringTracking) return;
    const size = this.size();
    const dpr = canvas.width / Math.max(1, size.x);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.marks = this.buildMarks();
    canvas.dataset.markCount = String(this.marks.length);
    const s = this.state;
    const selId = s.selectedStation?.station_id ?? null;

    for (const m of this.marks) {
      const hover = m.key === this.hoverKey;
      if (m.kind === 'region') this.drawCount(ctx, m.x, m.y, m.r, m.row.station_count, s.selectedRegion === m.row.region_code, hover, m.offscreen);
      else if (m.kind === 'cluster') this.drawCount(ctx, m.x, m.y, m.r, m.count, false, hover);
      else if (m.row.station_id !== selId) this.drawStation(ctx, m.x, m.y, m.r, m.row, false, hover);
    }

    // 선택한 충전소는 불러온 데이터에 없거나 클러스터 안에 있어도 항상 맨 위에 그립니다.
    if (s.selectedStation && s.mode !== 'regions') {
      const row = s.selectedStation;
      const pt = this.toContainer(row.latitude, row.longitude);
      const r = stationRadius(row.charger_count);
      this.drawStation(ctx, pt.x, pt.y, r, row, true, this.hoverKey === `s:${row.station_id}`);
      if (!this.marks.some((m) => m.kind === 'station' && m.row.station_id === row.station_id)) {
        this.marks.push({ kind: 'station', key: `s:${row.station_id}`, x: pt.x, y: pt.y, r, row });
      }
    }
  }

  private drawCount(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, count: number, selected: boolean, hover: boolean, offscreen = false) {
    const label = fmtCompact(count);
    const fs = r0 >= 26 ? 13 : r0 >= 12 ? 12 : 10.5;
    ctx.font = `700 ${fs}px ${FONT}`;
    const r = Math.max(r0, ctx.measureText(label).width / 2 + 4);
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? COLORS.selectHalo : COLORS.clusterHalo;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = selected ? COLORS.select : COLORS.cluster;
    ctx.fill();
    ctx.lineWidth = hover ? 2.5 : 1.5;
    ctx.strokeStyle = selected ? COLORS.hoverRing : hover ? COLORS.hover : COLORS.edge;
    // 가장자리에 붙인 원(실제 위치는 화면 밖)은 점선 테두리로 구분
    if (offscreen) ctx.setLineDash([3, 2.5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = selected ? COLORS.selectLabel : COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
  }

  private drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, row: LocationRow, selected: boolean, hover: boolean) {
    if (selected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.selectHalo;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = COLORS.select;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const deletedOnly = !(row.not_deleted_charger_count > 0); // 기존 판정과 같은 조건
    ctx.fillStyle = deletedOnly ? COLORS.deletedOnly : COLORS.active;
    ctx.fill();
    ctx.lineWidth = hover || selected ? 2.2 : deletedOnly ? 1.8 : 1.3;
    ctx.strokeStyle = hover || selected ? COLORS.hover : deletedOnly ? COLORS.deletedEdge : COLORS.edge;
    ctx.stroke();
  }

  /** 누른 지점을 품은 도형 중 중심이 가장 가까운 것을 고릅니다(겹친 원에서도 숫자를 누르면 그 원이 선택됨). */
  private hit(x: number, y: number): Mark | null {
    let best: Mark | null = null;
    let bestD = Infinity;
    for (const m of this.marks) {
      const d = Math.hypot(m.x - x, m.y - y);
      const reach = m.kind === 'station' ? Math.max(m.r + 3, 9) : m.r + 4;
      if (d <= reach && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  }

  private pointOf(e: KMouseEvent): KPoint {
    const p = e.point ?? this.map.getProjection().containerPointFromCoords(e.latLng);
    // 애니메이션 추적 중에는 캔버스가 변환되어 보이므로, 화면 좌표를 그려 둔 좌표로 되돌려 맞춥니다.
    const t = this.track;
    if (!t || !this.canvas.style.transform) return p;
    const [g, tx, ty] = t.cur;
    return { x: (p.x - tx) / g, y: (p.y - ty) / g } as KPoint;
  }

  private handleClick(e: KMouseEvent) {
    const p = this.pointOf(e);
    const m = this.hit(p.x, p.y);
    if (m) this.handlers.onMarkClick(m);
  }

  private handleMove(e: KMouseEvent) {
    const p = this.pointOf(e);
    const m = this.hit(p.x, p.y);
    const key = m?.key ?? null;
    this.container.classList.toggle('is-pointer', !!m);
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.scheduleDraw();
    }
    this.handlers.onHover(m, p.x, p.y);
  }

  private handleOut() {
    this.container.classList.remove('is-pointer');
    if (this.hoverKey !== null) {
      this.hoverKey = null;
      this.scheduleDraw();
    }
    this.handlers.onHover(null, 0, 0);
  }
}

/**
 * 원(중심 x·y, 여유 포함 반지름 pad)이 장애물 영역과 겹치면 가장 적게 움직여 겹치지 않는 위치를 찾습니다.
 * 후보는 각 장애물의 위·아래·왼쪽·오른쪽 바로 바깥이며, 지도 안에 있고 다른 장애물과도 겹치지 않아야 합니다.
 * 찾지 못하면 원래 위치를 그대로 둡니다.
 */
export function avoidObstacles(x: number, y: number, pad: number, obstacles: readonly Rect[], size: { x: number; y: number }) {
  const hits = (cx: number, cy: number) => obstacles.some((o) => cx + pad > o.left && cx - pad < o.right && cy + pad > o.top && cy - pad < o.bottom);
  if (!hits(x, y)) return { x, y };
  const inMap = (cx: number, cy: number) => cx >= pad && cy >= pad && cx <= size.x - pad && cy <= size.y - pad;
  let best: { x: number; y: number; d: number } | null = null;
  for (const o of obstacles) {
    for (const [cx, cy] of [
      [x, o.top - pad],
      [x, o.bottom + pad],
      [o.left - pad, y],
      [o.right + pad, y],
    ]) {
      if (!inMap(cx, cy) || hits(cx, cy)) continue;
      const d = Math.hypot(cx - x, cy - y);
      if (!best || d < best.d) best = { x: cx, y: cy, d };
    }
  }
  return best ? { x: best.x, y: best.y } : { x, y };
}
