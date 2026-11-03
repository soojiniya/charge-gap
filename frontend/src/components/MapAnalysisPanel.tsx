import { useMemo, useState, type ReactNode } from 'react';
import { useChargerOutput, useChargerTypes, useFilterOptions, useOperators, useOverview } from '../api/hooks';
import type { ChargerFilterParams, LocationRow } from '../api/types';
import { DELETION_LABEL, fmtInt, fmtPct } from '../lib/format';
import { C } from '../charts/theme';
import { chargerRegionLabel } from './FilterBar';
import { OUTPUT_BANDS, bandIndex } from '../features/ChartCards';
import { ErrorState } from './ui/QueryState';
import { Icon } from './ui/Icon';

/**
 * 지도 오른쪽 분석 패널. 모든 숫자는 기존 API 응답 값 그대로이며(현재 충전기 필터 적용),
 * 충전소당 평균만 같은 응답의 충전기 수 ÷ 충전소 수로 계산합니다.
 *  - 충전기·충전소 수: /api/overview data.chargers
 *  - 유형 구성: /api/charger-types, 출력 구성: /api/charger-output (히트맵과 같은 구간)
 *  - 주요 운영기관: /api/operators 1쪽 상위 5개 (충전기 수 내림차순)
 *  - 선택한 충전소: /api/locations 행의 필드
 */

interface Props {
  filters: ChargerFilterParams;
  selected: LocationRow | null;
  /** 지도에서 누른 "같은 위치" 충전소 묶음 */
  group?: LocationRow[] | null;
  onPick?: (row: LocationRow) => void;
  onClearGroup?: () => void;
  onClearSelection: () => void;
  onFocusSelected: () => void;
  onClearRegion: () => void;
}

const TOP_OPERATORS = 5;
const TOP_TYPES = 5;

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="geo-panel-section">
      <div className="geo-panel-section-head">
        <h4>{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="geo-skeleton" role="status" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton" style={{ width: `${88 - i * 13}%` }} aria-hidden="true" />
      ))}
      <span className="sr-only">데이터를 불러오는 중입니다</span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="geo-empty">{children}</p>;
}

interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  share: number | null;
  color: string;
}

