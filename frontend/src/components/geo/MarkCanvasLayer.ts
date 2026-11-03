import L, { type LeafletMouseEvent, type Map as LeafletMap } from 'leaflet';
import type { ChargerRegionRow, LocationRow } from '../../api/types';
import { C } from '../../charts/theme';
import { fmtCompact } from '../../lib/format';
import {
  CLUSTER_CELL_PX,
  CLUSTER_OFF_ZOOM,
  COLOCATED_DEG,
  clusterRadius,
  gridCluster,
  isColocated,
  regionRadius,
  stationRadius,
  type Cluster,
} from './cluster';

/**
 * 시도 집계 원·충전소 클러스터·개별 충전소를 캔버스 한 장에 그리는 Leaflet 레이어.
 * 마커마다 DOM 요소를 만들지 않으므로 충전소가 수천 곳이어도 DOM 크기는 일정합니다.
 * 누르기·호버는 그린 도형 목록으로 좌표 판정합니다(캔버스 자체는 pointer-events: none).
 */

export interface RegionPoint {
  row: ChargerRegionRow;
  lat: number;
  lng: number;
}

export interface MarkLayerState {
  mode: 'regions' | 'stations';
  regions: RegionPoint[];
  stations: LocationRow[];
  selectedRegion: string | null;
  selectedStation: LocationRow | null;
}

export type Mark =
  | { kind: 'region'; key: string; x: number; y: number; r: number; row: ChargerRegionRow; lat: number; lng: number }
  | {
      kind: 'cluster';
      key: string;
      x: number;
      y: number;
      r: number;
      cluster: Cluster<LocationRow>;
      chargers: number;
      /** 같은 위치에 겹친 충전소 묶음(개별 충전소 줌이거나 모두 약 2m 이내): 확대 대신 목록으로 */
      stack: boolean;
    }
  | { kind: 'station'; key: string; x: number; y: number; r: number; row: LocationRow };

export interface MarkLayerHandlers {
  onMarkClick: (mark: Mark) => void;
  onHover: (mark: Mark | null, x: number, y: number) => void;
}

/** 화면 밖으로 이만큼(비율) 더 그려 두어 끌어서 이동할 때 가장자리가 비지 않게 합니다. */
const PAD = 0.25;
const FONT = '"Archivo Variable", Archivo, "IBM Plex Sans KR", system-ui, sans-serif';

const COLORS = {
  cluster: C.s1,
  clusterHalo: 'rgba(164, 155, 200, 0.2)',
  label: '#141924',
  active: C.s1,
  deletedOnly: C.s2,
  select: C.compare,
  selectHalo: 'rgba(129, 173, 168, 0.28)',
  edge: '#10141c',
  hover: '#e7eaf0',
};

