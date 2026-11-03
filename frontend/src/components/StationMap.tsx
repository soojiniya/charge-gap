import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L, { type Map as LeafletMap } from 'leaflet';
import { usePrefersReducedMotion } from '../lib/motion';
import 'leaflet/dist/leaflet.css';
import { useChargerRegions, useMapLocations } from '../api/hooks';
import type { BBox, ChargerFilterParams, LocationRow } from '../api/types';
import { fmtInt } from '../lib/format';
import { C } from '../charts/theme';
import { ErrorState } from './ui/QueryState';
import { MarkCanvasLayer, type Mark, type MarkLayerState, type RegionPoint } from './geo/MarkCanvasLayer';
import { CLUSTER_OFF_ZOOM, REGION_SIZE_LEGEND } from './geo/cluster';

/**
 * 배경 지도: OpenStreetMap 표준 타일 (인증키 불필요).
 * OSM 타일 이용 정책에 따라 출처 표시를 유지하고, 대량 다운로드·사전 캐싱을 하지 않습니다.
 * "어둡게"는 CSS 필터로 색만 반전·감쇠하고(타일 원본은 변경하지 않음), "원본"은 필터 없이 그대로 보여 줍니다.
 * 다른 타일 서버를 쓰려면 .env의 VITE_TILE_URL을 지정합니다.
 */
const OSM_TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** 이 줌 이상에서만 /api/locations로 충전소 좌표를 요청합니다 (요청당 최대 1,000곳). */
export const STATION_ZOOM = 11;
/** 지도 이동 한 번에 자동으로 이어 받는 최대 페이지 수 (1,000곳 × 3). 이후는 버튼으로 이어 받기. */
const AUTO_PAGES = 3;
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
  zoom: number;
}

type Basemap = 'dark' | 'light' | 'off';

const roundBBox = (b: BBox): BBox => b.map((v) => Math.round(v * 1000) / 1000) as BBox;

function ViewWatcher({ onChange }: { onChange: (v: MapView) => void }) {
  const timer = useRef<number>();
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });
  const emit = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const b = map.getBounds();
      onChange({
        bbox: roundBBox([
          Math.max(-180, b.getWest()),
          Math.max(-90, b.getSouth()),
          Math.min(180, b.getEast()),
          Math.min(90, b.getNorth()),
        ]),
        zoom: map.getZoom(),
      });
    }, 300);
  };
  useEffect(() => {
    emit();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** 대한민국 본토·제주·울릉도를 포함하는 초기 범위 (위도, 경도) */
const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [33.1, 125.0],
  [38.65, 130.95],
];

/** 지도 위 안내 줄·범례에 가리지 않도록 위아래 여백을 두고 대한민국 범위에 맞춥니다. */
export function fitKorea(map: LeafletMap) {
  const bar = map.getContainer().parentElement?.querySelector<HTMLElement>('.geo-topbar');
  const top = (bar ? bar.offsetTop + bar.offsetHeight : 0) + 12;
  map.fitBounds(KOREA_BOUNDS, { paddingTopLeft: [16, top], paddingBottomRight: [16, 16], animate: false });
}

/** 지도 준비, 확대·축소 막대에 "전국 보기" 버튼 추가 */
function MapRef({ onReady }: { onReady: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    fitKorea(map);
    onReady(map);
    // 확대·축소 막대(ZoomControl, 앞 형제라 먼저 붙음)에 세 번째 버튼으로 붙입니다.
    const bar = map.getContainer().querySelector<HTMLElement>('.leaflet-control-zoom');
    if (!bar) return undefined;
    const home = L.DomUtil.create('a', 'leaflet-control-zoom-home', bar);
    home.href = '#';
    home.setAttribute('role', 'button');
    home.title = '전국 보기';
    home.setAttribute('aria-label', '전국 보기');
    home.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 8.5h2m8 0h2M8 2.5v2m0 8v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
    L.DomEvent.disableClickPropagation(home);
    L.DomEvent.on(home, 'click', (e) => {
      L.DomEvent.preventDefault(e);
      fitKorea(map);
    });
    return () => {
      home.remove();
    };
  }, [map, onReady]);
  return null;
}

