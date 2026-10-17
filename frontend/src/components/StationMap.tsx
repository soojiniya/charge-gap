import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L, { type Map as LeafletMap } from 'leaflet';
import { usePrefersReducedMotion } from '../lib/motion';
import 'leaflet/dist/leaflet.css';
import { useChargerRegions, useMapLocations } from '../api/hooks';
import type { BBox, ChargerFilterParams, ChargerRegionRow, LocationRow } from '../api/types';
import { fmtCompact, fmtInt } from '../lib/format';
import { C } from '../charts/theme';
import { ErrorState } from './ui/QueryState';

/**
 * 배경 지도: OpenStreetMap 표준 타일 (인증키 불필요).
 * OSM 타일 이용 정책에 따라 출처 표시를 유지하고, 대량 다운로드·사전 캐싱을 하지 않습니다.
 * 어두운 화면에 맞추려고 CSS 필터로 색만 반전·감쇠합니다(타일 원본은 변경하지 않음).
 * 다른 타일 서버를 쓰려면 .env의 VITE_TILE_URL을 지정합니다.
 */
const OSM_TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** 이 줌 이상에서만 /api/locations로 충전소 좌표를 요청합니다 (요청당 최대 1,000곳). */
export const STATION_ZOOM = 11;
/** 지도 이동 한 번에 자동으로 이어 받는 최대 페이지 수 (1,000곳 × 3). 이후는 버튼으로 이어 받기. */
const AUTO_PAGES = 3;

/**
 * 시도 버블을 놓을 화면 표시용 대표 지점(대략적인 행정 중심). 통계값이 아니며,
 * 버블 크기만 /api/charger-regions의 실제 충전기 수를 사용합니다.
 */
const REGION_ANCHORS: Record<string, [number, number]> = {
  '11': [37.5665, 126.978],
  '12': [34.95, 126.85],
  '26': [35.1796, 129.0756],
  '27': [35.8714, 128.6014],
  '28': [37.4563, 126.7052],
  '30': [36.3504, 127.3845],
  '31': [35.5384, 129.3114],
  '36': [36.48, 127.289],
  '41': [37.28, 127.45],
  '43': [36.8, 127.7],
  '44': [36.55, 126.8],
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

/** 오른쪽 위 안내 상자(HUD)에 가리지 않도록 그만큼 여백을 두고 대한민국 범위에 맞춥니다. */
export function fitKorea(map: LeafletMap) {
  const w = map.getContainer().clientWidth;
  const hud = w >= 760 ? Math.min(380, w * 0.4) : 0;
  map.fitBounds(KOREA_BOUNDS, { paddingTopLeft: [16, 16], paddingBottomRight: [hud + 16, 16], animate: false });
}

function MapRef({ onReady }: { onReady: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    fitKorea(map);
    onReady(map);
  }, [map, onReady]);
  return null;
}

function stationColor(s: LocationRow) {
  return s.not_deleted_charger_count > 0 ? C.s1 : C.s2;
}

interface Props {
  filters: ChargerFilterParams;
  onView: (v: MapView) => void;
  onRegionSelect: (code: string) => void;
}