export class MarkCanvasLayer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawnBounds: L.LatLngBounds | null = null;
  private marks: Mark[] = [];
  private hoverKey: string | null = null;
  private frame = 0;
  private clusterCache: { zoom: number; stations: LocationRow[]; clusters: Cluster<LocationRow>[] } | null = null;
  private state: MarkLayerState = { mode: 'regions', regions: [], stations: [], selectedRegion: null, selectedStation: null };
  private handlers: MarkLayerHandlers;

  constructor(handlers: MarkLayerHandlers) {
    super();
    this.handlers = handlers;
  }

  setHandlers(handlers: MarkLayerHandlers) {
    this.handlers = handlers;
  }

  setState(next: MarkLayerState) {
    this.state = next;
    this.scheduleDraw();
  }

  onAdd(map: LeafletMap) {
    const canvas = L.DomUtil.create('canvas', 'cg-mark-canvas leaflet-layer');
    const animated = !!(map.options.zoomAnimation && L.Browser.any3d);
    L.DomUtil.addClass(canvas, animated ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide');
    canvas.setAttribute('aria-hidden', 'true');
    // 브라우저 회귀 검사용 읽기 전용 접근자(화면에는 영향 없음): 현재 그려진 도형 목록
    Object.defineProperty(canvas, 'cgMarks', { get: () => this.marks });
    map.getPanes().overlayPane.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reset();
    if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => this.scheduleDraw());
    return this;
  }

  onRemove() {
    cancelAnimationFrame(this.frame);
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    if (this._map) this._map.getContainer().style.cursor = '';
    return this;
  }

  getEvents() {
    return {
      viewreset: this.reset,
      moveend: this.reset,
      resize: this.reset,
      zoomanim: this.animateZoom,
      click: this.handleClick,
      mousemove: this.handleMove,
      mouseout: this.handleOut,
    } as unknown as { [name: string]: L.LeafletEventHandlerFn };
  }

  private animateZoom(e: L.ZoomAnimEvent) {
    if (!this._map || !this.canvas || !this.drawnBounds) return;
    const map = this._map as LeafletMap & {
      _latLngBoundsToNewLayerBounds: (b: L.LatLngBounds, zoom: number, center: L.LatLng) => L.Bounds;
    };
    const scale = map.getZoomScale(e.zoom);
    const offset = map._latLngBoundsToNewLayerBounds(this.drawnBounds, e.zoom, e.center).min;
    if (offset) L.DomUtil.setTransform(this.canvas, offset, scale);
  }

  private reset() {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;
    const size = map.getSize();
    const pad = size.multiplyBy(PAD).round();
    const full = size.add(pad.multiplyBy(2));
    const topLeft = map.containerPointToLayerPoint(pad.multiplyBy(-1));
    L.DomUtil.setPosition(canvas, topLeft);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(full.x * dpr);
    canvas.height = Math.round(full.y * dpr);
    canvas.style.width = `${full.x}px`;
    canvas.style.height = `${full.y}px`;
    this.drawnBounds = L.latLngBounds(
      map.containerPointToLatLng(pad.multiplyBy(-1)),
      map.containerPointToLatLng(size.add(pad)),
    );
    this.draw();
  }

  private scheduleDraw() {
    if (!this._map || !this.canvas) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  }

  private clustersFor(zoom: number) {
    const map = this._map;
    const { stations } = this.state;
    const c = this.clusterCache;
    if (c && c.zoom === zoom && c.stations === stations) return c.clusters;
    const clusters = gridCluster(
      stations,
      (s) => map.project([s.latitude, s.longitude], zoom),
      (s) => [s.latitude, s.longitude],
      // 개별 충전소 줌에서는 약 2m 이내(같은 대표 좌표)만 묶습니다.
      zoom >= CLUSTER_OFF_ZOOM ? Math.max(0.5, map.project([0, COLOCATED_DEG], zoom).x - map.project([0, 0], zoom).x) : CLUSTER_CELL_PX,
    );
    this.clusterCache = { zoom, stations, clusters };
    return clusters;
  }

  private buildMarks(): Mark[] {
    const map = this._map;
    const size = map.getSize();
    const pad = size.multiplyBy(PAD);
    const toPx = (lat: number, lng: number) => map.latLngToContainerPoint([lat, lng]);
    const inside = (x: number, y: number, r: number) =>
      x + r >= -pad.x && y + r >= -pad.y && x - r <= size.x + pad.x && y - r <= size.y + pad.y;
    const marks: Mark[] = [];
    const s = this.state;

    if (s.mode === 'regions') {
      const max = Math.max(1, ...s.regions.map((p) => p.row.station_count));
      // 좁은 지도(모바일)에서는 원을 줄여 수도권·충청권 겹침을 줄입니다.
      const scale = Math.min(1, Math.max(0.62, size.x / 640));
      for (const p of s.regions) {
        const pt = toPx(p.lat, p.lng);
        const r = regionRadius(p.row.station_count, max) * scale;
        marks.push({ kind: 'region', key: `r:${p.row.region_code}`, x: pt.x, y: pt.y, r, row: p.row, lat: p.lat, lng: p.lng });
      }
      // 큰 원을 먼저 그려 작은 원이 위에 보이게 합니다.
      return marks.sort((a, b) => b.r - a.r);
    }

    const zoom = map.getZoom();
    for (const c of this.clustersFor(zoom)) {
      const pt = toPx(c.lat, c.lng);
      if (c.members.length === 1) {
        const row = c.members[0];
        const r = stationRadius(row.charger_count);
        if (inside(pt.x, pt.y, r)) marks.push({ kind: 'station', key: `s:${row.station_id}`, x: pt.x, y: pt.y, r, row });
      } else {
        const r = clusterRadius(c.members.length);
        if (!inside(pt.x, pt.y, r)) continue;
        const chargers = c.members.reduce((n, m) => n + m.charger_count, 0);
        const stack = zoom >= CLUSTER_OFF_ZOOM || isColocated(c);
        marks.push({ kind: 'cluster', key: `c:${c.members[0].station_id}:${c.members.length}`, x: pt.x, y: pt.y, r, cluster: c, chargers, stack });
      }
    }
    return marks;
  }

  private draw() {
    const map = this._map;
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!map || !ctx || !canvas) return;
    const size = map.getSize();
    const pad = size.multiplyBy(PAD).round();
    const dpr = canvas.width / Math.max(1, size.x + pad.x * 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, pad.x * dpr, pad.y * dpr);

    this.marks = this.buildMarks();
    canvas.dataset.markCount = String(this.marks.length);
    const s = this.state;
    const selId = s.selectedStation?.station_id ?? null;

    for (const m of this.marks) {
      const hover = m.key === this.hoverKey;
      if (m.kind === 'region') this.drawCount(ctx, m.x, m.y, m.r, m.row.station_count, s.selectedRegion === m.row.region_code, hover);
      else if (m.kind === 'cluster') this.drawCount(ctx, m.x, m.y, m.r, m.cluster.members.length, false, hover);
      else if (m.row.station_id !== selId) this.drawStation(ctx, m.x, m.y, m.r, m.row, false, hover);
    }

    // 선택한 충전소는 불러온 데이터에 없거나 클러스터 안에 있어도 항상 맨 위에 그립니다.
    if (s.selectedStation && s.mode === 'stations') {
      const row = s.selectedStation;
      const pt = map.latLngToContainerPoint([row.latitude, row.longitude]);
      const r = stationRadius(row.charger_count);
      this.drawStation(ctx, pt.x, pt.y, r, row, true, this.hoverKey === `s:${row.station_id}`);
      if (!this.marks.some((m) => m.kind === 'station' && m.row.station_id === row.station_id)) {
        this.marks.push({ kind: 'station', key: `s:${row.station_id}`, x: pt.x, y: pt.y, r, row });
      }
    }
  }

  private drawCount(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, count: number, selected: boolean, hover: boolean) {
    const label = fmtCompact(count);
    const fs = r0 >= 26 ? 13 : r0 >= 12 ? 12 : 10.5;
    ctx.font = `600 ${fs}px ${FONT}`;
    const r = Math.max(r0, ctx.measureText(label).width / 2 + 4);
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? COLORS.selectHalo : COLORS.clusterHalo;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = selected ? COLORS.select : COLORS.cluster;
    ctx.globalAlpha = hover || selected ? 1 : 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = hover ? 2 : 1.25;
    ctx.strokeStyle = hover ? COLORS.hover : COLORS.edge;
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
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
    ctx.fillStyle = row.not_deleted_charger_count > 0 ? COLORS.active : COLORS.deletedOnly;
    ctx.fill();
    ctx.lineWidth = hover || selected ? 2 : 1.2;
    ctx.strokeStyle = hover || selected ? COLORS.hover : COLORS.edge;
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

  private handleClick(e: LeafletMouseEvent) {
    const m = this.hit(e.containerPoint.x, e.containerPoint.y);
    if (m) this.handlers.onMarkClick(m);
  }

  private handleMove(e: LeafletMouseEvent) {
    const m = this.hit(e.containerPoint.x, e.containerPoint.y);
    const key = m?.key ?? null;
    if (this._map) this._map.getContainer().style.cursor = m ? 'pointer' : '';
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.scheduleDraw();
    }
    this.handlers.onHover(m, e.containerPoint.x, e.containerPoint.y);
  }

  private handleOut() {
    if (this._map) this._map.getContainer().style.cursor = '';
    if (this.hoverKey !== null) {
      this.hoverKey = null;
      this.scheduleDraw();
    }
    this.handlers.onHover(null, 0, 0);
  }
}
