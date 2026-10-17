/**
 * 과제용 그래프 10종 + 연간 설치 카드.
 * 각 카드는 자기 데이터 훅을 갖고, 그 엔드포인트가 받는 필터만 요청변수로 보냅니다.
 */
import { useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { DataTable } from '../components/ui/DataTable';
import { Insight } from '../components/ui/Insight';
import { HBarChart, type HBarDatum } from '../charts/HBarChart';
import { DonutChart, type DonutSlice } from '../charts/DonutChart';
import { StackedHBar } from '../charts/StackedHBar';
import { CommercialDotPlot, toCommercialData } from '../charts/CommercialDotPlot';
import { RegionScatter } from '../charts/RegionScatter';
import { BoxLegend, BoxPlot } from '../charts/BoxPlot';
import { HistKde } from '../charts/HistKde';
import { Heatmap, type HeatRow } from '../charts/Heatmap';
import { OperatorTreemap, type TreeItem } from '../charts/OperatorTreemap';
import { ColumnChart, type ColumnDatum } from '../charts/ColumnChart';
import { CumulativeChart } from '../charts/CumulativeChart';
import { C } from '../charts/theme';
import {
  useChargerOutput,
  useChargerRegions,
  useChargerTypes,
  useEvRegistration,
  useFilterOptions,
  useGrowth,
  useOperators,
  useRegionOutputMatrix,
  useStationSize,
} from '../api/hooks';
import { useFilters } from '../state/filters';
import { fmtInt, fmtPct, VALUE_STATUS_LABEL } from '../lib/format';
import type { ChargerOutputRow, ChargerRegionRow, ChargerTypeRow, EvRegistrationRow, GrowthRow, StationSizeRow } from '../api/types';
import {
  insightAnnual,
  insightCumulative,
  insightEvCommercial,
  insightCommercialDot,
  insightCommercialCount,
  insightEvRegions,
  insightEvTypes,
  insightHeatmap,
  insightOperators,
  insightOutput,
  insightStationCharger,
  insightBoxplot,
  insightTypes,
} from '../analysis/insights';
import { chargerRegionLabel } from '../components/FilterBar';

type Span = 4 | 5 | 6 | 7 | 8 | 12;
const short = (code: string, name: string) => (code === '12' ? '전남광주' : name);

/* ======================= 공통 표 ======================= */
export function EvTable({ rows, selected }: { rows: EvRegistrationRow[]; selected?: string }) {
  return (
    <DataTable
      caption="지역별 전기차 등록 현황 (2025년 12월)"
      rows={[...rows].sort((a, b) => b.ev_registration_count - a.ev_registration_count)}
      rowKey={(r) => r.region_code_2025}
      isSelected={(r) => r.region_code_2025 === selected}
      columns={[
        { key: 'code', header: '코드', render: (r) => <span className="num">{r.region_code_2025}</span> },
        { key: 'name', header: '지역 (2025 체계)', render: (r) => r.region_name_2025 },
        { key: 'total', header: '등록 합계(대)', numeric: true, render: (r) => fmtInt(r.ev_registration_count) },
        { key: 'p', header: '승용', numeric: true, render: (r) => fmtInt(r.ev_passenger_count) },
        { key: 'b', header: '승합', numeric: true, render: (r) => fmtInt(r.ev_bus_count) },
        { key: 't', header: '화물', numeric: true, render: (r) => fmtInt(r.ev_truck_count) },
        { key: 's', header: '특수', numeric: true, render: (r) => fmtInt(r.ev_special_count) },
        { key: 'n', header: '비사업용', numeric: true, render: (r) => fmtInt(r.ev_noncommercial_count) },
        { key: 'c', header: '사업용', numeric: true, render: (r) => fmtInt(r.ev_commercial_count) },
        {
          key: 'cs',
          header: '사업용 비중',
          numeric: true,
          render: (r) => fmtPct(r.ev_registration_count ? (r.ev_commercial_count / r.ev_registration_count) * 100 : null),
        },
      ]}
    />
  );
}

export function TypeTable({ rows }: { rows: ChargerTypeRow[] }) {
  return (
    <DataTable
      caption="커넥터 유형별 충전기"
      rows={[...rows].sort((a, b) => b.charger_count - a.charger_count)}
      rowKey={(r) => r.charger_type_code}
      columns={[
        { key: 'code', header: '코드', render: (r) => <span className="num">{r.charger_type_code}</span> },
        { key: 'def', header: '공식 정의', render: (r) => r.official_definition },
        { key: 'cnt', header: '충전기(기)', numeric: true, render: (r) => fmtInt(r.charger_count) },
        { key: 'share', header: '구성비', numeric: true, render: (r) => fmtPct(r.share_pct, 2) },
        { key: 'st', header: '충전소(곳)', numeric: true, render: (r) => fmtInt(r.station_count) },
        { key: 'y', header: '삭제 표시', numeric: true, render: (r) => fmtInt(r.deleted_charger_count) },
      ]}
    />
  );
}

export function RegionTable({ rows, selected }: { rows: ChargerRegionRow[]; selected?: string }) {
  return (
    <DataTable
      caption="지역별 충전기"
      rows={[...rows].sort((a, b) => b.charger_count - a.charger_count)}
      rowKey={(r) => r.region_code}
      isSelected={(r) => r.region_code === selected}
      columns={[
        { key: 'code', header: '코드', render: (r) => <span className="num">{r.region_code}</span> },
        { key: 'name', header: '지역 (2026 체계)', render: (r) => chargerRegionLabel(r.region_code, r.region_name) },
        { key: 'cnt', header: '충전기(기)', numeric: true, render: (r) => fmtInt(r.charger_count) },
        { key: 'st', header: '충전소(곳)', numeric: true, render: (r) => fmtInt(r.station_count) },
        { key: 'ratio', header: '충전소당 충전기', numeric: true, render: (r) => (r.station_count ? (r.charger_count / r.station_count).toFixed(2) : '—') },
        { key: 'share', header: '구성비', numeric: true, render: (r) => fmtPct(r.share_pct, 2) },
        { key: 'y', header: '삭제 표시', numeric: true, render: (r) => fmtInt(r.deleted_charger_count) },
      ]}
    />
  );
}

function OutputTable({ rows }: { rows: ChargerOutputRow[] }) {
  return (
    <DataTable
      caption="출력값별 충전기"
      rows={rows}
      rowKey={(r) => `${r.value_status}-${r.output_raw}`}
      maxHeight={460}
      columns={[
        { key: 'raw', header: 'output 원문', render: (r) => <span className="num">{r.output_raw === '' ? '(빈 값)' : r.output_raw}</span> },
        { key: 'kw', header: '수치(kW)', numeric: true, render: (r) => (r.output_kw === null ? '—' : fmtInt(r.output_kw)) },
        { key: 'st', header: '검증 상태', render: (r) => VALUE_STATUS_LABEL[r.value_status] ?? r.value_status },
        { key: 'cnt', header: '충전기(기)', numeric: true, render: (r) => fmtInt(r.charger_count) },
        { key: 'share', header: '구성비', numeric: true, render: (r) => fmtPct(r.share_pct, 3) },
      ]}
    />
  );
}

function GrowthTable({ rows }: { rows: GrowthRow[] }) {
  return (
    <DataTable
      caption="연도별 충전기 설치 통계"
      rows={rows}
      rowKey={(r) => String(r.year)}
      columns={[
        { key: 'y', header: '연도', render: (r) => <span className="num">{r.year}</span> },
        { key: 'a', header: '연간 설치(기)', numeric: true, render: (r) => fmtInt(r.annual_installed_count) },
        { key: 'c', header: '누적(기)', numeric: true, render: (r) => fmtInt(r.cumulative_count) },
        {
          key: 'p',
          header: '구분',
          render: (r) => (r.is_partial_year ? <span className="badge partial">부분 연도</span> : <span className="badge">완료 연도</span>),
        },
      ]}
    />
  );
}

/* ======================= G1 지역별 전기차 등록 ======================= */
export function EvRegionsCard({ span = 7, rowHeight = 26 }: { span?: Span; rowHeight?: number }) {
  const { state, update } = useFilters();
  const q = useEvRegistration(undefined);
  const rows = q.data?.data ?? [];
  const total = q.data?.meta.totals.ev_registration_count ?? 0;
  const data: HBarDatum[] = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.ev_registration_count - a.ev_registration_count)
        .map((r) => ({
          key: r.region_code_2025,
          label: r.region_name_2025,
          value: r.ev_registration_count,
          tip: [
            { label: '등록', value: `${fmtInt(r.ev_registration_count)}대`, color: C.s1 },
            { label: '전국 대비', value: fmtPct(total ? (r.ev_registration_count / total) * 100 : null) },
          ],
        })),
    [rows, total],
  );
  const chart = (h: number) => (
    <HBarChart
      data={data}
      unit="대"
      rowHeight={h}
      labelWidth={52}
      highlightKey={state.evRegion}
      onSelect={(k) => update({ evRegion: state.evRegion === k ? undefined : k })}
      ariaLabel="지역별 전기차 등록 대수 가로 막대 그래프"
    />
  );
  return (
    <Card
      no={1}
      span={span}
      title="지역별 전기차 등록 대수"
      sub="2025년 12월, 17개 시도. 막대를 누르면 그 지역을 선택합니다."
      scope={{ kind: 'fixed', label: '전국 17개 지역' }}
      isFetching={q.isFetching && !q.isLoading}
      detail={{ chart: chart(30), table: <EvTable rows={rows} selected={state.evRegion} />, meta: q.data?.meta, staticChartIds: [1] }}
      insight={rows.length ? <Insight {...insightEvRegions(rows, state.evRegion)} stack={span < 7} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={440}>
        {chart(rowHeight)}
      </QueryState>
    </Card>
  );
}

