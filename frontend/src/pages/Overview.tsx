import { PageHead } from '../components/layout/AppShell';
import { EvRegionSelect, FilterBar } from '../components/FilterBar';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { RegionSystemNote } from '../components/DataNotes';
import { ReportGallery } from '../components/ReportGallery';
import { Icon } from '../components/ui/Icon';
import { C } from '../charts/theme';
import { useBaseOverview, useOverview } from '../api/hooks';
import { useFilters } from '../state/filters';
import { fmtInt, fmtPct } from '../lib/format';
import { CountUp } from '../lib/motion';
import { CumulativeCard, EvRegionsCard, StationChargerCard, TypesDonutCard } from '../features/ChartCards';

/** 두 자료의 기준 시점을 한 줄로 (기존의 높은 타임라인 카드를 축소) */
function TimeStrip() {
  const base = useBaseOverview();
  const src = base.data?.meta.sources;
  return (
    <div className="timestrip span-12" aria-label="자료 기준 시점">
      <div className="timestrip-end">
        전기차 등록 자료 (16개 시도)
        <b>{src?.ev_registration?.reference_month ?? '—'}</b>
      </div>
      <div className="timestrip-gap" aria-hidden="true">
        <span>등록 기준월과 충전기 조회일이 달라 두 자료를 서로 나누지 않습니다</span>
      </div>
      <div className="timestrip-end right">
        충전기 정보 조회 (16개 시도)
        <b>{src?.chargers?.snapshot_date ?? '—'}</b>
      </div>
    </div>
  );
}

function Kpis() {
  const { chargerParams, state, activeChargerCount } = useFilters();
  const q = useOverview(chargerParams, state.evRegion);
  const base = useBaseOverview();
  const d = q.data?.data;
  const nat = d?.national_snapshot_totals;
  const evName = base.data?.meta.filter_options.ev_regions.find((r) => r.code === state.evRegion)?.name;
  const busy = q.isFetching && !q.isLoading;
  const tile = (key: string, title: string, scope: string, body: React.ReactNode) => (
    <Card key={key} span={3} title={title} scope={{ kind: 'filtered', label: scope }} isFetching={busy}>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} height={86}>
        {body}
      </QueryState>
    </Card>
  );
  return (
    <>
      {tile(
        'ev',
        evName ? `전기차 등록 (${evName})` : '전국 전기차 등록',
        '등록 지역',
        d && nat && (
          <div className="kpi point">
            <div className="kpi-value">
              <CountUp value={d.ev_registration.ev_registration_count} format={fmtInt} />
              <small>대</small>
            </div>
            <div className="kpi-meta">
              {evName ? `전국 ${fmtInt(nat.ev_registration_count)}대의 ${fmtPct((d.ev_registration.ev_registration_count / nat.ev_registration_count) * 100)}` : '2026년 9월 기준'}
            </div>
          </div>
        ),
      )}
      {tile(
        'ch',
        activeChargerCount ? '선택한 충전기' : '전국 충전기',
        '충전기 필터',
        d && nat && (
          <div className="kpi compare">
            <div className="kpi-value">
              <CountUp value={d.chargers.charger_count} format={fmtInt} />
              <small>기</small>
            </div>
            <div className="kpi-meta">
              {activeChargerCount ? `전국 ${fmtInt(nat.charger_count)}기의 ${fmtPct((d.chargers.charger_count / nat.charger_count) * 100)}` : '삭제 표시 포함, 2026-10-15 조회'}
            </div>
          </div>
        ),
      )}
      {tile(
        'st',
        activeChargerCount ? '선택한 충전소' : '전국 충전소',
        '충전기 필터',
        d && nat && (
          <div className="kpi">
            <div className="kpi-value">
              <CountUp value={d.chargers.station_count} format={fmtInt} />
              <small>곳</small>
            </div>
            <div className="kpi-meta">
              충전소당 평균 {d.chargers.station_count ? (d.chargers.charger_count / d.chargers.station_count).toFixed(2) : '—'}기 (같은 조회 시점)
            </div>
          </div>
        ),
      )}
      {tile(
        'del',
        '삭제 표시 충전기',
        '충전기 필터',
        d && (
          <div className="kpi">
            <div className="kpi-value">
              <CountUp value={d.chargers.deleted_charger_count} format={fmtInt} />
              <small>기</small>
            </div>
            <div
              className="meter"
              style={{ marginTop: 6 }}
              role="img"
              aria-label={`비삭제 표시 ${fmtInt(d.chargers.not_deleted_charger_count)}기, 삭제 표시 ${fmtInt(d.chargers.deleted_charger_count)}기`}
            >
              {d.chargers.not_deleted_charger_count > 0 && <span style={{ flex: d.chargers.not_deleted_charger_count, background: C.s1 }} />}
              {d.chargers.deleted_charger_count > 0 && <span style={{ flex: d.chargers.deleted_charger_count, background: C.s3 }} />}
            </div>
            <div className="kpi-meta">
              비삭제 표시 {fmtInt(d.chargers.not_deleted_charger_count)}기, 삭제 표시 비율{' '}
              {fmtPct(d.chargers.charger_count ? (d.chargers.deleted_charger_count / d.chargers.charger_count) * 100 : null, 2)}
            </div>
          </div>
        ),
      )}
    </>
  );
}

function NotesCard() {
  const base = useBaseOverview();
  return (
    <Card span={12} title="자료 해석 기준" sub="모든 페이지에 공통으로 적용됩니다">
      <div className="grid" style={{ gap: 22 }}>
        <div className="span-7" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="notice">
            <Icon name="info" />
            <div>
              <strong>등록 대수와 충전기 수는 서로 나누지 않습니다.</strong> 지역 체계는 대응하지만 기준 시점(2026-09와 2026-10-15)이 달라 충전기 1기당 차량 수나
              충전 부족률을 계산하지 않습니다.
            </div>
          </div>
          <QueryState isLoading={base.isLoading} error={base.error} onRetry={() => base.refetch()} height={80}>
            <ul className="note-list">{base.data?.meta.warnings.slice(1).map((w) => <li key={w}>{w}</li>)}</ul>
          </QueryState>
        </div>
        <div className="span-5">
          <RegionSystemNote />
        </div>
      </div>
    </Card>
  );
}

export function OverviewPage() {
  return (
    <>
      <PageHead title="Overview" lede="전국 전기차 등록과 충전 인프라의 핵심 수치, 그리고 대표 그래프 4종을 한 화면에서 봅니다." />
      <FilterBar>
        <EvRegionSelect />
      </FilterBar>
      <div className="grid">
        <TimeStrip />
        <Kpis />
        <CumulativeCard span={7} height={280} />
        <TypesDonutCard span={5} size={180} />
        <StationChargerCard span={7} height={320} />
        <EvRegionsCard span={5} rowHeight={22} />
        <NotesCard />
        <ReportGallery />
      </div>
    </>
  );
}