/** 캔버스 클러스터 레이어를 지도에 붙이고 상태를 전달합니다. */
function MarkLayer({
  state,
  onMarkClick,
  onHover,
}: {
  state: MarkLayerState;
  onMarkClick: (m: Mark) => void;
  onHover: (m: Mark | null, x: number, y: number) => void;
}) {
  const map = useMap();
  const layer = useMemo(() => new MarkCanvasLayer({ onMarkClick, onHover }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [layer, map]);
  useEffect(() => layer.setHandlers({ onMarkClick, onHover }), [layer, onMarkClick, onHover]);
  useEffect(() => layer.setState(state), [layer, state]);
  return null;
}

interface Props {
  filters: ChargerFilterParams;
  onView: (v: MapView) => void;
  onRegionSelect: (code: string) => void;
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

export function StationMap({ filters, onView, onRegionSelect, selected = null, onSelect, onSelectGroup, focusRequest = 0 }: Props) {
  const [view, setView] = useState<MapView | null>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const stationMode = (view?.zoom ?? 0) >= STATION_ZOOM;
  const [basemap, setBasemap] = useState<Basemap>('dark');
  const [legendOpen, setLegendOpen] = useState(true);
  // 좁은 지도(모바일)에서는 범례를 접어 두고 시작합니다.
  useEffect(() => {
    if (map && map.getSize().x < 640) setLegendOpen(false);
  }, [map]);
  const [hover, setHover] = useState<Hover | null>(null);
  const reduced = usePrefersReducedMotion();

  const regions = useChargerRegions(filters);
  const locs = useMapLocations(filters, view?.bbox ?? null, stationMode);

  const pages = locs.data?.pages ?? [];
  const stations = useMemo(() => pages.flatMap((p) => p.data), [pages]);
  const last = pages[pages.length - 1];
  const totalInView = last?.meta.pagination.total_items ?? 0;
  const matched = last?.meta.matched;

  // 자동으로 AUTO_PAGES까지 이어 받기
  useEffect(() => {
    if (stationMode && locs.hasNextPage && !locs.isFetchingNextPage && !locs.isError && pages.length < AUTO_PAGES) {
      locs.fetchNextPage();
    }
  }, [stationMode, locs.hasNextPage, locs.isFetchingNextPage, locs.isError, pages.length, locs]);

  const regionPoints = useMemo<RegionPoint[]>(
    () =>
      (regions.data?.data ?? []).flatMap((row) => {
        const a = REGION_ANCHORS[row.region_code];
        return a ? [{ row, lat: a[0], lng: a[1] }] : [];
      }),
    [regions.data],
  );

  const layerState = useMemo(
    () => ({
      mode: stationMode ? ('stations' as const) : ('regions' as const),
      regions: regionPoints,
      stations: stationMode ? stations : [],
      selectedRegion: filters.region_code ?? null,
      selectedStation: selected,
    }),
    [stationMode, regionPoints, stations, filters.region_code, selected],
  );

  // 목록에서 "지도"를 누르면 선택한 충전소로 이동
  useEffect(() => {
    if (!focusRequest || !map || !selected) return;
    const target: [number, number] = [selected.latitude, selected.longitude];
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    if (reduced) map.setView(target, zoom, { animate: false });
    else map.flyTo(target, zoom, { duration: 0.7 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, map]);

  const handleView = (v: MapView) => {
    setView(v);
    onView(v);
    setHover(null);
  };

  const onMarkClick = useMemo(
    () => (m: Mark) => {
      if (!map) return;
      if (m.kind === 'region') {
        onRegionSelect(m.row.region_code);
        const zoom = Math.max(map.getZoom(), 9);
        if (reduced) map.setView([m.lat, m.lng], zoom, { animate: false });
        else map.flyTo([m.lat, m.lng], zoom, { duration: 0.6 });
      } else if (m.kind === 'cluster') {
        const c = m.cluster;
        const nextZoom = Math.min(18, Math.max(map.getZoom() + 2, STATION_ZOOM));
        if (m.stack) {
          // 모두 같은 좌표: 확대해도 나뉘지 않으므로 목록을 패널에 보여 줍니다.
          onSelectGroup?.(c.members);
          if (map.getZoom() < CLUSTER_OFF_ZOOM) map.setView([c.lat, c.lng], CLUSTER_OFF_ZOOM, { animate: !reduced });
        } else {
          map.fitBounds(
            [
              [c.south, c.west],
              [c.north, c.east],
            ],
            { padding: [48, 48], maxZoom: Math.max(nextZoom, CLUSTER_OFF_ZOOM), animate: !reduced },
          );
        }
      } else {
        onSelect?.(m.row);
      }
    },
    [map, onRegionSelect, onSelect, onSelectGroup, reduced],
  );
  const onHover = useMemo(
    () => (m: Mark | null, x: number, y: number) => {
      const size = map?.getSize();
      setHover(m && size ? { mark: m, x, y, w: size.x, h: size.y } : null);
    },
    [map],
  );

  const loadedRatio = totalInView ? Math.min(1, stations.length / totalInView) : 0;
  const zoomLabel = view ? view.zoom.toFixed(view.zoom % 1 ? 2 : 0) : '—';

  return (
    <div className="geo-map map-wrap" data-map-mode={stationMode ? 'stations' : 'regions'} data-basemap={basemap}>
      <MapContainer
        bounds={KOREA_BOUNDS}
        boundsOptions={{ padding: [16, 16] }}
        zoomSnap={0.25}
        minZoom={5}
        maxZoom={18}
        preferCanvas
        scrollWheelZoom
        // 좁은 화면에서 위쪽 안내 줄 아래로 전국을 맞출 수 있도록 여유를 둔 이동 한계
        maxBounds={[
          [30.5, 121.5],
          [41, 134],
        ]}
        attributionControl
        zoomControl={false}
      >
        <ZoomControl position="bottomright" zoomInTitle="확대" zoomOutTitle="축소" />
        <MapRef onReady={setMap} />
        {basemap !== 'off' && (
          <TileLayer
            key={basemap}
            className={basemap === 'dark' ? 'osm-dark' : 'osm-light'}
            url={OSM_TILE_URL}
            attribution={OSM_ATTRIBUTION}
            maxZoom={19}
          />
        )}
        <ViewWatcher onChange={handleView} />
        <MarkLayer state={layerState} onMarkClick={onMarkClick} onHover={onHover} />
      </MapContainer>

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
                <button type="button" className="btn btn-sm btn-primary" disabled={!map} onClick={() => map && map.setZoom(STATION_ZOOM)}>
                  이 위치 충전소 보기
                </button>
              </>
            )
          ) : locs.isError ? (
            <ErrorState error={locs.error} onRetry={() => locs.refetch()} height={72} />
          ) : (
            <>
              <span className="geo-status-mode">{(view?.zoom ?? 0) >= CLUSTER_OFF_ZOOM ? '개별 충전소' : '충전소 묶음'}</span>
              <span className="geo-status-text">
                {locs.isLoading ? (
                  '화면 영역 충전소 불러오는 중…'
                ) : totalInView === 0 ? (
                  '이 영역에 조건과 일치하는 충전소가 없습니다.'
                ) : (
                  <>
                    화면 영역 <b className="num">{fmtInt(stations.length)}</b> / <b className="num">{fmtInt(totalInView)}</b>곳 불러옴
                    {matched && <span className="muted"> · 일치 충전기 {fmtInt(matched.charger_count)}기</span>}
                  </>
                )}
              </span>
              {locs.isFetching && !locs.isLoading && <span className="muted small">불러오는 중…</span>}
              {locs.hasNextPage && !locs.isFetchingNextPage && pages.length >= AUTO_PAGES && (
                <button type="button" className="btn btn-sm" onClick={() => locs.fetchNextPage()}>
                  다음 1,000곳 불러오기
                </button>
              )}
              {totalInView > 0 && (
                <span className="map-progress geo-progress" aria-hidden="true">
                  <i style={{ width: `${loadedRatio * 100}%` }} />
                </span>
              )}
            </>
          )}
        </div>
        <div className="segmented geo-basemap" role="group" aria-label="배경 지도">
          {(
            [
              ['dark', '어둡게'],
              ['light', '원본'],
              ['off', '끄기'],
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
                  {(view?.zoom ?? 0) < CLUSTER_OFF_ZOOM ? '충전소 묶음 (불러온 충전소 수)' : '같은 위치의 충전소 묶음'}
                </li>
                <li>
                  <span className="geo-key geo-key-dot" style={{ background: C.s1 }} />
                  비삭제 충전기 있음
                </li>
                <li>
                  <span className="geo-key geo-key-dot" style={{ background: C.s2 }} />
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

      {hover && <MapTooltip hover={hover} />}
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
          충전소 {fmtInt(mark.cluster.members.length)}곳{mark.stack && ' (같은 위치)'}
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