function BarList({ items, unit }: { items: BarItem[]; unit: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="geo-bars">
      {items.map((i) => (
        <li key={i.key}>
          <div className="geo-bar-label">
            <span className="geo-bar-name">{i.label}</span>
            <span className="num">
              {fmtInt(i.value)}
              {unit} <span className="muted">{fmtPct(i.share)}</span>
            </span>
          </div>
          <span className="geo-bar-track" aria-hidden="true">
            <i style={{ width: `${(i.value / max) * 100}%`, background: i.color }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MapAnalysisPanel({ filters, selected, group, onPick, onClearGroup, onClearSelection, onFocusSelected, onClearRegion }: Props) {
  const opts = useFilterOptions();
  const overview = useOverview(filters);
  const types = useChargerTypes(filters);
  const output = useChargerOutput(filters);
  const operators = useOperators(filters, 1, TOP_OPERATORS);
  const [mix, setMix] = useState<'type' | 'output'>('type');

  const regionName = useMemo(() => {
    if (!filters.region_code) return null;
    const r = opts.data?.charger_regions.find((x) => x.code === filters.region_code);
    return r ? chargerRegionLabel(r.code, r.name) : filters.region_code;
  }, [filters.region_code, opts.data]);
  const typeName = filters.charger_type
    ? opts.data?.charger_types.find((t) => t.code === filters.charger_type)?.name ?? filters.charger_type
    : null;
  // 운영기관 ID 하나에 명칭이 여러 개일 수 있어(API 행 = ID·명칭 조합) 충전기 수가 가장 많은 명칭과 나머지 개수를 함께 표시
  const operatorLabel = useMemo(() => {
    if (!filters.operator_id) return null;
    const names = (operators.data?.data ?? []).filter((o) => o.operator_id === filters.operator_id).map((o) => o.operator_name);
    const total = operators.data?.meta.pagination?.total_items ?? names.length;
    if (!names.length) return filters.operator_id;
    return `${filters.operator_id} ${names[0]}${total > 1 ? ` 외 ${total - 1}개 명칭` : ''}`;
  }, [filters.operator_id, operators.data]);

  const counts = overview.data?.data.chargers;
  const perStation = counts && counts.station_count > 0 ? counts.charger_count / counts.station_count : null;

  const typeItems = useMemo<BarItem[]>(() => {
    const rows = [...(types.data?.data ?? [])].filter((r) => r.charger_count > 0).sort((a, b) => b.charger_count - a.charger_count);
    const palette = [C.s1, C.compare, C.s3, C.s4, C.s2];
    const top = rows.slice(0, TOP_TYPES).map((r, i) => ({
      key: r.charger_type_code,
      label: (
        <>
          <span className="num muted">{r.charger_type_code}</span> {r.official_definition}
        </>
      ),
      value: r.charger_count,
      share: r.share_pct,
      color: palette[i % palette.length],
    }));
    const rest = rows.slice(TOP_TYPES);
    if (rest.length) {
      top.push({
        key: 'other',
        label: <>기타 {rest.length}개 유형</>,
        value: rest.reduce((n, r) => n + r.charger_count, 0),
        share: rest.every((r) => r.share_pct !== null) ? rest.reduce((n, r) => n + (r.share_pct ?? 0), 0) : null,
        color: C.other,
      });
    }
    return top;
  }, [types.data]);

  const outputItems = useMemo<BarItem[]>(() => {
    const rows = output.data?.data ?? [];
    const sums = OUTPUT_BANDS.map(() => 0);
    rows.forEach((r) => {
      sums[bandIndex(r)] += r.charger_count;
    });
    const total = sums.reduce((a, b) => a + b, 0);
    const palette = [C.s2, C.compare, C.s1, C.s3, C.s4, C.other];
    return OUTPUT_BANDS.map((band, i) => ({
      key: band,
      label: band === '미상' ? '미상 (결측·0 이하·숫자 아님)' : /kW/.test(band) ? band : `${band}kW`,
      value: sums[i],
      share: total ? (sums[i] / total) * 100 : null,
      color: palette[i],
    })).filter((x) => x.value > 0);
  }, [output.data]);

  const mixQuery = mix === 'type' ? types : output;
  const mixItems = mix === 'type' ? typeItems : outputItems;
  const operatorRows = operators.data?.data ?? [];
  const operatorTotal = operators.data?.meta.pagination?.total_items;

  return (
    <aside className="geo-panel" aria-label="지도 분석 패널">
      <header className="geo-panel-head">
        <div className="geo-eyebrow">분석 범위</div>
        <div className="geo-panel-title-row">
          <h3 className="geo-panel-title">{regionName ?? '전국'}</h3>
          {filters.region_code && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClearRegion}>
              전국으로
            </button>
          )}
        </div>
        <div className="geo-chips">
          <span className="geo-chip">{typeName ? `유형 ${filters.charger_type} ${typeName}` : '전체 유형'}</span>
          <span className="geo-chip">{filters.deletion && filters.deletion !== 'all' ? DELETION_LABEL[filters.deletion] : '삭제 포함 전체'}</span>
          <span className="geo-chip">{operatorLabel ? `운영기관 ${operatorLabel}` : '전체 운영기관'}</span>
        </div>
      </header>

      {group && group.length > 1 && (
        <section className="geo-panel-section" aria-label="같은 위치의 충전소">
          <div className="geo-panel-section-head">
            <h4>같은 위치의 충전소 {fmtInt(group.length)}곳</h4>
            <button type="button" className="geo-icon-btn" onClick={onClearGroup} aria-label="목록 닫기" title="목록 닫기">
              <Icon name="close" />
            </button>
          </div>
          <ul className="geo-group">
            {group.map((row) => (
              <li key={row.station_id}>
                <button
                  type="button"
                  className="geo-group-item"
                  aria-pressed={selected?.station_id === row.station_id}
                  onClick={() => onPick?.(row)}
                >
                  <span className="geo-bar-name">{row.station_name}</span>
                  <span className="num muted">{fmtInt(row.charger_count)}기</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <section className="geo-panel-section geo-station" aria-label="선택한 충전소">
          <div className="geo-panel-section-head">
            <h4>선택한 충전소</h4>
            <button type="button" className="geo-icon-btn" onClick={onClearSelection} aria-label="충전소 선택 해제" title="선택 해제">
              <Icon name="close" />
            </button>
          </div>
          <div className="geo-station-name">{selected.station_name}</div>
          <div className="geo-station-addr">{selected.address || '주소 정보 없음'}</div>
          <dl className="geo-station-stats">
            <div>
              <dt>일치 충전기</dt>
              <dd className="num">{fmtInt(selected.charger_count)}기</dd>
            </div>
            <div>
              <dt>비삭제</dt>
              <dd className="num">{fmtInt(selected.not_deleted_charger_count)}기</dd>
            </div>
            <div>
              <dt>삭제 표시</dt>
              <dd className="num">{fmtInt(selected.deleted_charger_count)}기</dd>
            </div>
          </dl>
          <dl className="geo-station-meta">
            <div>
              <dt>지역</dt>
              <dd>{chargerRegionLabel(selected.region_code, selected.region_name)}</dd>
            </div>
            <div>
              <dt>충전소 ID</dt>
              <dd className="num">{selected.station_id}</dd>
            </div>
            <div>
              <dt>대표 좌표</dt>
              <dd className="num">
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
              </dd>
            </div>
          </dl>
          <button type="button" className="btn btn-sm" onClick={onFocusSelected}>
            지도에서 위치 보기
          </button>
        </section>
      )}

      <Section title="충전 인프라 요약" aside={overview.isFetching && !overview.isLoading ? <span className="muted small">갱신 중</span> : undefined}>
        {overview.isLoading ? (
          <LoadingRows rows={3} />
        ) : overview.error ? (
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} height={120} />
        ) : !counts || counts.charger_count === 0 ? (
          <Empty>현재 필터와 일치하는 충전기가 없습니다. 필터를 바꾸거나 초기화해 보세요.</Empty>
        ) : (
          <>
            <div className="geo-kpis">
              <div className="geo-kpi">
                <div className="geo-kpi-label">충전기</div>
                <div className="geo-kpi-value num">
                  {fmtInt(counts.charger_count)}
                  <small>기</small>
                </div>
              </div>
              <div className="geo-kpi">
                <div className="geo-kpi-label">충전소</div>
                <div className="geo-kpi-value num">
                  {fmtInt(counts.station_count)}
                  <small>곳</small>
                </div>
              </div>
              <div className="geo-kpi geo-kpi-wide">
                <div className="geo-kpi-label">충전소당 평균</div>
                <div className="geo-kpi-value num">
                  {perStation === null ? '—' : perStation.toFixed(2)}
                  <small>기</small>
                </div>
              </div>
            </div>
            <div className="geo-split" aria-label="삭제 표시 상태 구성">
              <span className="geo-split-bar" aria-hidden="true">
                <i style={{ width: `${(counts.not_deleted_charger_count / counts.charger_count) * 100}%` }} />
              </span>
              <span className="small">
                비삭제 <b className="num">{fmtInt(counts.not_deleted_charger_count)}</b> · 삭제 표시{' '}
                <b className="num">{fmtInt(counts.deleted_charger_count)}</b>기
              </span>
            </div>
            <p className="geo-note">충전소당 평균 = 충전기 수 ÷ 충전소 수 (같은 응답 값으로 계산)</p>
          </>
        )}
      </Section>

      <Section
        title={mix === 'type' ? '충전기 유형 구성' : '충전기 출력 구성'}
        aside={
          <div className="segmented geo-mini-seg" role="group" aria-label="구성 기준">
            <button type="button" aria-pressed={mix === 'type'} onClick={() => setMix('type')}>
              유형
            </button>
            <button type="button" aria-pressed={mix === 'output'} onClick={() => setMix('output')}>
              출력
            </button>
          </div>
        }
      >
        {mixQuery.isLoading ? (
          <LoadingRows />
        ) : mixQuery.error ? (
          <ErrorState error={mixQuery.error} onRetry={() => mixQuery.refetch()} height={120} />
        ) : !mixItems.length ? (
          <Empty>표시할 구성 데이터가 없습니다.</Empty>
        ) : (
          <BarList items={mixItems} unit="기" />
        )}
      </Section>

      <Section
        title="주요 운영기관"
        aside={operatorTotal !== undefined ? <span className="muted small num">전체 {fmtInt(operatorTotal)}개 중 상위</span> : undefined}
      >
        {operators.isLoading ? (
          <LoadingRows />
        ) : operators.error ? (
          <ErrorState error={operators.error} onRetry={() => operators.refetch()} height={120} />
        ) : !operatorRows.length ? (
          <Empty>현재 필터와 일치하는 운영기관이 없습니다.</Empty>
        ) : (
          <BarList
            unit="기"
            items={operatorRows.map((o) => ({
              key: JSON.stringify([o.operator_id, o.operator_name]),
              label: (
                <>
                  {o.operator_name} <span className="num muted">{o.operator_id}</span>
                </>
              ),
              value: o.charger_count,
              share: o.share_pct,
              color: C.s1,
            }))}
          />
        )}
      </Section>

      {!selected && <p className="geo-hint">지도에서 충전소를 누르거나 아래 충전소 목록의 “지도” 버튼을 누르면 이곳에 상세 정보가 표시됩니다.</p>}
    </aside>
  );
}
