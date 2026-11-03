import { useEffect, useState } from 'react';
import { PageHead } from '../components/layout/AppShell';
import { FilterBar } from '../components/FilterBar';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { DataTable, Pager } from '../components/ui/DataTable';
import { Icon } from '../components/ui/Icon';
import { useChargerOutput, useChargerTypes, useOperators } from '../api/hooks';
import { useFilters } from '../state/filters';
import { fmtInt, fmtKw, fmtPct } from '../lib/format';
import { OperatorTreemapCard, OutputHistCard, StationBoxplotCard, TypesDonutCard } from '../features/ChartCards';

function OperatorTable() {
  const { chargerParams, state, update } = useFilters();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const q = useOperators(chargerParams, page, limit);
  const key = JSON.stringify(chargerParams);
  useEffect(() => setPage(1), [key]);
  const rows = q.data?.data ?? [];
  return (
    <Card
      span={12}
      title="운영기관 목록"
      sub={q.data?.meta.pagination ? `(기관 ID, 명칭) 조합 ${fmtInt(q.data.meta.pagination.total_items)}개, 충전기 수 내림차순` : '충전기 수 내림차순'}
      scope={{ kind: 'filtered' }}
      isFetching={q.isFetching && !q.isLoading}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={300}>
        <DataTable
          caption="운영기관별 충전기"
          rows={rows}
          rowKey={(r) => `${r.operator_id}|${r.operator_name}`}
          isSelected={(r) => r.operator_id === state.operator}
          maxHeight={440}
          columns={[
            { key: 'rank', header: '순위', numeric: true, render: (_r, i) => fmtInt((page - 1) * limit + i + 1) },
            {
              key: 'name',
              header: '운영기관',
              render: (r) => (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ padding: 0, height: 'auto', color: 'var(--ink)' }}
                  onClick={() => update({ operator: state.operator === r.operator_id ? undefined : r.operator_id })}
                  title="이 기관 ID로 필터"
                >
                  {r.operator_name}
                </button>
              ),
            },
            { key: 'id', header: 'ID', render: (r) => <span className="num muted">{r.operator_id}</span> },
            { key: 'cnt', header: '충전기(기)', numeric: true, render: (r) => fmtInt(r.charger_count) },
            { key: 'share', header: '구성비', numeric: true, render: (r) => fmtPct(r.share_pct, 2) },
            { key: 'st', header: '충전소(곳)', numeric: true, render: (r) => fmtInt(r.station_count) },
            { key: 'y', header: '삭제 표시', numeric: true, render: (r) => fmtInt(r.deleted_charger_count) },
          ]}
        />
        {q.data?.meta.pagination && (
          <Pager
            pagination={q.data.meta.pagination}
            onPage={setPage}
            unit="개 조합"
            limit={limit}
            limitOptions={[10, 20, 50, 100]}
            onLimit={(n) => {
              setLimit(n);
              setPage(1);
            }}
            disabled={q.isFetching}
          />
        )}
        <p className="small muted" style={{ marginTop: 8 }}>
          운영기관별 충전소 수는 서로 겹칠 수 있어 합산하지 않습니다.
        </p>
      </QueryState>
    </Card>
  );
}

function Summary() {
  const { chargerParams, state } = useFilters();
  const types = useChargerTypes(chargerParams);
  const out = useChargerOutput(chargerParams);
  const m = types.data?.meta.matched;
  const st = out.data?.meta.output_statistics;
  const busy = (types.isFetching && !types.isLoading) || (out.isFetching && !out.isLoading);
  const items = [
    { label: '충전기', value: m ? fmtInt(m.charger_count) : '—', unit: '기' },
    { label: '고유 충전소', value: m ? fmtInt(m.station_count) : '—', unit: '곳' },
    { label: '충전소당 평균', value: m && m.station_count ? (m.charger_count / m.station_count).toFixed(2) : '—', unit: '기' },
    { label: '삭제 표시', value: m ? fmtInt(m.deleted_charger_count) : '—', unit: '기' },
    { label: '출력 중앙값', value: st ? fmtKw(st.median_kw) : '—', unit: '' },
    { label: '출력 결측·무효', value: st ? fmtInt(st.invalid_or_missing_count) : '—', unit: '기' },
  ];
  return (
    <Card span={12} title="선택 조건 요약" sub="필터와 일치하는 충전기 집합 (meta.matched, meta.output_statistics)" scope={{ kind: 'filtered' }} isFetching={busy}>
      <QueryState isLoading={types.isLoading} error={types.error ?? out.error} onRetry={() => (types.refetch(), out.refetch())} height={84}>
        <div className="stats">
          {items.map((i) => (
            <div className="stat" key={i.label}>
              <div className="stat-label">{i.label}</div>
              <div className="stat-value">
                {i.value}
                {i.unit && <small>{i.unit}</small>}
              </div>
            </div>
          ))}
        </div>
        {m && m.charger_count === 0 && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            <Icon name="alert" />
            <div>
              선택한 조건과 일치하는 충전기가 없습니다.
              {state.type === '09' && ' 09 NACS는 공식 정의는 있지만 현재 자료에서 관측된 충전기가 0건입니다.'}
            </div>
          </div>
        )}
      </QueryState>
    </Card>
  );
}

function TypeShareTable() {
  const { chargerParams, state, update } = useFilters();
  const q = useChargerTypes(chargerParams);
  const rows = [...(q.data?.data ?? [])].sort((a, b) => b.charger_count - a.charger_count);
  return (
    <Card span={7} className="card-table-fill" title="유형별 상세" sub="코드를 누르면 유형 필터가 바뀝니다. 구성비 분모는 같은 요청의 필터 일치 충전기입니다." scope={{ kind: 'filtered' }} isFetching={q.isFetching && !q.isLoading}>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!rows.length} height={300}>
        <DataTable
          caption="유형별 충전기 구성"
          rows={rows}
          rowKey={(r) => r.charger_type_code}
          isSelected={(r) => r.charger_type_code === state.type}
          maxHeight={420}
          columns={[
            {
              key: 'c',
              header: '유형',
              render: (r) => (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ padding: 0, height: 'auto', color: 'var(--ink)' }}
                  onClick={() => update({ type: state.type === r.charger_type_code ? undefined : r.charger_type_code })}
                >
                  <span className="num muted" style={{ marginRight: 6 }}>
                    {r.charger_type_code}
                  </span>
                  {r.official_definition}
                </button>
              ),
            },
            { key: 'n', header: '충전기', numeric: true, render: (r) => fmtInt(r.charger_count) },
            {
              key: 's',
              header: '구성비',
              numeric: true,
              render: (r) => (
                <span className="bar-cell">
                  {fmtPct(r.share_pct, 2)}
                  <i style={{ width: Math.max(2, (r.share_pct ?? 0) * 0.7) }} aria-hidden="true" />
                </span>
              ),
            },
            { key: 'st', header: '충전소', numeric: true, render: (r) => fmtInt(r.station_count) },
          ]}
        />
      </QueryState>
    </Card>
  );
}

export function ChargingInfrastructurePage() {
  return (
    <>
      <PageHead
        title="Charging Infrastructure"
        lede="2026년 10월 15일 조회한 충전기 정보를 커넥터 유형, 정격 출력, 운영기관, 충전소 규모로 분석합니다."
      />
      <FilterBar />
      <div className="grid">
        <Summary />
        <TypesDonutCard span={5} size={190} />
        <TypeShareTable />
        <OutputHistCard span={12} />
        <StationBoxplotCard span={12} />
        <OperatorTreemapCard span={12} />
        <OperatorTable />
      </div>
    </>
  );
}