export function StationMap({ filters, onView, onRegionSelect }: Props) {
  const [view, setView] = useState<MapView | null>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const stationMode = (view?.zoom ?? 0) >= STATION_ZOOM;
  const [basemap, setBasemap] = useState(true);
  const reduced = usePrefersReducedMotion();
  // 시도 버블 16개만 SVG로 그려 호버·선택 상태를 CSS 전환(160ms)으로 부드럽게 표시. 충전소 점은 성능을 위해 캔버스 유지
  const bubbleRenderer = useMemo(() => L.svg({ padding: 0.3 }), []);
  const [hoverRegion, setHoverRegion] = useState<string | null>(null);

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

  const maxRegion = Math.max(1, ...(regions.data?.data ?? []).map((r) => r.charger_count));
  const handleView = (v: MapView) => {
    setView(v);
    onView(v);
  };

  return (
    <div className="map-wrap">
      <MapContainer
        bounds={KOREA_BOUNDS}
        boundsOptions={{ padding: [16, 16] }}
        zoomSnap={0.25}
        minZoom={5}
        maxZoom={18}
        preferCanvas
        scrollWheelZoom
        maxBounds={[
          [32, 123],
          [39.8, 132.5],
        ]}
        attributionControl
      >
        <MapRef onReady={setMap} />
        {basemap && (
          <TileLayer
            className="osm-dark"
            url={OSM_TILE_URL}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        )}
        <ViewWatcher onChange={handleView} />

        {!stationMode &&
          (regions.data?.data ?? []).map((r: ChargerRegionRow) => {
            const anchor = REGION_ANCHORS[r.region_code];
            if (!anchor) return null;
            const radius = 8 + Math.sqrt(r.charger_count / maxRegion) * 34;
            const selected = filters.region_code === r.region_code;
            return (
              <CircleMarker
                key={r.region_code}
                center={anchor}
                radius={radius}
                renderer={bubbleRenderer}
                pathOptions={{
                  className: 'region-bubble',
                  color: selected ? C.compare : hoverRegion === r.region_code ? '#d8d3ee' : C.s1,
                  weight: selected ? 2.2 : hoverRegion === r.region_code ? 1.6 : 1,
                  fillColor: selected ? C.compare : C.s1,
                  fillOpacity: selected ? 0.42 : hoverRegion === r.region_code ? 0.52 : 0.3,
                }}
                eventHandlers={{
                  mouseover: () => setHoverRegion(r.region_code),
                  mouseout: () => setHoverRegion((h) => (h === r.region_code ? null : h)),
                  click: () => {
                    onRegionSelect(r.region_code);
                    if (reduced) map?.setView(anchor, Math.max(map.getZoom(), 9), { animate: false });
                    else map?.flyTo(anchor, Math.max(map.getZoom(), 9), { duration: 0.6 });
                  },
                }}
              >
                <Tooltip direction="center" permanent className="region-bubble-label">
                  {fmtCompact(r.charger_count)}
                </Tooltip>
                <Popup>
                  <div className="pop-title">{r.region_code === '12' ? `${r.region_name} (광주+전남 통합)` : r.region_name}</div>
                  <div className="pop-row">
                    충전기 <b>{fmtInt(r.charger_count)}기</b>
                  </div>
                  <div className="pop-row">
                    충전소 <b>{fmtInt(r.station_count)}곳</b>
                  </div>
                  <div className="pop-row">
                    삭제 표시 <b>{fmtInt(r.deleted_charger_count)}기</b>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {stationMode &&
          stations.map((s) => (
            <CircleMarker
              key={s.station_id}
              center={[s.latitude, s.longitude]}
              radius={Math.min(11, 3 + Math.sqrt(s.charger_count) * 1.3)}
              pathOptions={{ color: C.surface, weight: 1, fillColor: stationColor(s), fillOpacity: 0.85 }}
            >
              <Popup>
                <div className="pop-title">{s.station_name}</div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  {s.address}
                </div>
                <div className="pop-row">
                  필터 일치 충전기 <b>{fmtInt(s.charger_count)}기</b>
                </div>
                <div className="pop-row">
                  비삭제 / 삭제 표시{' '}
                  <b>
                    {fmtInt(s.not_deleted_charger_count)} / {fmtInt(s.deleted_charger_count)}
                  </b>
                </div>
                <div className="pop-row">
                  지역 <b>{s.region_name}</b>
                </div>
                <div className="pop-row">
                  충전소 ID <b>{s.station_id}</b>
                </div>
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>

      <div className="map-basemap-toggle">
        <div className="segmented" role="group" aria-label="배경 지도" style={{ height: 30 }}>
          <button type="button" aria-pressed={basemap} onClick={() => setBasemap(true)}>
            배경 지도
          </button>
          <button type="button" aria-pressed={!basemap} onClick={() => setBasemap(false)}>
            끄기
          </button>
        </div>
      </div>
      <div className="map-hud" aria-live="polite">
        {!stationMode ? (
          <>
            <div>
              시도별 충전기 수를 버블 크기로 표시합니다. 버블을 누르면 그 지역으로 필터합니다.
              {regions.isFetching && ' (갱신 중)'}
            </div>
            <div className="muted">
              버블 위치는 표시용 대표 지점입니다. 지도를 줌 {STATION_ZOOM} 이상으로 확대하면 화면 영역의 충전소 좌표를 불러옵니다.
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!map}
                onClick={() => map && map.setZoom(STATION_ZOOM)}
              >
                이 위치 충전소 보기
              </button>
            </div>
            {regions.isError && <ErrorState error={regions.error} onRetry={() => regions.refetch()} height={80} />}
          </>
        ) : locs.isError ? (
          <ErrorState error={locs.error} onRetry={() => locs.refetch()} height={80} />
        ) : (
          <>
            <div>
              화면 영역 충전소 <b>{fmtInt(stations.length)}</b> / <b>{fmtInt(totalInView)}</b>곳 표시
              {matched && <> (일치 충전기 {fmtInt(matched.charger_count)}기)</>}
            </div>
            <div className="map-progress" aria-hidden="true">
              <i style={{ width: `${totalInView ? (stations.length / totalInView) * 100 : 0}%` }} />
            </div>
            <div className="legend">
              <span className="legend-item">
                <span className="swatch" style={{ background: C.s1, borderRadius: '50%' }} />
                비삭제 충전기 있음
              </span>
              <span className="legend-item">
                <span className="swatch" style={{ background: C.s2, borderRadius: '50%' }} />
                모두 삭제 표시
              </span>
            </div>
            <div className="row">
              {locs.isFetching && <span className="muted">불러오는 중…</span>}
              {!locs.isFetching && totalInView === 0 && <span className="muted">이 영역에 일치하는 충전소가 없습니다.</span>}
              {locs.hasNextPage && !locs.isFetchingNextPage && pages.length >= AUTO_PAGES && (
                <button type="button" className="btn btn-sm" onClick={() => locs.fetchNextPage()}>
                  다음 1,000곳 불러오기
                </button>
              )}
              <button type="button" className="btn btn-sm btn-ghost" disabled={!map} onClick={() => map && fitKorea(map)}>
                전국 보기
              </button>
            </div>
            <div className="muted">충전소마다 대표 좌표 한 점입니다. 크기는 필터 일치 충전기 수입니다.</div>
          </>
        )}
      </div>
    </div>
  );
}