/* ======================= G2 차종별 구성 ======================= */
export function EvTypesCard({ span = 5 }: { span?: Span }) {
  const { state } = useFilters();
  const q = useEvRegistration(state.evRegion);
  const rows = q.data?.data ?? [];
  const s = rows.reduce(
    (a, r) => ({
      total: a.total + r.ev_registration_count,
      passenger: a.passenger + r.ev_passenger_count,
      truck: a.truck + r.ev_truck_count,
      bus: a.bus + r.ev_bus_count,
      special: a.special + r.ev_special_count,
    }),
    { total: 0, passenger: 0, truck: 0, bus: 0, special: 0 },
  );
  const slices: DonutSlice[] = [
    { key: 'p', label: '승용', value: s.passenger, color: C.s1 },
    { key: 't', label: '화물', value: s.truck, color: C.s2 },
    { key: 'b', label: '승합', value: s.bus, color: C.s3 },
    { key: 's', label: '특수', value: s.special, color: C.s4 },
  ];
  const name = state.evRegion ? rows[0]?.region_name_2025 ?? state.evRegion : '전국';
  return (
    <Card
      no={2}
      span={span}
      title={`차종별 등록 구성 (${name})`}
      sub="승용·화물·승합·특수 4개 차종의 구성비"
      scope={{ kind: 'filtered', label: '등록 지역 필터' }}
      isFetching={q.isFetching && !q.isLoading}
      detail={{
        chart: <DonutChart data={slices} unit="대" centerLabel="등록 대수" ariaLabel="차종별 전기차 구성" size={300} />,
        table: <EvTable rows={rows} selected={state.evRegion} />,
        meta: q.data?.meta,
        staticChartIds: [2],
      }}
      insight={rows.length ? <Insight {...insightEvTypes(s, name, !!state.evRegion)} stack={span < 7} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={200}>
        <DonutChart data={slices} unit="대" centerLabel="등록 대수" ariaLabel="차종별 전기차 구성 도넛 그래프" size={190} />
      </QueryState>
    </Card>
  );
}

/* ======================= G3 사업용·비사업용 (기본: 사업용 비율 점 그래프) ======================= */
type CommercialView = 'dot' | 'percent' | 'count';
const COMMERCIAL_VIEWS: { id: CommercialView; label: string; sub: string }[] = [
  { id: 'dot', label: '비율 점', sub: '지역별 사업용 비율, 높은 순. 점선은 전국 비율, 가장 높은 지역만 강조' },
  { id: 'percent', label: '100% 누적', sub: '각 지역을 100%로 맞춘 사업용·비사업용 구성, 사업용 비율이 높은 순' },
  { id: 'count', label: '대수', sub: '사업용·비사업용 등록 대수 누적, 전체 등록 대수 순' },
];

export function EvCommercialCard({ span = 12 }: { span?: Span }) {
  const { state, update } = useFilters();
  const q = useEvRegistration(undefined);
  const [view, setView] = useState<CommercialView>('dot');
  const rows = q.data?.data ?? [];
  const dots = useMemo(() => toCommercialData(rows), [rows]);
  const totals = rows.reduce((a, r) => ({ c: a.c + r.ev_commercial_count, t: a.t + r.ev_registration_count }), { c: 0, t: 0 });
  const national = totals.t ? (totals.c / totals.t) * 100 : 0;
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        view === 'count'
          ? b.ev_registration_count - a.ev_registration_count
          : b.ev_commercial_count / b.ev_registration_count - a.ev_commercial_count / a.ev_registration_count,
      ),
    [rows, view],
  );
  const select = (k: string) => update({ evRegion: state.evRegion === k ? undefined : k });
  const chart =
    view === 'dot' ? (
      <CommercialDotPlot
        data={dots}
        nationalShare={national}
        highlightKey={state.evRegion}
        onSelect={select}
        ariaLabel="지역별 사업용 전기차 비율 점 그래프"
      />
    ) : (
      <StackedHBar
        data={sorted}
        labelKey="region_name_2025"
        idKey="region_code_2025"
        series={[
          { key: 'ev_commercial_count', label: '사업용', color: C.s2 },
          { key: 'ev_noncommercial_count', label: '비사업용', color: C.s1 },
        ]}
        unit="대"
        normalized={view === 'percent'}
        highlightId={state.evRegion}
        onSelect={select}
        labelWidth={52}
        ariaLabel={view === 'percent' ? '지역별 사업용·비사업용 100% 누적 막대 그래프' : '지역별 사업용·비사업용 등록 대수 누적 막대 그래프'}
      />
    );
  const insight = !rows.length
    ? undefined
    : view === 'dot'
      ? insightCommercialDot(rows, state.evRegion)
      : view === 'percent'
        ? insightEvCommercial(rows, state.evRegion)
        : insightCommercialCount(rows, state.evRegion);
  const current = COMMERCIAL_VIEWS.find((v) => v.id === view)!;
  return (
    <Card
      no={3}
      span={span}
      title={view === 'dot' ? '지역별 사업용 전기차 비율' : '지역별 사업용·비사업용 구성'}
      sub={`${current.sub}. 점이나 막대를 누르면 그 지역을 선택합니다.`}
      scope={{ kind: 'fixed', label: '전국 17개 지역' }}
      isFetching={q.isFetching && !q.isLoading}
      actions={
        <div className="segmented" role="group" aria-label="그래프 형태" style={{ height: 30 }}>
          {COMMERCIAL_VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      }
      detail={{ chart, table: <EvTable rows={rows} selected={state.evRegion} />, meta: q.data?.meta, staticChartIds: [3] }}
      insight={insight ? <Insight {...insight} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={460}>
        {/* 보기 전환 시 새 형태의 등장 애니메이션을 다시 재생 */}
        <div key={view}>{chart}</div>
      </QueryState>
    </Card>
  );
}

/* ======================= G4 충전소 수 vs 충전기 수 ======================= */
export function StationChargerCard({ span = 7, height = 340 }: { span?: Span; height?: number }) {
  const { chargerParams, state, update, activeChargerCount } = useFilters();
  // 지역 필터를 걸면 점이 1개가 되므로, 이 그래프는 지역 필터를 제외하고 요청하고 선택 지역은 강조만 합니다.
  const params = { ...chargerParams, region_code: undefined };
  const q = useChargerRegions(params);
  const rows = q.data?.data ?? [];
  const pts = rows.map((r) => ({ key: r.region_code, label: short(r.region_code, r.region_name), x: r.station_count, y: r.charger_count }));
  const filtered = activeChargerCount - (state.region ? 1 : 0) > 0;
  const chart = (h: number) => (
    <RegionScatter
      data={pts}
      xLabel="충전소 수"
      yLabel="충전기 수"
      xUnit="곳"
      yUnit="기"
      highlightKey={state.region}
      onSelect={(k) => update({ region: state.region === k ? undefined : k })}
      height={h}
      ariaLabel="지역별 충전소 수와 충전기 수 산점도와 회귀선"
    />
  );
  return (
    <Card
      no={4}
      span={span}
      title="지역별 충전소 수와 충전기 수의 관계"
      sub="16개 시도 산점도 + 최소제곱 회귀선(점선). 점을 누르면 지역을 선택합니다."
      scope={{ kind: 'filtered', label: '유형·삭제·기관 필터' }}
      isFetching={q.isFetching && !q.isLoading}
      detail={{ chart: chart(460), table: <RegionTable rows={rows} selected={state.region} />, meta: q.data?.meta, staticChartIds: [4] }}
      insight={rows.length ? <Insight {...insightStationCharger(rows, filtered, state.region)} stack={span < 7} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={height}>
        {chart(height)}
      </QueryState>
    </Card>
  );
}

/* ======================= G5 충전소당 충전기 수 박스플롯 ======================= */
function StationSizeTable({ rows }: { rows: StationSizeRow[] }) {
  const n = (v: number) => (Number.isInteger(v) ? fmtInt(v) : v.toFixed(2));
  return (
    <DataTable
      caption="지역별 충전소당 충전기 수 분포 통계"
      rows={rows}
      rowKey={(r) => r.region_code}
      columns={[
        { key: 'r', header: '지역', render: (r) => short(r.region_code, r.region_name) },
        { key: 'n', header: '표본(곳)', numeric: true, render: (r) => fmtInt(r.sample_count) },
        { key: 'min', header: 'min', numeric: true, render: (r) => n(r.min) },
        { key: 'wl', header: '아래 수염', numeric: true, render: (r) => n(r.whisker_low) },
        { key: 'q1', header: 'Q1', numeric: true, render: (r) => n(r.q1) },
        { key: 'md', header: '중앙값', numeric: true, render: (r) => n(r.median) },
        { key: 'q3', header: 'Q3', numeric: true, render: (r) => n(r.q3) },
        { key: 'wh', header: '위 수염', numeric: true, render: (r) => n(r.whisker_high) },
        { key: 'max', header: 'max', numeric: true, render: (r) => n(r.max) },
        { key: 'mean', header: '평균', numeric: true, render: (r) => n(r.mean) },
        { key: 'iqr', header: 'IQR', numeric: true, render: (r) => n(r.iqr) },
        { key: 'fh', header: '위 울타리', numeric: true, render: (r) => n(r.fence_high) },
        { key: 'oc', header: '이상치(곳)', numeric: true, render: (r) => fmtInt(r.outlier_count) },
        { key: 'cc', header: '충전기 합계', numeric: true, render: (r) => fmtInt(r.charger_count) },
      ]}
    />
  );
}

/**
 * 삭제 표시 처리: 백엔드 권장에 따라 필터가 '전체'일 때는 비삭제(not_deleted)로 요청합니다.
 * 사용자가 '비삭제 표시' 또는 '삭제 표시'를 고르면 그 값을 그대로 보냅니다.
 */
export function boxplotDeletion(d: string | undefined): 'not_deleted' | 'deleted' {
  return d === 'deleted' ? 'deleted' : 'not_deleted';
}

export function StationBoxplotCard({ span = 12 }: { span?: Span }) {
  const { chargerParams, state, activeChargerCount } = useFilters();
  const deletionUsed = boxplotDeletion(chargerParams.deletion);
  const params = { ...chargerParams, deletion: deletionUsed };
  const q = useStationSize(params);
  const [log, setLog] = useState(true);
  const rows = useMemo(() => [...(q.data?.data ?? [])].sort((a, b) => b.median - a.median || b.q3 - a.q3 || b.mean - a.mean), [q.data]);
  const filtered = activeChargerCount - (state.deletion !== 'all' ? 1 : 0) > 0 || deletionUsed === 'deleted';
  const sampleTotal = q.data?.meta.sample_count ?? 0;
  const chart = (
    <>
      <BoxLegend />
      <BoxPlot rows={rows} log={log} highlightKey={state.region} ariaLabel="지역별 충전소당 충전기 수 박스플롯" />
    </>
  );
  return (
    <Card
      no={5}
      span={span}
      title="충전소당 충전기 수 분포 (지역별 박스플롯)"
      sub={`${deletionUsed === 'deleted' ? '삭제 표시' : '비삭제 표시'} 충전기 기준, 표본 ${fmtInt(sampleTotal)}곳. 중앙값이 높은 지역 순입니다.`}
      scope={{ kind: 'filtered' }}
      isFetching={q.isFetching && !q.isLoading}
      actions={
        <div className="segmented" role="group" aria-label="가로축 눈금" style={{ height: 30 }}>
          <button type="button" aria-pressed={log} onClick={() => setLog(true)}>
            로그 축
          </button>
          <button type="button" aria-pressed={!log} onClick={() => setLog(false)}>
            선형 축
          </button>
        </div>
      }
      detail={{
        chart,
        table: <StationSizeTable rows={rows} />,
        meta: q.data?.meta,
        note: q.data ? `${q.data.meta.whisker_rule} 사분위수: ${q.data.meta.quantile_method}. ${q.data.meta.deletion_policy}` : undefined,
      }}
      insight={rows.length ? <Insight {...insightBoxplot(rows, deletionUsed, filtered, sampleTotal)} /> : undefined}
    >
      <QueryState
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        isEmpty={!rows.length}
        emptyTitle="조건에 맞는 충전소 표본이 없습니다"
        emptyDetail={state.type === '09' ? '09 NACS는 공식 정의만 있고 관측된 충전기가 0건입니다.' : '필터를 바꾸거나 초기화해 보세요.'}
        height={420}
      >
        {state.deletion === 'all' && (
          <p className="small muted" style={{ marginBottom: 8 }}>
            삭제 표시 필터가 '전체'일 때 이 그래프는 비삭제 표시 충전기로 집계합니다. 삭제 표시만 보려면 필터에서 '삭제 표시'를 고르세요.
          </p>
        )}
        {chart}
      </QueryState>
    </Card>
  );
}

/* ======================= G6 유형 구성 도넛 ======================= */
export function TypesDonutCard({ span = 5, size = 200 }: { span?: Span; size?: number }) {
  const { chargerParams, activeChargerCount } = useFilters();
  const q = useChargerTypes(chargerParams);
  const rows = q.data?.data ?? [];
  const sorted = [...rows].sort((a, b) => b.charger_count - a.charger_count);
  const colors = [C.s1, C.s2, C.s3, C.s4];
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const slices: DonutSlice[] = [
    ...top.map((r, i) => ({ key: r.charger_type_code, label: `${r.charger_type_code} ${r.official_definition}`, value: r.charger_count, color: colors[i] })),
    ...(rest.length ? [{ key: 'etc', label: `기타 ${rest.length}개 유형`, value: rest.reduce((s, r) => s + r.charger_count, 0), color: C.other }] : []),
  ];
  return (
    <Card
      no={6}
      span={span}
      title="충전기 유형별 구성"
      sub="공식 커넥터 유형 코드 기준, 상위 4개 + 기타"
      scope={{ kind: 'filtered' }}
      isFetching={q.isFetching && !q.isLoading}
      detail={{
        chart: <DonutChart data={slices} unit="기" centerLabel="충전기" ariaLabel="유형별 충전기 구성" size={300} />,
        table: <TypeTable rows={rows} />,
        meta: q.data?.meta,
        staticChartIds: [6],
        note: q.data?.meta.classification_note,
      }}
      insight={rows.length ? <Insight {...insightTypes(rows, activeChargerCount > 0)} stack={span < 7} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={size}>
        <DonutChart data={slices} unit="기" centerLabel="충전기" ariaLabel="유형별 충전기 구성 도넛 그래프" size={size} />
      </QueryState>
    </Card>
  );
}

/* ======================= G7 출력 히스토그램 + KDE ======================= */
export function OutputHistCard({ span = 12 }: { span?: Span }) {
  const { chargerParams, activeChargerCount } = useFilters();
  const [logY, setLogY] = useState(true);
  const q = useChargerOutput(chargerParams);
  const rows = q.data?.data ?? [];
  const items = rows
    .filter((r) => r.value_status === 'positive_numeric' && r.output_kw !== null)
    .map((r) => ({ value: r.output_kw as number, weight: r.charger_count }));
  const stats = q.data?.meta.output_statistics;
  return (
    <Card
      no={7}
      span={span}
      title="충전기 정격 출력 분포"
      sub={`히스토그램(막대) + KDE(곡선), x축 로그 눈금, 세로축 ${logY ? '로그' : '선형'}`}
      scope={{ kind: 'filtered' }}
      actions={
        <div className="segmented" role="group" aria-label="세로축 눈금" style={{ height: 30 }}>
          <button type="button" aria-pressed={logY} onClick={() => setLogY(true)}>
            로그 y
          </button>
          <button type="button" aria-pressed={!logY} onClick={() => setLogY(false)}>
            선형 y
          </button>
        </div>
      }
      isFetching={q.isFetching && !q.isLoading}
      detail={{
        chart: <HistKde items={items} height={460} logY={logY} ariaLabel="정격 출력 히스토그램과 KDE" />,
        table: <OutputTable rows={rows} />,
        meta: q.data?.meta,
        staticChartIds: [7],
        note: q.data?.meta.output_note,
      }}
      insight={rows.length ? <Insight {...insightOutput(rows, stats, activeChargerCount > 0)} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!items.length} height={300}>
        <div className="legend" style={{ marginBottom: 8 }}>
          <span className="legend-item">
            <span className="swatch" style={{ background: C.s1 }} />
            구간별 충전기 수
          </span>
          <span className="legend-item">
            <span className="swatch" style={{ background: C.compare, height: 3 }} />
            KDE 추정 곡선
          </span>
        </div>
        <HistKde items={items} height={300} logY={logY} ariaLabel="정격 출력 히스토그램과 KDE 곡선" />
      </QueryState>
    </Card>
  );
}

/* ======================= G8 지역 × 출력 구간 히트맵 ======================= */
export const OUTPUT_BANDS = ['30kW 미만', '30–50', '50–100', '100–200', '200kW 이상', '미상'];
function bandIndex(r: ChargerOutputRow) {
  if (r.value_status !== 'positive_numeric' || r.output_kw === null) return 5;
  const k = r.output_kw;
  return k < 30 ? 0 : k < 50 ? 1 : k < 100 ? 2 : k < 200 ? 3 : 4;
}

export function RegionOutputHeatmapCard({ span = 12 }: { span?: Span }) {
  const { chargerParams, state, update, activeChargerCount } = useFilters();
  const opts = useFilterOptions();
  const codes = opts.data?.charger_regions.map((r) => r.code) ?? [];
  const names = Object.fromEntries((opts.data?.charger_regions ?? []).map((r) => [r.code, r.name]));
  const m = useRegionOutputMatrix(chargerParams, codes);
  const rows: HeatRow[] = useMemo(() => {
    if (!m.data) return [];
    return m.data
      .map(({ code, res }) => {
        const counts = [0, 0, 0, 0, 0, 0];
        res.data.forEach((r) => (counts[bandIndex(r)] += r.charger_count));
        return { key: code, label: short(code, names[code] ?? code), counts };
      })
      .filter((r) => r.counts.some((v) => v > 0))
      .sort((a, b) => b.counts.reduce((s, v) => s + v, 0) - a.counts.reduce((s, v) => s + v, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.data, opts.data]);
  const filtered = activeChargerCount - (state.region ? 1 : 0) > 0;
  const table = (
    <DataTable
      caption="지역별 출력 구간 충전기 수"
      rows={rows}
      rowKey={(r) => r.key}
      columns={[
        { key: 'r', header: '지역', render: (r) => r.label },
        ...OUTPUT_BANDS.map((b, i) => ({ key: `b${i}`, header: b, numeric: true, render: (r: HeatRow) => fmtInt(r.counts[i]) })),
        { key: 't', header: '합계', numeric: true, render: (r) => fmtInt(r.counts.reduce((s, v) => s + v, 0)) },
      ]}
    />
  );
  return (
    <Card
      no={8}
      span={span}
      title="지역별 충전기 출력 구간 구성"
      sub="행 기준 비율(%) 히트맵. 칸에 마우스를 올리면 실제 대수를 보여 줍니다. 지역명을 누르면 지역을 선택합니다."
      scope={{ kind: 'filtered', label: '유형·삭제·기관 필터' }}
      isFetching={m.isFetching && !m.isLoading}
      detail={{ table, staticChartIds: [10] }}
      insight={rows.length ? <Insight {...insightHeatmap(rows, OUTPUT_BANDS, filtered, state.region)} /> : undefined}
    >
      <QueryState isLoading={m.isLoading || !opts.data} error={m.error ?? opts.error} onRetry={() => m.refetch()} isEmpty={!rows.length} height={420}>
        <Heatmap
          rows={rows}
          columns={OUTPUT_BANDS}
          highlightKey={state.region}
          onSelect={(k) => update({ region: state.region === k ? undefined : k })}
          caption="지역별 충전기 출력 구간 구성비"
        />
      </QueryState>
    </Card>
  );
}

/* ======================= 연간 설치 ======================= */
export function AnnualCard({ span = 7, yearFrom, yearTo, height = 300 }: { span?: Span; yearFrom?: number; yearTo?: number; height?: number }) {
  const q = useGrowth(yearFrom, yearTo);
  const rows = q.data?.data ?? [];
  const data: ColumnDatum[] = rows.map((r) => ({
    key: String(r.year),
    label: String(r.year),
    value: r.annual_installed_count,
    partial: r.is_partial_year,
    tip: [
      { label: '연간 설치', value: `${fmtInt(r.annual_installed_count)}기`, color: r.is_partial_year ? C.s3 : C.s1, hatched: r.is_partial_year },
      { label: '누적', value: `${fmtInt(r.cumulative_count)}기` },
    ],
    note: r.is_partial_year ? '부분 연도: 집계 마감일 미기재' : undefined,
  }));
  return (
    <Card
      span={span}
      title="연간 충전기 설치 수"
      sub="완료 연도는 막대, 2026년 부분 연도는 빗금"
      scope={{ kind: 'filtered', label: '연도 구간' }}
      isFetching={q.isFetching && !q.isLoading}
      detail={{
        chart: <ColumnChart data={data} unit="기" height={460} labelPolicy="extremes" ariaLabel="연간 충전기 설치 수" />,
        table: <GrowthTable rows={rows} />,
        meta: q.data?.meta,
        staticChartIds: [9],
        note: q.data?.meta.growth_warning,
      }}
      insight={rows.length ? <Insight {...insightAnnual(rows)} stack={span < 7} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={height}>
        <div className="legend" style={{ marginBottom: 6 }}>
          <span className="legend-item">
            <span className="swatch" style={{ background: C.s1 }} />
            완료 연도
          </span>
          <span className="legend-item" style={{ color: C.s3 }}>
            <span className="swatch hatched" />
            <span style={{ color: 'var(--ink-2)' }}>부분 연도 (2026)</span>
          </span>
        </div>
        <ColumnChart data={data} unit="기" height={height} labelPolicy="extremes" ariaLabel="연간 충전기 설치 수 막대 그래프" />
      </QueryState>
    </Card>
  );
}

/* ======================= G9 누적 설치 영역 ======================= */
export function CumulativeCard({ span = 5, yearFrom, yearTo, height = 300, stack }: { span?: Span; yearFrom?: number; yearTo?: number; height?: number; stack?: boolean }) {
  const q = useGrowth(yearFrom, yearTo);
  // 최초 10만 기 돌파 같은 '전체 기간' 사실은 구간 필터와 무관한 전체 시계열로 판단
  const full = useGrowth(undefined, undefined);
  const rows = q.data?.data ?? [];
  const fullRows = full.data?.data ?? [];
  return (
    <Card
      no={9}
      span={span}
      title="연도별 누적 충전기 설치 추이"
      sub="영역 그래프. 점선과 음영 띠는 2026년 부분 연도입니다."
      scope={{ kind: 'filtered', label: '연도 구간' }}
      isFetching={q.isFetching && !q.isLoading}
      detail={{
        chart: <CumulativeChart rows={rows} height={460} ariaLabel="누적 충전기 설치 수" />,
        table: <GrowthTable rows={rows} />,
        meta: q.data?.meta,
        staticChartIds: [9],
        note: q.data?.meta.growth_warning,
      }}
      insight={rows.length && fullRows.length ? <Insight {...insightCumulative(rows, fullRows)} stack={stack} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={height}>
        <CumulativeChart rows={rows} height={height} ariaLabel="누적 충전기 설치 수 영역 그래프" />
      </QueryState>
    </Card>
  );
}

/* ======================= G10 운영기관 트리맵 ======================= */
export function OperatorTreemapCard({ span = 12, height = 380 }: { span?: Span; height?: number }) {
  const { chargerParams, state, update, activeChargerCount } = useFilters();
  // 기관 필터를 걸면 칸이 1개가 되므로 이 그래프는 운영기관 필터를 제외하고 요청하고, 선택 기관은 강조만 합니다.
  const params = { ...chargerParams, operator_id: undefined };
  const q = useOperators(params, 1, 20);
  const rows = q.data?.data ?? [];
  const matched = q.data?.meta.matched?.charger_count ?? 0;
  const combos = q.data?.meta.pagination?.total_items ?? 0;
  const topSum = rows.reduce((s, r) => s + r.charger_count, 0);
  const items: TreeItem[] = [
    ...rows.map((r, i) => ({
      tone: rows.length > 1 ? i / (rows.length - 1) : 0,
      key: `${r.operator_id}|${r.operator_name}`,
      id: r.operator_id,
      name: r.operator_name,
      size: r.charger_count,
      share: matched ? (r.charger_count / matched) * 100 : 0,
    })),
    ...(matched - topSum > 0
      ? [{ key: 'etc', name: `기타 ${fmtInt(Math.max(0, combos - rows.length))}개 조합`, size: matched - topSum, share: ((matched - topSum) / matched) * 100, other: true }]
      : []),
  ];
  const filtered = activeChargerCount - (state.operator ? 1 : 0) > 0;
  return (
    <Card
      no={10}
      span={span}
      title="운영기관별 충전기 규모"
      sub="트리맵: 면적 = 충전기 수. 상위 20개 (기관 ID, 명칭) 조합 + 기타. 칸을 누르면 그 기관 ID로 필터합니다."
      scope={{ kind: 'filtered', label: '지역·유형·삭제 필터' }}
      isFetching={q.isFetching && !q.isLoading}
      detail={{ chart: <OperatorTreemap items={items} height={520} ariaLabel="운영기관별 충전기 트리맵" />, meta: q.data?.meta, staticChartIds: [8] }}
      insight={rows.length ? <Insight {...insightOperators(rows, matched, combos, filtered)} /> : undefined}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={height}>
        <div className="legend" style={{ marginBottom: 8 }}>
          <span className="legend-item">
            <span className="swatch" style={{ width: 54, background: 'linear-gradient(90deg, rgb(216,211,238), rgb(104,97,150))' }} />
            밝을수록 순위가 높은 기관 (면적 = 충전기 수)
          </span>
          <span className="legend-item">
            <span className="swatch" style={{ background: C.other }} />
            기타
          </span>
          <span className="legend-item">
            <span className="swatch" style={{ background: C.s3 }} />
            선택한 기관
          </span>
        </div>
        <OperatorTreemap
          items={items}
          highlightId={state.operator}
          onSelect={(id) => update({ operator: state.operator === id ? undefined : id })}
          height={height}
          ariaLabel="운영기관별 충전기 규모 트리맵"
        />
      </QueryState>
    </Card>
  );
}
