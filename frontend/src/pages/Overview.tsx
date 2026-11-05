import { PageHead } from '../components/layout/AppShell';
import { EvRegionSelect, FilterBar } from '../components/FilterBar';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { RegionSystemNote } from '../components/DataNotes';
import { Icon } from '../components/ui/Icon';
import { Link, useLocation } from 'react-router-dom';
import { DATA_SOURCES, GROWTH_REVISION_NOTE, GROWTH_SNAPSHOT_NOTE } from '../analysis/dataSources';
import { C } from '../charts/theme';
import { useBaseOverview, useOverview } from '../api/hooks';
import { filterSearch, useFilters } from '../state/filters';
import { fmtInt, fmtPct } from '../lib/format';
import { CountUp } from '../lib/motion';
import { CumulativeCard, EvRegionsCard, StationChargerCard, TypesDonutCard } from '../features/ChartCards';
import { KeyFindingsSection } from '../features/KeyFindings';

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

/** Python 데이터 시각화 그래프(고정 PNG 10개)는 별도 페이지로 옮겼습니다. Overview에는 바로가기만 둡니다. */
function PythonChartsShortcut() {
  const search = filterSearch(useLocation().search);
  return (
    <Card span={12} className="pyc-shortcut" title="Python 데이터 시각화 그래프" sub="Matplotlib·Seaborn으로 그린 고정 PNG 10개는 별도 페이지에서 확대 보기·분석 결과·해석 주의와 함께 볼 수 있습니다." scope={{ kind: 'fixed', label: '고정 PNG · 필터 무관' }}>
      <Link className="btn pyc-shortcut-link" to={{ pathname: '/python-visualization', search }}>
        <Icon name="image" /> Python Visualization 페이지로 이동
      </Link>
    </Card>
  );
}

function NotesCard() {
  const base = useBaseOverview();
  return (
    <Card span={12} className="notes-card" title="자료 해석 기준" sub="모든 페이지에 공통으로 적용됩니다">
      <div className="notes-grid">
        <section className="notes-block" aria-labelledby="notes-basis">
          <h3 id="notes-basis" className="notes-block-title">
            <Icon name="info" /> 기준 시점과 비교 원칙
          </h3>
          <dl className="notes-dates">
            <div>
              <dt>전기차 등록</dt>
              <dd className="num">2026-09</dd>
            </div>
            <div>
              <dt>충전기 조회</dt>
              <dd className="num">2026-10-15</dd>
            </div>
          </dl>
          <p className="notes-text">
            <strong className="line-block">등록 대수와 충전기 수는 서로 나누지 않습니다. </strong>
            <span className="line-block">
              지역 체계는 대응하지만 기준 시점(2026-09와 2026-10-15)이 달라 충전기 1기당 차량 수나 충전 부족률을 계산하지 않습니다.
            </span>
          </p>
        </section>
        <section className="notes-block" aria-labelledby="notes-regions">
          <h3 id="notes-regions" className="notes-block-title">
            <Icon name="map" /> 지역 체계
          </h3>
          <RegionSystemNote />
        </section>
        <section className="notes-block" aria-labelledby="notes-cautions">
          <h3 id="notes-cautions" className="notes-block-title">
            <Icon name="alert" /> 주의사항
          </h3>
          <QueryState isLoading={base.isLoading} error={base.error} onRetry={() => base.refetch()} height={80}>
            <ul className="note-list">{base.data?.meta.warnings.slice(1).map((w) => <li key={w}>{w}</li>)}</ul>
          </QueryState>
        </section>
      </div>
      <DataSourcesTable />
    </Card>
  );
}

/** 데이터 출처: 제공기관·작성기관·자료명·자료 기준·수집 시점·이용 조건 (공공누리 제1유형은 공식 확인된 자료에만) */
function DataSourcesTable() {
  const rows = [DATA_SOURCES.ev, DATA_SOURCES.chargers, DATA_SOURCES.growth];
  return (
    <section className="notes-sources" aria-labelledby="notes-sources">
      <h3 id="notes-sources" className="notes-sources-title">
        <Icon name="database" /> 데이터 출처
      </h3>
      <div className="table-wrap">
        <table className="table notes-sources-table">
          <caption className="sr-only">데이터 출처와 이용 조건</caption>
          <thead>
            <tr>
              <th scope="col">자료</th>
              <th scope="col">제공기관 · 작성기관</th>
              <th scope="col">자료명</th>
              <th scope="col">자료 기준</th>
              <th scope="col">수집 시점</th>
              <th scope="col">이용 조건</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td data-label="제공기관 · 작성기관">
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.provider}
                  </a>
                  {'platform' in r && r.platform ? ` (${r.platform})` : ''}
                  <span className="muted"> · 작성기관 {r.author}</span>
                </td>
                <td data-label="자료명">{r.dataset}</td>
                <td data-label="자료 기준">{r.basis}</td>
                <td data-label="수집 시점">
                  {r.collectedLabel} <span className="notes-sources-date">{r.collected}</span>
                </td>
                <td data-label="이용 조건">
                  <span className={`license-tag ${r.license.confirmed ? 'is-confirmed' : 'is-pending'}`}>{r.license.text}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="notes-text small">
        {GROWTH_SNAPSHOT_NOTE.replace('이 그래프는', '설치 추이 그래프는')} {GROWTH_REVISION_NOTE} 수집 시점의 ‘파일 저장’은 원본 파일을 저장한 날짜이며 공식 다운로드 기록이 아닙니다.
      </p>
    </section>
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
        <KeyFindingsSection />
        <CumulativeCard span={7} height={280} />
        <TypesDonutCard span={5} size={180} />
        <StationChargerCard span={7} height={320} />
        <EvRegionsCard span={5} rowHeight={22} />
        <NotesCard />
        <PythonChartsShortcut />
      </div>
    </>
  );
}
