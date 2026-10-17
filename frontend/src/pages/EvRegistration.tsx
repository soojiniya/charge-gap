import { useMemo } from 'react';
import { PageHead } from '../components/layout/AppShell';
import { EvRegionSelect, FilterBar } from '../components/FilterBar';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { RegionSystemNote } from '../components/DataNotes';
import { useEvRegistration } from '../api/hooks';
import { useFilters } from '../state/filters';
import { fmtInt, fmtPct } from '../lib/format';
import { EvCommercialCard, EvRegionsCard, EvTable, EvTypesCard } from '../features/ChartCards';

export function EvRegistrationPage() {
  const { state, update } = useFilters();
  const sel = useEvRegistration(state.evRegion);
  const all = useEvRegistration(undefined);
  const selRows = sel.data?.data ?? [];
  const allRows = all.data?.data ?? [];
  const nationalTotal = all.data?.meta.totals.ev_registration_count;
  const s = useMemo(
    () =>
      selRows.reduce(
        (a, r) => ({
          total: a.total + r.ev_registration_count,
          p: a.p + r.ev_passenger_count,
          t: a.t + r.ev_truck_count,
          b: a.b + r.ev_bus_count,
          sp: a.sp + r.ev_special_count,
          c: a.c + r.ev_commercial_count,
        }),
        { total: 0, p: 0, t: 0, b: 0, sp: 0, c: 0 },
      ),
    [selRows],
  );
  const selName = state.evRegion ? selRows[0]?.region_name_2025 ?? state.evRegion : '전국';
  const stats = [
    { label: '등록 합계', value: s.total, note: state.evRegion && nationalTotal ? `전국의 ${fmtPct((s.total / nationalTotal) * 100)}` : '2025년 12월' },
    { label: '승용', value: s.p, note: fmtPct(s.total ? (s.p / s.total) * 100 : null) },
    { label: '화물', value: s.t, note: fmtPct(s.total ? (s.t / s.total) * 100 : null) },
    { label: '승합', value: s.b, note: fmtPct(s.total ? (s.b / s.total) * 100 : null) },
    { label: '특수', value: s.sp, note: fmtPct(s.total ? (s.sp / s.total) * 100 : null, 2) },
    { label: '사업용', value: s.c, note: fmtPct(s.total ? (s.c / s.total) * 100 : null) },
  ];

  return (
    <>
      <PageHead
        title="EV Registration"
        lede="2025년 12월 자동차 등록자료의 전기차(하이브리드·수소전기 제외)를 지역, 차종, 사업용 구분으로 분석합니다."
      />
      <FilterBar charger={false}>
        <EvRegionSelect label="지역 (2025 기준 17개, 광주·전남 분리)" />
        {state.evRegion && (
          <button type="button" className="btn btn-ghost" onClick={() => update({ evRegion: undefined })}>
            전국으로 보기
          </button>
        )}
      </FilterBar>

      <div className="grid">
        <Card span={12} title={`${selName} 등록 요약`} scope={{ kind: 'filtered', label: '등록 지역' }} isFetching={sel.isFetching && !sel.isLoading}>
          <QueryState isLoading={sel.isLoading} error={sel.error} onRetry={() => sel.refetch()} isEmpty={!selRows.length} height={84}>
            <div className="stats">
              {stats.map((st) => (
                <div className="stat" key={st.label}>
                  <div className="stat-label">{st.label}</div>
                  <div className="stat-value">
                    {fmtInt(st.value)}
                    <small>대</small>
                  </div>
                  <div className="small muted">{st.note}</div>
                </div>
              ))}
            </div>
          </QueryState>
        </Card>

        <EvRegionsCard span={7} />
        <EvTypesCard span={5} />
        <EvCommercialCard span={12} />

        <Card span={8} title="지역별 등록 현황 표" sub="/api/ev-registration 응답 전체" scope={{ kind: 'fixed', label: '전국 17개 지역' }}>
          <QueryState isLoading={all.isLoading} error={all.error} onRetry={() => all.refetch()} isEmpty={!allRows.length} height={300}>
            <EvTable rows={allRows} selected={state.evRegion} />
          </QueryState>
        </Card>
        <Card span={4} title="지역 체계" sub="광주·전남 통합 기준">
          <RegionSystemNote compact />
          <p className="small" style={{ marginTop: 14, color: 'var(--ink-2)' }}>
            이 페이지의 지역은 2025년 등록자료의 17개 시도 코드입니다. 광주(29)와 전남(46)을 각각 선택할 수 있지만, 충전기 페이지의
            전남광주통합특별시(12)와 같은 지역이나 같은 시점으로 비교하지 않습니다.
          </p>
        </Card>
      </div>
    </>
  );
}
