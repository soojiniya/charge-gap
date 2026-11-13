import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../lib/motion';
import { useChargerRegions, useMapGrid, useMapLocations } from '../api/hooks';
import { api } from '../api/endpoints';
import type { BBox, ChargerFilterParams, LocationRow } from '../api/types';
import { fmtInt } from '../lib/format';
import { ErrorState } from './ui/QueryState';
import { MAP_COLORS, MarkCanvasLayer, type Mark, type MarkLayerState, type RegionPoint } from './geo/MarkCanvasLayer';
import { CLUSTER_OFF_ZOOM, REGION_SIZE_LEGEND } from './geo/cluster';
import { loadKakaoMaps, KakaoLoadError } from './geo/kakaoLoader';
import { coverBBox } from './geo/bbox';
import { CoordinateNote } from './geo/CoordinateNote';
import { MAX_LEVEL, MIN_LEVEL, levelOfZoom, zoomOfLevel, type KakaoMaps, type KMap } from './geo/kakao';

/**
 * 배경 지도: 카카오맵 JavaScript SDK (앱 키 = VITE_KAKAO_MAP_KEY, 코드에 키를 적지 않음).
 * 시도 원·충전소 묶음·개별 충전소는 기존과 같이 캔버스 한 장(MarkCanvasLayer)에 그리고, 데이터는 같은 필터로
 *  - 줌 11 미만: /api/charger-regions (시도 집계)
 *  - 줌 11~15: /api/locations/grid (화면 영역 전체 충전소를 서버에서 격자 칸으로 집계 → 64px 기준으로 다시 묶음)
 *  - 줌 16 이상: /api/locations (개별 충전소, 1,000곳 단위 페이지)
 * 를 씁니다. 이전에는 줌 11~15에서도 /api/locations를 충전소 ID 순으로 최대 3,000곳만 받아 묶어,
 * 밀집 지역에서 묶음이 일부 운영기관(ID 접두사) 쪽으로 치우쳤습니다.
 * "어둡게"는 CSS 필터로 지도 색만 반전·감쇠하고(지도 원본은 변경하지 않음), "원본"은 그대로 보여 줍니다.
 * 카카오 로고·저작권 표시는 SDK가 그리는 그대로 둡니다.
 */

/** 이 줌 이상에서 시도 집계 대신 충전소 묶음·개별 충전소를 그립니다. 카카오 레벨 9에 해당 */
export const STATION_ZOOM = 11;
/** 개별 충전소 줌(16 이상)에서 지도 이동 한 번에 자동으로 이어 받는 최대 페이지 수 (1,000곳 × 3). 이후는 버튼으로 이어 받기. */
const AUTO_PAGES = 3;
/** 지역을 고르거나 URL에 지역 필터가 있을 때 지도를 그 지역 대표 지점에 맞추는 줌 (지역 원을 누를 때와 같음) */
export const REGION_FOCUS_ZOOM = 9;
/** 목록에서 고른 충전소로 이동할 때의 줌 (개별 충전소가 보이는 줌) */
const FOCUS_ZOOM = CLUSTER_OFF_ZOOM;

/**
 * 시도 집계 원을 놓을 화면 표시용 대표 지점. 통계값이 아니며, 원 크기와 숫자만
 * /api/charger-regions의 실제 충전소 수를 사용합니다. 전국 화면에서 원이 겹치지 않도록
 * 수도권(서울·인천·경기)과 충청권(세종·대전·충남·충북)은 각 시도 관할 안에서 서로 떨어진 지점을 씁니다.
 */
const REGION_ANCHORS: Record<string, [number, number]> = {
  '11': [37.5665, 126.978],
  '12': [34.95, 126.85],
  '26': [35.1796, 129.0756],
  '27': [35.8714, 128.6014],
  '28': [37.45, 126.35],
  '30': [36.3, 127.42],
  '31': [35.5384, 129.3114],
  '36': [36.66, 127.25],
  '41': [37.15, 127.55],
  '43': [36.62, 127.85],
  '44': [36.5, 126.62],
  '47': [36.4, 128.75],
  '48': [35.3, 128.25],
  '50': [33.38, 126.55],
  '51': [37.75, 128.35],
  '52': [35.72, 127.15],
};

export interface MapView {
  bbox: BBox;
  /** 기존 웹 지도와 같은 기준의 줌 (= 20 − 카카오 레벨) */
  zoom: number;
}

type Basemap = 'dark' | 'light';


/** 처음 보기(전국 보기)의 확대 수준: 줌 8 = 카카오 레벨 12. 대한민국 본토가 지도 대부분을 차지하는 크기입니다. */
export const INITIAL_ZOOM = 8;
/** 동서 가운데 맞춤에 쓰는 본토 동서 끝(경도): 태안반도 126.1°E · 호미곶 129.6°E */
const MAINLAND_WEST = 126.1;
const MAINLAND_EAST = 129.6;
/** 본토 동서 폭 양옆에 남길 최소 여백(px). 이보다 좁은 지도(모바일)는 한 단계씩 축소해 동서가 잘리지 않게 합니다. */
const SIDE_MARGIN = 24;
/** 상단 안내 줄의 상자와 겹치는 위치의 시도 원은 중심이 상자 아래 이만큼(px) 떨어지게 내립니다. 시도 원 최대 반지름(31px) + 1px */
const BAR_CLEARANCE = 32;
/**
 * 남북 가운데 맞춤 기준: 제주를 뺀 15개 시도 원 위치(REGION_ANCHORS).
 * 실제 카카오 SDK 측정(높이 680px, 레벨 12)으로 본토 남북 전체는 약 920px이 필요해 다 들어가지 않으므로,
 * 지리 범위 대신 시도 원들이 위아래로 고르게 보이도록 이 원들의 남북 범위를 지도 높이 가운데에 둡니다.
 * 제주는 줌 8에서 아래로 벗어나며, 축소하거나 지도를 끌면 보입니다.
 */
