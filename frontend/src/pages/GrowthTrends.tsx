import { PageHead } from '../components/layout/AppShell';
import { FilterBar } from '../components/FilterBar';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { DataTable } from '../components/ui/DataTable';
import { useGrowth } from '../api/hooks';
import { fmtInt } from '../lib/format';
import type { GrowthRow } from '../api/types';
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
        { key: 'c', header: '누적(기)', numeric: true, render: (r) => fmtInt(r.cumulative_count) },
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
  const yearTo = parse('to');
  const setYear = (k: 'from' | 'to', v?: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === undefined) next.delete(k);
        else next.set(k, String(v));
        return next;
      },
      { replace: true },
    );

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
            className={`select ${yearFrom ? 'is-set' : ''}`}
            value={effFrom}
            onChange={(e) => {
              const v = Number(e.target.value);
              setYear('from', v === MIN_YEAR ? undefined : v);
              if (v > effTo) setYear('to', undefined);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">종료 연도 (year_to)</span>
          <select
            className={`select ${yearTo ? 'is-set' : ''}`}
            value={effTo}
            onChange={(e) => {
              const v = Number(e.target.value);
              setYear('to', v === MAX_YEAR ? undefined : v);
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
                onClick={() => {
                  setParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete('from');
                      next.delete('to');
                      if (p.f) next.set('from', String(p.f));
                      if (p.t) next.set('to', String(p.t));
                      return next;
                    },
                    { replace: true },
                  );
                }}
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
                <div className="stat-label">구간 마지막 연도 누적</div>
                <div className="stat-value">
                  {lastRow ? fmtInt(lastRow.cumulative_count) : '—'}
                  <small>기{lastRow ? `, ${lastRow.year}년${lastRow.is_partial_year ? ' (부분)' : ''}` : ''}</small>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">2026년 부분 연도 설치</div>
                <div className="stat-value">
                  {partial ? fmtInt(partial.annual_installed_count) : '구간 밖'}
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
