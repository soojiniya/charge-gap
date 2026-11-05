import { PageHead } from '../components/layout/AppShell';
import { FilterBar } from '../components/FilterBar';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { DataTable } from '../components/ui/DataTable';
import { useGrowth } from '../api/hooks';
import { fmtInt } from '../lib/format';
import type { GrowthRow } from '../api/types';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnnualCard, CumulativeCard } from '../features/ChartCards';

const MIN_YEAR = 2011;
const MAX_YEAR = 2026;

function GrowthTable({ rows }: { rows: GrowthRow[] }) {
  return (
    <DataTable
      caption="연도별 충전기 설치 통계"
      rows={rows}
      rowKey={(r) => String(r.year)}
      columns={[
        { key: 'y', header: '연도', render: (r) => <span className="num">{r.year}</span> },
        { key: 'a', header: '연간 설치(기)', numeric: true, render: (r) => fmtInt(r.annual_installed_count) },
        { key: 'c', header: '누적(기, 2011년부터)', numeric: true, render: (r) => fmtInt(r.cumulative_count) },
        {
          key: 'p',
          header: '구분',
          render: (r) => (r.is_partial_year ? <span className="badge partial">부분 연도</span> : <span className="badge">완료 연도</span>),
        },
        { key: 'cut', header: '집계 마감일', render: (r) => <span className="muted">{r.measurement_cutoff_date ?? '미기재'}</span> },
      ]}
    />
  );
}

export function GrowthTrendsPage() {
  const [params, setParams] = useSearchParams();
  const parse = (k: string) => {
    const n = Number(params.get(k));
    return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR ? n : undefined;
  };
  const yearFrom = parse('from');
  const rawTo = parse('to');
  // 시작 연도가 종료 연도보다 늦은 주소(?from=2024&to=2020)는 종료 연도를 무시하고 주소도 정리합니다.
  const invalidRange = yearFrom !== undefined && rawTo !== undefined && rawTo < yearFrom;
  const yearTo = invalidRange ? undefined : rawTo;
  // 두 값을 한 번의 주소 갱신으로 바꿉니다(연속 호출하면 뒤 호출이 앞의 변경을 덮어씀).
  const setRange = (patch: { from?: number | null; to?: number | null }) =>
    setParams(
      (prev) => {
        // 화면이 다시 그려지기 전에 연달아 바꿔도(전환 렌더링 중) 앞의 변경을 잃지 않도록 실제 주소를 기준으로 합니다.
        const next = new URLSearchParams(typeof window === 'undefined' ? prev : window.location.search);
        for (const [k, v] of Object.entries(patch) as ['from' | 'to', number | null | undefined][]) {
          if (v === undefined) continue;
          if (v === null) next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      },
      { replace: true },
    );
  // 범위 밖·숫자가 아닌 연도(?from=1999, ?to=abc)도 주소에서 지워 화면과 주소가 같은 구간을 가리키게 합니다.
  const badFrom = params.has('from') && yearFrom === undefined;
  const badTo = params.has('to') && rawTo === undefined;
  useEffect(() => {
    if (invalidRange || badFrom || badTo) setRange({ ...(badFrom ? { from: null } : {}), ...(invalidRange || badTo ? { to: null } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidRange, badFrom, badTo]);

  const q = useGrowth(yearFrom, yearTo);
  const rows = q.data?.data ?? [];
  const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);
  const effFrom = yearFrom ?? MIN_YEAR;
  const effTo = yearTo ?? MAX_YEAR;

  const complete = rows.filter((r) => !r.is_partial_year);
  const peak = complete.reduce<GrowthRow | null>((m, r) => (!m || r.annual_installed_count > m.annual_installed_count ? r : m), null);
  const partial = rows.find((r) => r.is_partial_year);
  const lastRow = rows[rows.length - 1];

  return (
    <>
      <PageHead
        title="Growth Trends"
        lede="원본 통계 파일의 2011–2026년 전국 연간 설치 수와 누적 수입니다. 2026년은 부분 연도입니다."
      />
      <FilterBar charger={false}>
        <label className="field">
          <span className="field-label">시작 연도 (year_from)</span>
          <select
            className={`select cg-menu-select cg-year-select ${yearFrom ? 'is-set' : ''}`}
            value={effFrom}
            onChange={(e) => {
              const v = Number(e.target.value);
              // 목록에는 종료 연도 이하만 있으므로 구간이 뒤집히지 않고, 종료 연도도 그대로 유지됩니다.
              setRange({ from: v === MIN_YEAR ? null : v });
            }}
          >
            {/* 시작 연도는 현재 종료 연도 이하, 종료 연도는 현재 시작 연도 이상만 표시(같은 연도 허용) */}
            {years
              .filter((y) => y <= effTo)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">종료 연도 (year_to)</span>
          <select
            className={`select cg-menu-select cg-year-select ${yearTo ? 'is-set' : ''}`}
            value={effTo}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRange({ to: v === MAX_YEAR ? null : v });
            }}
          >
            {years
              .filter((y) => y >= effFrom)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y === 2026 ? ' (부분)' : ''}
                </option>
              ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">빠른 선택</span>
          <div className="segmented" role="group" aria-label="연도 구간 빠른 선택">
            {[
              { label: '전체', f: undefined, t: undefined },
              { label: '2020 이후', f: 2020, t: undefined },
              { label: '완료 연도만', f: undefined, t: 2025 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={yearFrom === p.f && yearTo === p.t}
                onClick={() => setRange({ from: p.f ?? null, to: p.t ?? null })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </FilterBar>

      <div className="grid">
        <Card span={12} title={`${effFrom}–${effTo}년 요약`} sub="원본 통계 값 그대로" scope={{ kind: 'filtered', label: '연도 구간' }} isFetching={q.isFetching && !q.isLoading}>
          <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={84}>
            <div className="stats">
              <div className="stat">
                <div className="stat-label">연간 설치 최댓값 (완료 연도)</div>
                <div className="stat-value">
                  {peak ? fmtInt(peak.annual_installed_count) : '—'}
                  <small>기{peak ? `, ${peak.year}년` : ''}</small>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">구간 마지막 연도 누적 (2011년부터)</div>
                <div className="stat-value">
                  {lastRow ? fmtInt(lastRow.cumulative_count) : '—'}
                  <small>기{lastRow ? `, ${lastRow.year}년${lastRow.is_partial_year ? ' (부분)' : ''}` : ''}</small>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">{MAX_YEAR}년 부분 연도 설치</div>
                <div className={`stat-value ${partial ? '' : 'is-excluded'}`}>
                  {partial ? fmtInt(partial.annual_installed_count) : '선택 구간에서 제외'}
                  {partial && <small>기</small>}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">포함 연도</div>
                <div className="stat-value">
                  {fmtInt(rows.length)}
                  <small>개 연도</small>
                </div>
              </div>
            </div>
          </QueryState>
        </Card>

        <AnnualCard span={6} yearFrom={yearFrom} yearTo={yearTo} height={300} />
        <CumulativeCard span={6} yearFrom={yearFrom} yearTo={yearTo} height={322} stack />

        <Card span={12} title="연도별 통계 표" sub="/api/growth 응답. 2026년은 집계 마감일이 기재되지 않은 부분 연도입니다." scope={{ kind: 'filtered', label: '연도 구간' }}>
          <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={300}>
            <GrowthTable rows={rows} />
          </QueryState>
        </Card>
      </div>
    </>
  );
}