const BALANCE_ANCHORS = Object.entries(REGION_ANCHORS)
  .filter(([code]) => code !== '50')
  .map(([, ll]) => ll);

/**
 * 처음 보기·'전국 보기'·새로고침 공통 화면.
 * 고정 중심 좌표를 쓰지 않고, 현재 지도 크기와 카카오 투영(현재 레벨의 화면 좌표)으로 중심을 계산합니다.
 *  1) 레벨 = 줌 8(레벨 12). 지도가 본토 동서 폭보다 좁거나, 시도 원 남북 범위(+원 반지름)보다 낮으면
 *     (태블릿·모바일: 높이 540·460px) 들어갈 때까지 한 단계씩 축소. PC 지도(680px 높이, 폭 약 690px 이상)는 줌 8
 *  2) 동서: 본토 동서 끝의 가운데 → 지도 가로 가운데
 *  3) 남북: 제주 외 시도 원 범위의 가운데 → 지도 세로 가운데. 단, 상단 안내 줄 아래에 놓인 원이 가려지면 그만큼 내림
 */
export function showKorea(maps: KakaoMaps, map: KMap, container: HTMLElement) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const lats = BALANCE_ANCHORS.map(([lat]) => lat);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const sw = new maps.LatLng(south, MAINLAND_WEST);
  const ne = new maps.LatLng(north, MAINLAND_EAST);
  map.setCenter(new maps.LatLng((south + north) / 2, (MAINLAND_WEST + MAINLAND_EAST) / 2));
  let level = levelOfZoom(INITIAL_ZOOM);
  map.setLevel(level);
  while (width > 0 && height > 0 && level < MAX_LEVEL) {
    const pr = map.getProjection();
    const p1 = pr.pointFromCoords(sw);
    const p2 = pr.pointFromCoords(ne);
    const fitsWidth = Math.abs(p2.x - p1.x) + SIDE_MARGIN * 2 <= width;
    const fitsHeight = Math.abs(p2.y - p1.y) + BAR_CLEARANCE * 2 <= height;
    if (fitsWidth && fitsHeight) break;
    level += 1;
    map.setLevel(level);
  }
  if (width <= 0 || height <= 0) return;
  let pr = map.getProjection();
  const a = pr.containerPointFromCoords(sw);
  const b = pr.containerPointFromCoords(ne);
  let c = pr.containerPointFromCoords(map.getCenter());
  map.setCenter(pr.coordsFromContainerPoint(new maps.Point(c.x + (a.x + b.x) / 2 - width / 2, c.y + (a.y + b.y) / 2 - height / 2)));

  // 상단 안내 줄의 상자(왼쪽 상태 표시, 오른쪽 배경 선택)와 가로로 겹치는 시도 원이 상자에 가리면 지도를 그만큼 아래로
  const bar = container.parentElement?.querySelector<HTMLElement>('.geo-topbar');
  if (!bar) return;
  const box = container.getBoundingClientRect();
  const obstacles = Array.from(bar.children).map((child) => child.getBoundingClientRect());
  pr = map.getProjection();
  let shift = 0;
  let lowest = -Infinity;
  for (const [lat, lng] of BALANCE_ANCHORS) {
    const p = pr.containerPointFromCoords(new maps.LatLng(lat, lng));
    lowest = Math.max(lowest, p.y);
    for (const o of obstacles) {
      const left = o.left - box.left - BAR_CLEARANCE;
      const right = o.right - box.left + BAR_CLEARANCE;
      const need = o.bottom - box.top + BAR_CLEARANCE;
      if (p.x >= left && p.x <= right && p.y < need) shift = Math.max(shift, need - p.y);
    }
  }
  // 아래쪽 원이 지도 밖으로 밀려나지 않는 만큼만 내림. 둘 다 만족할 수 없으면(좁은 지도) 위아래 부족분을 반씩 나눔
  const room = Math.max(0, height - BAR_CLEARANCE - lowest);
  if (shift > room) shift = (shift + room) / 2;
  if (shift > 0) {
    c = pr.containerPointFromCoords(map.getCenter());
    map.setCenter(pr.coordsFromContainerPoint(new maps.Point(c.x, c.y - shift)));
  }
}

/** URL 지역 필터로 처음 열 때(또는 사용자가 지도를 움직이기 전 지역을 바꿀 때) 그 지역 대표 지점을 가운데에 둔 보기 */
export function showRegion(maps: KakaoMaps, map: KMap, code: string) {
  const a = REGION_ANCHORS[code];
  if (!a) return false;
  map.setLevel(levelOfZoom(REGION_FOCUS_ZOOM));
  map.setCenter(new maps.LatLng(a[0], a[1]));
  return true;
}

