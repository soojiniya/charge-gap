import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFilterOptions } from '../api/hooks';
import type { DeletionFilter } from '../api/types';
import { useFilters } from '../state/filters';
import { DELETION_LABEL, fmtInt } from '../lib/format';
import { OperatorPicker } from './ui/OperatorPicker';
import { Icon } from './ui/Icon';

/** 12번 지역은 현 행정체계 명칭 + 통합 사실을 함께 표시 */
export const chargerRegionLabel = (code: string, name: string) =>
  code === '12' ? `${name} (광주+전남 통합)` : name;

export function FilterBar({ charger = true, children }: { charger?: boolean; children?: ReactNode }) {
  const { state, update, resetCharger, activeChargerCount } = useFilters();
  const opts = useFilterOptions();
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck((ref.current?.getBoundingClientRect().top ?? 1) <= 0.5);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={ref} className={`filterbar ${stuck ? 'stuck' : ''}`} role="search" aria-label="데이터 필터">
      {charger && (
        <>
          <label className="field">
            <span className="field-label">충전기 지역 (2026 기준 16개)</span>
            <select
              className={`select ${state.region ? 'is-set' : ''}`}
              value={state.region ?? ''}
              onChange={(e) => update({ region: e.target.value || undefined })}
              disabled={!opts.data}
            >
              <option value="">전국</option>
              {opts.data?.charger_regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {chargerRegionLabel(r.code, r.name)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">충전기 유형</span>
            <select
              className={`select ${state.type ? 'is-set' : ''}`}
              value={state.type ?? ''}
              onChange={(e) => update({ type: e.target.value || undefined })}
              disabled={!opts.data}
            >
              <option value="">전체 유형</option>
              {opts.data?.charger_types.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} {t.name} ({t.observed_charger_count === 0 ? '관측 0건' : `${fmtInt(t.observed_charger_count)}기`})
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span className="field-label" id="deletion-label">
              삭제 표시 상태
            </span>
            <div className="segmented" role="group" aria-labelledby="deletion-label">
              {(opts.data?.deletion ?? (['all', 'not_deleted', 'deleted'] as DeletionFilter[])).map((d) => (
                <button key={d} type="button" aria-pressed={state.deletion === d} onClick={() => update({ deletion: d })}>
                  {d === 'all' ? '전체' : DELETION_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">운영기관</span>
            <OperatorPicker value={state.operator} onChange={(id) => update({ operator: id })} />
          </div>
        </>
      )}
      {children}
      {charger && (
        <button type="button" className="btn btn-ghost" onClick={resetCharger} disabled={activeChargerCount === 0}>
          <Icon name="reset" /> 필터 초기화{activeChargerCount ? ` (${activeChargerCount})` : ''}
        </button>
      )}
      {opts.error && <span className="small" style={{ color: 'var(--critical)' }}>필터 선택지를 불러오지 못했습니다.</span>}
    </div>
  );
}

/** 2026-09 등록자료의 16개 지역 선택, 전남광주=12. */
export function EvRegionSelect({ label = '등록 지역 (2026-09 기준 16개)' }: { label?: string }) {
  const { state, update } = useFilters();
  const opts = useFilterOptions();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className={`select ${state.evRegion ? 'is-set' : ''}`}
        value={state.evRegion ?? ''}
        onChange={(e) => update({ evRegion: e.target.value || undefined })}
        disabled={!opts.data}
      >
        <option value="">전국</option>
        {opts.data?.ev_regions.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
