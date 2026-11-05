import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHead } from '../components/layout/AppShell';
import { FilterBar } from '../components/FilterBar';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { DataTable, Pager } from '../components/ui/DataTable';
import { StationMap, STATION_ZOOM } from '../components/StationMap';
import { MapAnalysisPanel } from '../components/MapAnalysisPanel';
import { RegionSystemNote } from '../components/DataNotes';
import { useChargerRegions, useLocationsPage } from '../api/hooks';
import { useFilters } from '../state/filters';
import { fmtInt } from '../lib/format';
import type { LocationRow } from '../api/types';
import { RegionOutputHeatmapCard, StationChargerCard } from '../features/ChartCards';
import { RegionCompareSection } from '../features/RegionCompare';
import { RegionalDisparitySection } from '../features/RegionalDisparity';

function StationList({
  selectedId,
  onShowOnMap,
}: {
  selectedId: string | null;
  onShowOnMap: (row: LocationRow) => void;
}) {
  const { chargerParams, state } = useFilters();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const q = useLocationsPage(chargerParams, page, limit, null);

  const key = JSON.stringify(chargerParams);
  useEffect(() => setPage(1), [key]);

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  return (
    <Card
      span={12}
      title="충전소 목록"
      sub="충전소 ID 순. 각 행의 충전기 수는 현재 필터와 일치하는 충전기만 셉니다."
      scope={{ kind: 'filtered', label: '충전기 필터' }}
      isFetching={q.isFetching && !q.isLoading}
      foot={
        meta && (
          <>
            유효 좌표가 없어 제외된 충전소 {fmtInt(meta.stations_without_valid_coordinates_excluded)}곳, 대표 좌표 선택에서 제외된 무효 좌표 행{' '}
            {fmtInt(meta.invalid_coordinate_rows_excluded_from_representative_selection)}개. {meta.representative_coordinate_rule}
          </>
        )
      }
    >
      <QueryState
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        isEmpty={!rows.length}
        emptyDetail="필터를 바꾸거나 초기화해 보세요."
        height={300}
      >
        <DataTable
          caption="충전소 목록"
          rows={rows}
          rowKey={(r) => r.station_id}
          isSelected={(r) => r.station_id === selectedId}
          columns={[
            { key: 'id', header: '충전소 ID', render: (r) => <span className="num muted">{r.station_id}</span> },
            { key: 'name', header: '충전소명', render: (r) => r.station_name },
            { key: 'addr', header: '주소', wrap: true, render: (r) => r.address },
            { key: 'region', header: '지역', render: (r) => (r.region_code === '12' ? '전남광주' : r.region_name) },
            { key: 'cnt', header: '충전기(기)', numeric: true, render: (r) => fmtInt(r.charger_count) },
            { key: 'n', header: '비삭제', numeric: true, render: (r) => fmtInt(r.not_deleted_charger_count) },
            { key: 'y', header: '삭제 표시', numeric: true, render: (r) => fmtInt(r.deleted_charger_count) },
            {
              key: 'coord',
              header: '위도, 경도',
              numeric: true,
              render: (r) => (
                <span className="muted">
                  {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                </span>
              ),
            },
            {
              key: 'map',
              header: <span className="sr-only">지도</span>,
              render: (r) => (
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-pressed={r.station_id === selectedId}
                  aria-label={`${r.station_name} 지도에서 보기`}
                  disabled={q.isFetching || q.isPlaceholderData}
                  onClick={() => onShowOnMap(r)}
                >
                  지도
                </button>
              ),
            },
          ]}
        />
        {meta?.pagination && (
          <Pager
            pagination={meta.pagination}
            onPage={setPage}
            unit="곳"
            limit={limit}
            limitOptions={[20, 50, 100]}
            onLimit={(n) => {
              setLimit(n);
              setPage(1);
            }}
            disabled={q.isFetching}
          />
        )}
        {state.region === '12' && (
          <p className="small muted" style={{ marginTop: 8 }}>
            12 전남광주통합특별시는 과거 광주·전남을 합친 현재 지역입니다.
          </p>
        )}
      </QueryState>
    </Card>
  );
}

export function RegionalExplorerPage() {
  const { chargerParams, state, update } = useFilters();
  const regions = useChargerRegions(chargerParams);
  const rows = [...(regions.data?.data ?? [])].sort((a, b) => b.charger_count - a.charger_count);
  const [selected, setSelected] = useState<LocationRow | null>(null);
  const [group, setGroup] = useState<LocationRow[] | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);

  // 선택 충전소의 충전기 수는 필터 기준이므로, 충전기 필터가 바뀌면 선택을 해제합니다.
  const filterKey = JSON.stringify(chargerParams);
  useEffect(() => {
    setSelected(null);
    setGroup(null);
  }, [filterKey]);
  const selectOnMap = useCallback((row: LocationRow | null) => {
    setSelected(row);
    setGroup(null);
  }, []);
  const selectGroup = useCallback((rows: LocationRow[]) => {
    setGroup(rows);
    setSelected(null);
  }, []);

  const focusSelected = useCallback(() => setFocusRequest((n) => n + 1), []);
  const showOnMap = useCallback((row: LocationRow) => {
    setSelected(row);
    setGroup(null);
    setFocusRequest((n) => n + 1);
    const el = mapRef.current;
    if (el) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }, []);

  return (
    <>
      <PageHead
        title="Regional Explorer"
        lede="16개 시도(2026 체계)의 충전기 분포를 지도, 두 지역 비교, 출력 구성 히트맵, 충전소 규모 산점도로 함께 비교합니다."
      />
      <FilterBar />
      <div className="grid">
        <Card
          span={12}
          title="전국 충전소 지도"
          reveal={false}
          sub={`줌 ${STATION_ZOOM} 미만은 시도별 충전소 수, 그 이상은 화면 영역(bbox)의 충전소 좌표를 1,000곳 단위로 불러와 묶음·개별 충전소로 표시합니다.`}
          scope={{ kind: 'filtered' }}
          className="geo-card"
        >
          <div className="geo-explorer" ref={mapRef}>
            <StationMap
              filters={chargerParams}
              onRegionSelect={(code) => update({ region: code })}
              selected={selected}
              onSelect={selectOnMap}
              onSelectGroup={selectGroup}
              focusRequest={focusRequest}
            />
            <MapAnalysisPanel
              filters={chargerParams}
              selected={selected}
              group={group}
              onPick={setSelected}
              onClearGroup={() => setGroup(null)}
              onClearSelection={() => setSelected(null)}
              onFocusSelected={focusSelected}
              onClearRegion={() => update({ region: undefined })}
            />
          </div>
        </Card>

        <RegionCompareSection />

        <RegionalDisparitySection />

        <RegionOutputHeatmapCard span={12} />
        <StationChargerCard span={7} height={360} />

        <div className="span-5 card-stack">
          <Card title="지역 표" sub="충전기 수 내림차순. 행 강조는 선택 지역입니다." scope={{ kind: 'filtered' }} isFetching={regions.isFetching && !regions.isLoading}>
            <QueryState isLoading={regions.isLoading} error={regions.error} onRetry={() => regions.refetch()} isEmpty={!rows.length} height={300}>
              <DataTable
                caption="지역별 충전기"
                rows={rows}
                rowKey={(r) => r.region_code}
                isSelected={(r) => r.region_code === state.region}
                maxHeight={420}
                columns={[
                  { key: 'name', header: '지역', render: (r) => (r.region_code === '12' ? '전남광주' : r.region_name) },
                  { key: 'cnt', header: '충전기', numeric: true, render: (r) => fmtInt(r.charger_count) },
                  { key: 'st', header: '충전소', numeric: true, render: (r) => fmtInt(r.station_count) },
                  { key: 'ratio', header: '충전소당', numeric: true, render: (r) => (r.station_count ? (r.charger_count / r.station_count).toFixed(2) : '—') },
                  { key: 'y', header: '삭제', numeric: true, render: (r) => fmtInt(r.deleted_charger_count) },
                ]}
              />
            </QueryState>
          </Card>
          <Card title="지역 체계" sub="광주·전남 통합 기준">
            <RegionSystemNote compact />
          </Card>
        </div>

        <StationList selectedId={selected?.station_id ?? null} onShowOnMap={showOnMap} />
      </div>
    </>
  );
}