/** 캔버스에 그리는 데이터 한 벌 (필터 키가 같을 때만 다음 줌·영역의 응답 전까지 유지) */
interface ShownLayer {
  key: string;
  mode: MarkLayerState['mode'];
  cells: MarkLayerState['cells'];
  stations: MarkLayerState['stations'];
}

interface Props {
  filters: ChargerFilterParams;
  /** 지도 보기(줌·bbox)가 바뀔 때 알림 (선택) */
  onView?: (v: MapView) => void;
  onRegionSelect: (code: string) => void;
  /** 지역 필터 해제 (다른 시도로 이동했는데 지역 필터 때문에 충전소가 없을 때 상태 줄에 버튼으로 제공) */
  onClearRegion?: () => void;
  /** 선택한 충전소 (페이지가 관리, 목록·패널과 공유) */
  selected?: LocationRow | null;
  onSelect?: (row: LocationRow | null) => void;
  /** 같은 대표 좌표에 겹친 충전소 묶음을 누르면 그 목록을 전달 (더 확대해도 나뉘지 않으므로) */
  onSelectGroup?: (rows: LocationRow[]) => void;
  /** 값이 바뀔 때마다 선택한 충전소 위치로 이동 (목록의 "지도" 버튼) */
  focusRequest?: number;
}

interface Hover {
  mark: Mark;
  x: number;
  y: number;
  /** 지도 크기 (가장자리에서 말풍선을 반대쪽으로 뒤집기용) */
  w: number;
  h: number;
}

type SdkState = { status: 'loading' } | { status: 'ready'; maps: KakaoMaps } | { status: 'error'; error: Error };

export function StationMap({ filters, onView, onRegionSelect, onClearRegion, selected = null, onSelect, onSelectGroup, focusRequest = 0 }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const [sdk, setSdk] = useState<SdkState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [map, setMap] = useState<KMap | null>(null);
  const layerRef = useRef<MarkCanvasLayer | null>(null);
  /** 사용자가 지도를 움직이기 전(또는 '전국 보기' 직후)에는 크기가 바뀔 때 전국 보기를 다시 맞춤.
   *  카카오 지도는 컨테이너 크기가 바뀌면 relayout() 뒤에도 이전 기준점을 유지해 화면이 한쪽으로 치우칠 수 있음 */
  const autoFitRef = useRef(true);
  /** 자동 맞춤의 기준 보기: 지역 코드(URL 지역 필터)면 그 지역, null이면 전국 보기 */
  const homeRegionRef = useRef<string | null>(filters.region_code ?? null);
  const fitHome = useCallback((maps: KakaoMaps, m: KMap, el: HTMLElement) => {
    const code = homeRegionRef.current;
    if (!(code && showRegion(maps, m, code))) showKorea(maps, m, el);
  }, []);
  const [view, setView] = useState<MapView | null>(null);
  const stationMode = (view?.zoom ?? 0) >= STATION_ZOOM;
  /** 줌 11~15: 서버 격자 집계 묶음 · 줌 16 이상: 개별 충전소 */
  const gridMode = stationMode && (view?.zoom ?? 0) < CLUSTER_OFF_ZOOM;
  const [basemap, setBasemap] = useState<Basemap>('light');
  const [legendOpen, setLegendOpen] = useState(true);
  const [hover, setHover] = useState<Hover | null>(null);
  /** 지도 위 정보창을 띄운 충전소 ID (선택과 같은 충전소일 때만 표시) */
  const [infoId, setInfoId] = useState<string | null>(null);
  /** 지도 이동마다 정보창 위치를 다시 계산하기 위한 값 */
  const [moveTick, setMoveTick] = useState(0);
  const reduced = usePrefersReducedMotion();
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  // 1) SDK 불러오기 (실패하면 안내 + 다시 시도)
  useEffect(() => {
    let alive = true;
    setSdk({ status: 'loading' });
    loadKakaoMaps().then(
      (maps) => alive && setSdk({ status: 'ready', maps }),
      (error: Error) => alive && setSdk({ status: 'error', error }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  // 2) 지도 만들기 + 보기 변경 감시
  useEffect(() => {
    if (sdk.status !== 'ready' || !mapEl.current) return undefined;
    const { maps } = sdk;
    const el = mapEl.current;
    let created: KMap;
    try {
      created = new maps.Map(el, { center: new maps.LatLng(36.2, 127.8), level: 13 });
    } catch (e) {
      setSdk({ status: 'error', error: new KakaoLoadError('init', `카카오 지도를 만들지 못했습니다: ${(e as Error).message}`) });
      return undefined;
    }
    created.setMinLevel(MIN_LEVEL);
    created.setMaxLevel(MAX_LEVEL);
    fitHome(maps, created, el);
    let timer = 0;
    const emit = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const b = created.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const v: MapView = {
          // 실제 화면을 빠짐없이 감싸도록 바깥쪽으로 맞춤 (geo/bbox.ts)
          bbox: coverBBox(sw.getLng(), sw.getLat(), ne.getLng(), ne.getLat()),
          zoom: zoomOfLevel(created.getLevel()),
        };
        setView(v);
        onViewRef.current?.(v);
        setHover(null);
      }, 200);
    };
    let raf = 0;
    const moved = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setMoveTick((t) => t + 1));
    };
    maps.event.addListener(created, 'idle', emit);
    maps.event.addListener(created, 'bounds_changed', moved);
    // 컨테이너 크기가 바뀌면(반응형) 지도 크기를 다시 맞춤
    const relayout = () => {
      const center = created.getCenter();
      created.relayout();
      if (autoFitRef.current) fitHome(maps, created, el);
      else created.setCenter(center);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(relayout) : null;
    ro?.observe(el);
    // 끌기·휠·터치로 지도를 직접 움직이면 자동 맞춤을 멈춤
    const userMoved = () => {
      autoFitRef.current = false;
    };
    el.addEventListener('pointerdown', userMoved);
    el.addEventListener('wheel', userMoved, { passive: true });
    setMap(created);
    emit();
    if (el.clientWidth < 640) setLegendOpen(false);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      maps.event.removeListener(created, 'idle', emit);
      maps.event.removeListener(created, 'bounds_changed', moved);
      ro?.disconnect();
      el.removeEventListener('pointerdown', userMoved);
      el.removeEventListener('wheel', userMoved);
      layerRef.current?.destroy();
      layerRef.current = null;
      setMap(null);
      el.innerHTML = '';
    };
  }, [sdk]);

  // 시도 원은 지역 필터와 무관하게 16개를 모두 그리고, 선택한 지역은 강조합니다(유형·삭제·운영기관 필터는 적용).
  // 지역 필터를 그대로 넘기면 선택한 1개 시도만 응답되어 제주 등 다른 시도 원이 사라졌습니다.
  const regionFilters = useMemo<ChargerFilterParams>(() => ({ ...filters, region_code: undefined }), [filters]);
  const regions = useChargerRegions(regionFilters);
  const regionName = filters.region_code ? regions.data?.data.find((r) => r.region_code === filters.region_code)?.region_name ?? filters.region_code : null;
  const grid = useMapGrid(filters, view?.bbox ?? null, view?.zoom ?? 0, gridMode);
  const locs = useMapLocations(filters, view?.bbox ?? null, stationMode && !gridMode);

  const pages = locs.data?.pages ?? [];
  const stations = useMemo(() => pages.flatMap((p) => p.data), [pages]);
  const cells = useMemo(() => grid.data?.data ?? [], [grid.data]);
  const last = pages[pages.length - 1];
  const totalInView = gridMode ? grid.data?.meta.matched.station_count ?? 0 : last?.meta.pagination.total_items ?? 0;
  const matched = gridMode ? grid.data?.meta.matched : last?.meta.matched;
  /** 상태 줄·오류·재시도에 쓰는 현재 줌의 지도 데이터 요청 */
  const active = gridMode
    ? { isLoading: grid.isLoading, isFetching: grid.isFetching, isError: grid.isError, error: grid.error, refetch: () => grid.refetch() }
    : { isLoading: locs.isLoading, isFetching: locs.isFetching, isError: locs.isError, error: locs.error, refetch: () => locs.refetch() };

  // 개별 충전소 줌: 자동으로 AUTO_PAGES까지 이어 받기
  useEffect(() => {
    if (stationMode && !gridMode && locs.hasNextPage && !locs.isFetchingNextPage && !locs.isError && pages.length < AUTO_PAGES) {
      locs.fetchNextPage();
    }
  }, [stationMode, gridMode, locs.hasNextPage, locs.isFetchingNextPage, locs.isError, pages.length, locs]);

  const regionPoints = useMemo<RegionPoint[]>(
    () =>
      (regions.data?.data ?? []).flatMap((row) => {
        const a = REGION_ANCHORS[row.region_code];
        return a ? [{ row, lat: a[0], lng: a[1] }] : [];
      }),
    [regions.data],
  );

  // 지도에 그릴 데이터 (M-7). 지도 데이터 요청은 화면 영역(bbox)·줌이 키라서, 지도를 옮기거나 확대·축소하면
  // 새 응답이 오기 전까지 데이터가 비어 묶음이 사라졌다가 다시 나타났습니다(시도↔묶음↔개별 단계 전환도 같음).
  // 현재 줌의 데이터가 준비되면 그 결과를 그리고, 준비 전에는 직전에 그린 결과를 그대로 둡니다.
  // 같은 필터의 결과만 유지합니다: 필터가 바뀌었거나 현재 요청이 실패하면 지난 결과를 현재 결과처럼 보여 주지 않습니다.
  // 지난 요청의 응답은 그 키의 캐시에만 들어가므로 최신 화면을 덮어쓰지 않습니다.
  const filtersKey = useMemo(
    () => JSON.stringify(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '').sort(([a], [b]) => (a < b ? -1 : 1))),
    [filters],
  );
  const fresh = useMemo<ShownLayer | null>(() => {
    if (!stationMode) return regions.data ? { key: filtersKey, mode: 'regions', cells: [], stations: [] } : null;
    if (gridMode) return grid.data ? { key: filtersKey, mode: 'clusters', cells, stations: [] } : null;
    return pages.length ? { key: filtersKey, mode: 'stations', cells: [], stations } : null;
  }, [stationMode, gridMode, regions.data, grid.data, cells, pages.length, stations, filtersKey]);
  const shownRef = useRef<ShownLayer | null>(null);
  if (fresh) shownRef.current = fresh;
  const failed = stationMode ? active.isError : regions.isError;
  const held = !fresh && !failed && shownRef.current?.key === filtersKey ? shownRef.current : null;
  const shown = fresh ?? held;

  const layerState = useMemo<MarkLayerState>(
    () => ({
      mode: shown?.mode ?? (!stationMode ? 'regions' : gridMode ? 'clusters' : 'stations'),
      regions: regionPoints,
      cells: shown?.cells ?? [],
      stations: shown?.stations ?? [],
      selectedRegion: filters.region_code ?? null,
      selectedStation: selected,
    }),
    [shown, stationMode, gridMode, regionPoints, filters.region_code, selected],
  );

  // 선택이 풀리거나 다른 충전소로 바뀌면 정보창도 정리
  useEffect(() => {
    if (!selected || selected.station_id !== infoId) setInfoId(null);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveTo = useCallback(
    (lat: number, lng: number, level: number) => {
      if (!map || sdk.status !== 'ready') return;
      autoFitRef.current = false;
      const target = new sdk.maps.LatLng(lat, lng);
      if (map.getLevel() !== level) {
        // 실제 카카오 SDK에서는 확대 애니메이션 중에 panTo를 부르면 이동이 취소되어 중심이 그대로 남습니다
        // (실측: 레벨 12→11 애니메이션 + panTo(제주) 후에도 중심 36.4°N 유지). 중심을 먼저 옮긴 뒤 확대합니다.
        // 또 큰 단계 확대(예: 줌 7→16, 목록의 "지도에서 보기")는 애니메이션 기준점이 중심이 아니어서 대상이
        // 가운데에서 벗어났습니다(실측 +131, −188px). 기준점(anchor)을 대상 좌표로 지정해 확대 중에도 가운데에 고정합니다.
        map.setCenter(target);
        map.setLevel(level, reduced ? { anchor: target } : { animate: { duration: 300 }, anchor: target });
      } else if (reduced) map.setCenter(target);
      else {
        // panTo 애니메이션 동안 실제 SDK는 이동 이벤트를 끝에서 한 번만 보내므로, 캔버스가 타일과 함께 움직이도록 추적을 켭니다.
        layerRef.current?.beginPanAnimation();
        map.panTo(target);
      }
    },
    [map, sdk, reduced],
  );

  const zoomTo = useCallback(
    (level: number) => {
      if (!map) return;
      autoFitRef.current = false;
      const next = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
      if (next !== map.getLevel()) map.setLevel(next, reduced ? undefined : { animate: { duration: 250 } });
    },
    [map, reduced],
  );

  // 같은 위치 묶음(격자 집계)의 충전소 목록 요청. 다른 표시를 누르거나 목록에서 이동하거나 필터가 바뀌면
  // 취소해, 늦게 도착한 응답이 그 사이 고른 선택을 덮어쓰지 않게 합니다.
  const groupReqRef = useRef<AbortController | null>(null);
  const cancelGroupLookup = useCallback(() => {
    groupReqRef.current?.abort();
    groupReqRef.current = null;
  }, []);
  useEffect(() => cancelGroupLookup, [filtersKey, cancelGroupLookup]);

  // 목록에서 "지도"를 누르면 선택한 충전소로 이동하고 정보창을 엽니다.
  useEffect(() => {
    if (!focusRequest || !map || !selected) return;
    cancelGroupLookup();
    moveTo(selected.latitude, selected.longitude, Math.min(map.getLevel(), levelOfZoom(FOCUS_ZOOM)));
    setInfoId(selected.station_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, map]);

  const onMarkClick = useCallback(
    (m: Mark) => {
      if (!map || sdk.status !== 'ready') return;
      const { maps } = sdk;
      cancelGroupLookup();
      if (m.kind === 'region') {
        onRegionSelect(m.row.region_code);
        moveTo(m.lat, m.lng, Math.min(map.getLevel(), levelOfZoom(9)));
      } else if (m.kind === 'cluster') {
        const c = m;
        if (m.stack) {
          // 모두 같은 좌표: 확대해도 나뉘지 않으므로 목록을 패널에 보여 줍니다.
          if (m.members) onSelectGroup?.(m.members);
          else if (onSelectGroup) {
            // 격자 집계 묶음에는 충전소 행이 없으므로, 그 좌표 범위의 충전소를 같은 필터로 받아 목록으로 보여 줍니다.
            const pad = 0.0001;
            const req = new AbortController();
            groupReqRef.current = req;
            api
              .locations({ ...filters, page: 1, limit: 1000, bbox: [c.west - pad, c.south - pad, c.east + pad, c.north + pad] }, req.signal)
              .then((res) => {
                if (req.signal.aborted || groupReqRef.current !== req) return;
                groupReqRef.current = null;
                // 격자 응답의 범위는 소수 7자리로 반올림되어 있어(오차 ≤ 5e-8°) 약 0.1m 여유로 비교합니다.
                // 이전 1e-9 여유에서는 좌표 자릿수가 긴 충전소가 범위 밖으로 판정되어 목록이 비는 경우가 있었습니다.
                const eps = 1e-6;
                const rows = res.data.filter((r) => r.latitude >= c.south - eps && r.latitude <= c.north + eps && r.longitude >= c.west - eps && r.longitude <= c.east + eps);
                if (rows.length) onSelectGroup(rows);
              })
              .catch(() => {
                /* 목록을 받지 못해도 아래 확대(개별 충전소 줌)로 같은 묶음을 다시 누를 수 있음 */
              });
          }
          if (zoomOfLevel(map.getLevel()) < CLUSTER_OFF_ZOOM) moveTo(c.lat, c.lng, levelOfZoom(CLUSTER_OFF_ZOOM));
        } else {
          const before = map.getLevel();
          map.setBounds(new maps.LatLngBounds(new maps.LatLng(c.south, c.west), new maps.LatLng(c.north, c.east)), 48, 48, 48, 48);
          // 기존과 같이: 적어도 두 단계(또는 개별 충전소 줌까지) 확대하되, 개별 충전소 줌보다 더 들어가지는 않음
          const minLevel = levelOfZoom(Math.max(CLUSTER_OFF_ZOOM, STATION_ZOOM));
          const target = Math.min(before - 1, Math.max(map.getLevel(), minLevel));
          if (map.getLevel() !== target) map.setLevel(target);
        }
      } else {
        onSelect?.(m.row);
        setInfoId(m.row.station_id);
      }
    },
    [map, sdk, filters, onRegionSelect, onSelect, onSelectGroup, moveTo, cancelGroupLookup],
  );
  const onHover = useCallback(
    (m: Mark | null, x: number, y: number) => {
      const el = mapEl.current;
      setHover(m && el ? { mark: m, x, y, w: el.clientWidth, h: el.clientHeight } : null);
    },
    [],
  );

  // 2-1) 상단 막대(상태·배경 선택)는 지도가 준비된 뒤 그려지고, 상태 문구에 따라 폭이 바뀌므로
  //      사용자가 지도를 움직이기 전까지는 그 크기를 반영해 전국 보기를 다시 맞춤(처음 보기 = '전국 보기' 버튼 결과)
  useEffect(() => {
    if (sdk.status !== 'ready' || !map || !mapEl.current) return undefined;
    const { maps } = sdk;
    const el = mapEl.current;
    if (autoFitRef.current) fitHome(maps, map, el);
    const bar = el.parentElement?.querySelector<HTMLElement>('.geo-topbar');
    if (!bar || typeof ResizeObserver === 'undefined') return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (autoFitRef.current) fitHome(maps, map, el);
      });
    });
    Array.from(bar.children).forEach((child) => ro.observe(child));
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // 2-2) 지역 필터가 바뀌면(필터 막대·표·공유 URL) 자동 맞춤의 기준 보기도 바꿈.
  //      사용자가 지도를 직접 움직이거나 확대·축소한 뒤에는(autoFitRef = false) 지도를 옮기지 않습니다.
  useEffect(() => {
    homeRegionRef.current = filters.region_code ?? null;
    if (sdk.status !== 'ready' || !map || !mapEl.current || !autoFitRef.current) return;
    fitHome(sdk.maps, map, mapEl.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.region_code]);

  // 3) 캔버스 레이어 (지도가 준비된 뒤 한 번 만들고, 상태·핸들러만 갱신)
  useEffect(() => {
    if (!map || sdk.status !== 'ready' || !mapEl.current) return undefined;
    const layer = new MarkCanvasLayer(sdk.maps, map, mapEl.current, { onMarkClick, onHover });
    layerRef.current = layer;
    layer.setState(layerState);
    return () => {
      layer.destroy();
      if (layerRef.current === layer) layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useEffect(() => layerRef.current?.setHandlers({ onMarkClick, onHover }), [onMarkClick, onHover]);
  useEffect(() => layerRef.current?.setState(layerState), [layerState]);

  // 정보창 위치 (선택한 충전소가 화면 안에 있을 때만)
  const info = useMemo(() => {
    if (!map || sdk.status !== 'ready' || !selected || selected.station_id !== infoId || !stationMode || !mapEl.current) return null;
    const p = map.getProjection().containerPointFromCoords(new sdk.maps.LatLng(selected.latitude, selected.longitude));
    const w = mapEl.current.clientWidth;
    const h = mapEl.current.clientHeight;
    if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return null;
    return { row: selected, x: p.x, y: p.y, w, h };
  }, [map, sdk, selected, infoId, stationMode, moveTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadedRatio = totalInView ? Math.min(1, stations.length / totalInView) : 0;
  const zoomLabel = view ? String(view.zoom) : '—';
  const level = map?.getLevel() ?? 0;
  const ready = sdk.status === 'ready' && !!map;

  return (
    <div
      className="geo-map map-wrap"
      data-map-mode={stationMode ? 'stations' : 'regions'}
      data-basemap={basemap}
      data-map-sdk={sdk.status}
    >
      <div ref={mapEl} className="geo-kakao" role="region" aria-label="충전소 지도 (카카오맵)" />
      {/* '어둡게' 선택 시에만: 지도 그림에는 필터를 걸지 않고, 위에 반투명 막을 얹어 밝기만 낮춤(색 구분은 유지) */}
      {basemap === 'dark' && sdk.status === 'ready' && <div className="geo-dim" aria-hidden="true" />}

      {sdk.status === 'loading' && (
        <div className="geo-map-state" role="status">
          지도 불러오는 중…
        </div>
      )}
      {sdk.status === 'error' && (
        <div className="geo-map-state is-error" role="alert">
          <div className="geo-map-state-title">카카오맵을 불러오지 못했습니다</div>
          <p>{sdk.error.message}</p>
          <p className="muted small">오른쪽 분석 패널과 아래 표·그래프는 지도와 관계없이 그대로 볼 수 있습니다.</p>
          {!(sdk.error instanceof KakaoLoadError && sdk.error.reason === 'missing-key') && (
            <button type="button" className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              다시 시도
            </button>
          )}
        </div>
      )}

      {ready && (
        <>
      {/* 위쪽: 상태 줄(왼쪽) + 배경 지도 선택(오른쪽) */}
      <div className="geo-topbar">
        <div className="geo-status" aria-live="polite">
          {!stationMode ? (
            regions.isError ? (
              <ErrorState error={regions.error} onRetry={() => regions.refetch()} height={72} />
            ) : (
              <>
                <span className="geo-status-mode">시도 집계</span>
                <span className="geo-status-text">
                  {regions.isLoading ? (
                    '집계 불러오는 중…'
                  ) : (
                    <>
                      숫자 = 충전소 수 · 줌 {STATION_ZOOM}부터 개별 충전소
                      {regions.isFetching && ' (갱신 중)'}
                    </>
                  )}
                </span>
                <button type="button" className="btn btn-sm btn-primary" disabled={!map} onClick={() => zoomTo(levelOfZoom(STATION_ZOOM))}>
                  이 위치 충전소 보기
                </button>
              </>
            )
          ) : active.isError ? (
            <ErrorState error={active.error} onRetry={active.refetch} height={72} />
          ) : (
            <>
              <span className="geo-status-mode">{gridMode ? '충전소 묶음' : '개별 충전소'}</span>
              <span className="geo-status-text">
                {active.isLoading ? (
                  gridMode ? '화면 영역 충전소 집계 중…' : '화면 영역 충전소 불러오는 중…'
                ) : totalInView === 0 ? (
                  regionName ? (
                    <>
                      지역 필터 <b>{regionName}</b> 적용 중 · 이 화면에는 {regionName} 충전소가 없습니다.
                    </>
                  ) : (
                    '이 영역에 조건과 일치하는 충전소가 없습니다.'
                  )
                ) : gridMode ? (
                  <>
                    화면 영역 <b className="num">{fmtInt(totalInView)}</b>곳 전체 집계
                    {matched && <span className="muted"> · 일치 충전기 {fmtInt(matched.charger_count)}기</span>}
                  </>
                ) : (
                  <>
                    화면 영역 <b className="num">{fmtInt(stations.length)}</b> / <b className="num">{fmtInt(totalInView)}</b>곳 불러옴
                    {matched && <span className="muted"> · 일치 충전기 {fmtInt(matched.charger_count)}기</span>}
                  </>
                )}
              </span>
              {regionName && onClearRegion && !active.isLoading && totalInView === 0 && (
                <button type="button" className="btn btn-sm" onClick={onClearRegion}>
                  지역 필터 해제
                </button>
              )}
              {active.isFetching && !active.isLoading && <span className="muted small">불러오는 중…</span>}
              {!gridMode && locs.hasNextPage && !locs.isFetchingNextPage && pages.length >= AUTO_PAGES && (
                <button type="button" className="btn btn-sm" onClick={() => locs.fetchNextPage()}>
                  다음 1,000곳 불러오기
                </button>
              )}
              {totalInView > 0 && (
                <span className="map-progress geo-progress" aria-hidden="true">
                  <i style={{ width: `${(gridMode ? 1 : loadedRatio) * 100}%` }} />
                </span>
              )}
            </>
          )}
        </div>
        <div className="segmented geo-basemap" role="group" aria-label="배경 지도">
          {(
            [
              ['light', '원본'],
              ['dark', '어둡게'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={basemap === key} onClick={() => setBasemap(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

          {/* 아래 왼쪽: 범례 */}
      <div className={`geo-legend${legendOpen ? '' : ' is-collapsed'}`}>
        <button type="button" className="geo-legend-toggle" aria-expanded={legendOpen} onClick={() => setLegendOpen((o) => !o)}>
          범례 <span className="muted num">줌 {zoomLabel}</span>
        </button>
        {legendOpen && (
          <ul className="geo-legend-list">
            {!stationMode ? (
              <>
                <li>
                  <span className="geo-key geo-key-count">12</span>
                  {REGION_SIZE_LEGEND}
                </li>
                <li>
                  <span className="geo-key geo-key-count is-selected">3</span>
                  선택한 지역
                </li>
                <li className="muted">원 위치는 표시용 대표 지점입니다.</li>
              </>
            ) : (
              <>
                <li>
                  <span className="geo-key geo-key-count">8</span>
                  {gridMode ? '충전소 묶음 (화면 영역 전체 충전소 수)' : '같은 위치의 충전소 묶음'}
                </li>
                <li>
                  <span className="geo-key geo-key-dot" style={{ background: MAP_COLORS.active, borderColor: MAP_COLORS.edge }} />
                  비삭제 충전기 있음
                </li>
                <li>
                  <span className="geo-key geo-key-dot" style={{ background: MAP_COLORS.deletedOnly, borderColor: MAP_COLORS.deletedEdge, borderWidth: 2 }} />
                  모두 삭제 표시
                </li>
                <li>
                  <span className="geo-key geo-key-ring" />
                  선택한 충전소
                </li>
                <li className="muted">점 크기 = 필터 일치 충전기 수 · 위치 = 대표 좌표</li>
              </>
            )}
          </ul>
        )}
      </div>


          {/* 아래 오른쪽: 확대·축소·전국 보기 */}
          <div className="geo-zoom" role="group" aria-label="지도 확대·축소">
            <button type="button" className="geo-zoom-in" title="확대" aria-label="확대" disabled={level <= MIN_LEVEL} onClick={() => zoomTo(level - 1)}>
              +
            </button>
            <button type="button" className="geo-zoom-out" title="축소" aria-label="축소" disabled={level >= MAX_LEVEL} onClick={() => zoomTo(level + 1)}>
              −
            </button>
            <button
              type="button"
              className="geo-zoom-home"
              title="전국 보기"
              aria-label="전국 보기"
              onClick={() => {
                if (sdk.status !== 'ready' || !map || !mapEl.current) return;
                autoFitRef.current = true;
                homeRegionRef.current = null;
                showKorea(sdk.maps, map, mapEl.current);
              }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M2 8.5h2m8 0h2M8 2.5v2m0 8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          {hover && !(info && hover.mark.kind === 'station' && hover.mark.row.station_id === info.row.station_id) && <MapTooltip hover={hover} />}
          {info && <StationInfo info={info} onClose={() => setInfoId(null)} />}
        </>
      )}
    </div>
  );
}

/** 정보창이 지도 가장자리에서 떨어질 최소 여백(px) */
const INFO_MARGIN = 8;

function StationInfo({ info, onClose }: { info: { row: LocationRow; x: number; y: number; w: number; h: number }; onClose: () => void }) {
  const { row, x, y, w, h } = info;
  const flipX = x > w - 300;
  const above = y > 260;
  // 기존 배치(충전소 옆·위/아래)를 그대로 쓰되, 좁은 지도(모바일)에서 지도 밖으로 나가면 실제 크기를 재서
  // 지도 안쪽으로 밀어 넣습니다. 화면에 그리기 전에 계산하므로 잘린 상태가 보이지 않습니다.
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    const left = flipX ? x - bw + 24 : x - 24;
    const top = above ? y - bh - 18 : y + 18;
    const clamp = (v: number, size: number, max: number) => Math.min(Math.max(v, INFO_MARGIN), Math.max(INFO_MARGIN, max - size - INFO_MARGIN));
    setPos({ left: Math.round(clamp(left, bw, w)), top: Math.round(clamp(top, bh, h)) });
  }, [x, y, w, h, flipX, above, row]);
  return (
    <div
      ref={ref}
      className="geo-infowin"
      role="dialog"
      aria-label={`${row.station_name} 정보`}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : {
              left: Math.round(x),
              top: Math.round(y),
              transform: `translate(${flipX ? 'calc(-100% + 24px)' : '-24px'}, ${above ? 'calc(-100% - 18px)' : '18px'})`,
            }
      }
    >
      <div className="geo-infowin-head">
        <div className="geo-infowin-name">{row.station_name}</div>
        <button type="button" className="geo-infowin-close" aria-label="정보창 닫기" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="geo-infowin-addr">{row.address || '주소 정보 없음'}</div>
      <CoordinateNote flag={row.coordinate_flag} />
      <dl className="geo-infowin-stats">
        <div>
          <dt>필터 일치 충전기</dt>
          <dd className="num">{fmtInt(row.charger_count)}기</dd>
        </div>
        <div>
          <dt>비삭제 · 삭제 표시</dt>
          <dd className="num">
            {fmtInt(row.not_deleted_charger_count)} · {fmtInt(row.deleted_charger_count)}
          </dd>
        </div>
      </dl>
      <div className="geo-infowin-foot muted">
        {row.region_name} · ID {row.station_id} · 상세는 오른쪽 패널
      </div>
    </div>
  );
}

function MapTooltip({ hover }: { hover: Hover }) {
  const { mark, x, y, w, h } = hover;
  let body;
  if (mark.kind === 'region') {
    const r = mark.row;
    body = (
      <>
        <div className="pop-title">{r.region_code === '12' ? `${r.region_name} (광주+전남 통합)` : r.region_name}</div>
        <div className="pop-row">
          충전소 <b>{fmtInt(r.station_count)}곳</b>
        </div>
        <div className="pop-row">
          충전기 <b>{fmtInt(r.charger_count)}기</b>
        </div>
        <div className="muted">누르면 이 지역으로 필터합니다.</div>
      </>
    );
  } else if (mark.kind === 'cluster') {
    body = (
      <>
        <div className="pop-title">
          충전소 {fmtInt(mark.count)}곳{mark.stack && ' (같은 위치)'}
        </div>
        <div className="pop-row">
          필터 일치 충전기 <b>{fmtInt(mark.chargers)}기</b>
        </div>
        <div className="muted">{mark.stack ? '누르면 오른쪽 패널에 목록을 표시합니다.' : '누르면 확대합니다.'}</div>
      </>
    );
  } else {
    const s = mark.row;
    body = (
      <>
        <div className="pop-title">{s.station_name}</div>
        <div className="pop-row">
          필터 일치 충전기 <b>{fmtInt(s.charger_count)}기</b>
        </div>
        <div className="muted">누르면 오른쪽 패널에 상세를 표시합니다.</div>
      </>
    );
  }
  return (
    <div
      className="geo-tooltip"
      role="tooltip"
      style={{
        left: Math.round(x),
        top: Math.round(y),
        transform: `translate(${x > w - 260 ? 'calc(-100% - 14px)' : '14px'}, ${y > h - 150 ? 'calc(-100% - 14px)' : '14px'})`,
      }}
    >
      {body}
    </div>
  );
}
