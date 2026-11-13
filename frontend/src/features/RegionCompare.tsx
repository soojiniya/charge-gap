/**
 * Regional Explorer: 두 지역 비교.
 * - 지역 A(흰색)·B(회색)를 URL cmp_a·cmp_b로 저장합니다. 잘못된 값은 URL에서 지우고, 같은 지역이면 B를 비우고 안내합니다.
 * - 전기차 등록(2026-09)과 충전기(2026-10-15)는 각각 같은 기준일 자료끼리만 비교합니다.
 * - 기존 API와 React Query 캐시를 그대로 씁니다. 지역별 출력 요청은 출력 히트맵(그래프 8)과 같은 캐시 키를 공유합니다.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Insight } from '../components/ui/Insight';
import { QueryState } from '../components/ui/QueryState';
import { Icon } from '../components/ui/Icon';
import { NoRatioNotice } from '../components/DataNotes';
import { chargerRegionLabel } from '../components/FilterBar';
import { useChargerOutput, useChargerRegions, useChargerTypes, useEvRegistration, useFilterOptions, useOperators } from '../api/hooks';
import { REGION_CODES, useFilters } from '../state/filters';
import { DELETION_LABEL, fmtInt } from '../lib/format';
import type { ChargerFilterParams } from '../api/types';
import {
  COMPARE_KEYS,
  compareChargers,
  compareEv,
  compareName,
  fmtP,
  fmtPp,
  fmtRank,
  fmtTimes,
  insightChargerCompare,
  insightEvCompare,
  outputMix,
  outputSide,
  parseCompareParams,
  ppDiff,
  times,
  topOperators,
  typeMix,
  type MixRow,
} from '../analysis/regionCompare';

/* ---------------- URL 상태 ---------------- */

export function useCompareRegions() {
  const [params, setParams] = useSearchParams();
  const { a, b, remove, same } = useMemo(() => parseCompareParams(params, REGION_CODES), [params]);
  // 같은 지역이 URL로 들어온 경우 B를 지운 뒤에도 안내를 유지합니다(사용자가 다시 고르면 해제).
  const [sameNotice, setSameNotice] = useState(false);
  const removeKey = remove.join(',');

  // 잘못된 값(허용되지 않은 코드·빈 값)과 A와 같은 B는 URL에서 지웁니다(뒤로 가기 기록을 늘리지 않음).
  useEffect(() => {
    if (same) setSameNotice(true);
    if (!removeKey) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        removeKey.split(',').forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );
  }, [removeKey, same, setParams]);

  const write = (patch: Partial<Record<'a' | 'b', string | undefined>>) => {
    setSameNotice(false);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        (Object.keys(patch) as ('a' | 'b')[]).forEach((k) => {
          const v = patch[k];
          if (v) next.set(COMPARE_KEYS[k], v);
          else next.delete(COMPARE_KEYS[k]);
        });
        return next;
      },
      { replace: true },
    );
  };
  return {
    a,
    b,
    same: same || sameNotice,
    set: (key: 'a' | 'b', value: string | undefined) => write({ [key]: value }),
    swap: () => write({ a: b, b: a }),
    clear: () => write({ a: undefined, b: undefined }),
  };
}

/* ---------------- 작은 표시 요소 ---------------- */

function SideTag({ side, name }: { side: 'a' | 'b'; name: string }) {
  return (
    <span className={`cmp-tag cmp-${side}`}>
      <span className="cmp-dot" aria-hidden="true" />
      <span className="cmp-tag-key">{side.toUpperCase()}</span>
      {name}
    </span>
  );
}

/** 두 값의 상대 크기 막대 (장식: 수치는 바로 옆 텍스트와 표에 있음) */
function DuoBars({ label, a, b, va, vb, na, nb }: { label: string; a: string; b: string; va: number; vb: number; na: string; nb: string }) {
  const max = Math.max(va, vb);
  const w = (v: number) => (max > 0 ? `${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%` : '0%');
  return (
    <figure className="cmp-duo" aria-label={`${label}: ${na} ${a}, ${nb} ${b}`}>
      <figcaption className="cmp-duo-label">{label}</figcaption>
      {(
        [
          ['a', na, a, va],
          ['b', nb, b, vb],
        ] as const
      ).map(([side, n, text, v]) => (
        <div key={side} className={`cmp-duo-row cmp-${side}`} aria-hidden="true">
          <span className="cmp-duo-name">{n}</span>
          <span className="cmp-duo-track">
            <i style={{ width: w(v) }} />
          </span>
          <span className="cmp-duo-val num">{text}</span>
        </div>
      ))}
    </figure>
  );
}

/**
 * 좁은 화면에서 표가 넘치면 가로 스크롤을 허용하되, 스크롤할 수 있다는 사실을 알립니다.
 * - 넘칠 때만: 안내 문구(스크린리더에도 읽힘) + 아직 보지 않은 쪽 가장자리 그림자
 * - 키보드: 표 영역에 포커스를 줄 수 있어 화살표 키로 스크롤
 */
function ScrollTable({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [state, setState] = useState({ overflow: false, start: true, end: true });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const overflow = el.scrollWidth - el.clientWidth > 1;
      const start = el.scrollLeft <= 1;
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      setState((p) => (p.overflow === overflow && p.start === start && p.end === end ? p : { overflow, start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);
  const cls = ['cmp-scroll', state.overflow && 'is-overflow', state.overflow && !state.start && 'fade-start', state.overflow && !state.end && 'fade-end']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      {state.overflow && (
        <p className="cmp-scroll-hint" id={hintId}>
          <span aria-hidden="true">↔</span> 표를 옆으로 밀면 나머지 열을 볼 수 있습니다.
        </p>
      )}
      <div
        ref={ref}
        className="table-wrap cmp-table-wrap"
        tabIndex={state.overflow ? 0 : undefined}
        role={state.overflow ? 'region' : undefined}
        aria-label={state.overflow ? `${label} (가로 스크롤)` : undefined}
        aria-describedby={state.overflow ? hintId : undefined}
      >
        {children}
      </div>
    </div>
  );
}

interface MetricRow {
  key: string;
  label: ReactNode;
  a: ReactNode;
  b: ReactNode;
  diff: ReactNode;
}
function MetricTable({ caption, rows, na, nb }: { caption: string; rows: MetricRow[]; na: string; nb: string }) {
  return (
    <ScrollTable label={caption}>
      <table className="table cmp-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">지표</th>
            <th scope="col" className="n">
              <SideTag side="a" name={na} />
            </th>
            <th scope="col" className="n">
              <SideTag side="b" name={nb} />
            </th>
            <th scope="col" className="n">
              차이·배수
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td className="n">{r.a}</td>
              <td className="n">{r.b}</td>
              <td className="n muted">{r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

/** 구성비 비교: 항목마다 A·B 막대와 비중, 차이(%p, B − A) */
function MixTable({ caption, rows, na, nb, unit }: { caption: string; rows: MixRow[]; na: string; nb: string; unit: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a.pct ?? 0, r.b.pct ?? 0]));
  const cell = (side: 'a' | 'b', v: { count: number; pct: number | null }) => (
    <td className={`cmp-mix-cell cmp-${side}`}>
      <span className="cmp-mix-track" aria-hidden="true">
        <i style={{ width: `${((v.pct ?? 0) / max) * 100}%` }} />
      </span>
      <span className="num">{fmtP(v.pct)}</span>
      <span className="num muted cmp-mix-count">
        {fmtInt(v.count)}
        {unit}
      </span>
    </td>
  );
  return (
    <ScrollTable label={caption}>
      <table className="table cmp-table cmp-mix">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">
              <SideTag side="a" name={na} />
            </th>
            <th scope="col">
              <SideTag side="b" name={nb} />
            </th>
            <th scope="col" className="n">
              차이 (B−A)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="cmp-mix-label">
                {r.label}
              </th>
              {cell('a', r.a)}
              {cell('b', r.b)}
              <td className="n muted">{fmtPp(r.pp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

const diffInt = (a: number, b: number, unit: string, na: string, nb: string) => {
  const d = b - a;
  const t = fmtTimes(times(a, b), na, nb);
  return (
    <>
      {d === 0 ? '±0' : `${d > 0 ? '+' : '−'}${fmtInt(Math.abs(d))}${unit}`}
      {t && t !== '같은 값' && <span className="cmp-times">{t}</span>}
    </>
  );
};

/* ---------------- 본문 (두 지역이 모두 선택된 경우에만 마운트) ---------------- */

function CompareBody({ a, b, base, filtered, names }: { a: string; b: string; base: ChargerFilterParams; filtered: boolean; names: Record<string, string> }) {
  const ev = useEvRegistration(undefined);
  const regions = useChargerRegions(base);
  const outA = useChargerOutput({ ...base, region_code: a }, { shareRegionRequest: true });
  const outB = useChargerOutput({ ...base, region_code: b }, { shareRegionRequest: true });
  const typA = useChargerTypes({ ...base, region_code: a });
  const typB = useChargerTypes({ ...base, region_code: b });
  const opA = useOperators({ ...base, region_code: a }, 1, 3);
  const opB = useOperators({ ...base, region_code: b }, 1, 3);

  // keepPreviousData로 남은 이전 지역·이전 필터 응답은 지역 이름과 섞이지 않도록 '불러오는 중'으로 처리합니다.
  const pending = (...qs: { isLoading: boolean; isPlaceholderData: boolean }[]) => qs.some((q) => q.isLoading || q.isPlaceholderData);
  const firstError = (...qs: { error: unknown }[]) => qs.find((q) => q.error)?.error ?? null;
  const retry = (...qs: { error: unknown; refetch: () => unknown }[]) => () => qs.forEach((q) => q.error && q.refetch());

  const evCmp = useMemo(() => (ev.data ? compareEv(ev.data.data, a, b) : null), [ev.data, a, b]);
  const chCmp = useMemo(() => (regions.data ? compareChargers(regions.data.data, REGION_CODES, names, a, b) : null), [regions.data, names, a, b]);
  const outSides = useMemo(
    () => (outA.data && outB.data ? { a: outputSide(outA.data.data), b: outputSide(outB.data.data) } : null),
    [outA.data, outB.data],
  );
  const types = useMemo(() => (typA.data && typB.data ? typeMix(typA.data.data, typB.data.data) : []), [typA.data, typB.data]);

  const na = compareName(a, names[a] ?? a);
  const nb = compareName(b, names[b] ?? b);
  const chargerPending = pending(regions, outA, outB);
  const rankBasis = filtered ? '필터 적용 16개 지역 기준' : '전국 16개 지역 기준';

  const evRows: MetricRow[] = evCmp
    ? [
        { key: 'cnt', label: '등록 대수', a: `${fmtInt(evCmp.a.count)}대`, b: `${fmtInt(evCmp.b.count)}대`, diff: diffInt(evCmp.a.count, evCmp.b.count, '대', na, nb) },
        { key: 'share', label: '전국 대비 비중', a: fmtP(evCmp.a.nationShare), b: fmtP(evCmp.b.nationShare), diff: fmtPp(ppDiff(evCmp.a.nationShare, evCmp.b.nationShare)) },
        { key: 'rank', label: '등록 대수 순위 (전국 16개 지역)', a: fmtRank(evCmp.a.rank), b: fmtRank(evCmp.b.rank), diff: '—' },
        { key: 'comm', label: '사업용 대수', a: `${fmtInt(evCmp.a.commercial)}대`, b: `${fmtInt(evCmp.b.commercial)}대`, diff: diffInt(evCmp.a.commercial, evCmp.b.commercial, '대', na, nb) },
        {
          key: 'commPct',
          label: `사업용 비중 (전국 ${fmtP(evCmp.nationCommercialPct)})`,
          a: fmtP(evCmp.a.commercialPct),
          b: fmtP(evCmp.b.commercialPct),
          diff: fmtPp(ppDiff(evCmp.a.commercialPct, evCmp.b.commercialPct)),
        },
        { key: 'commRank', label: '사업용 비중 순위 (전국 16개 지역)', a: fmtRank(evCmp.a.commercialRank), b: fmtRank(evCmp.b.commercialRank), diff: '—' },
      ]
    : [];

  const chRows: MetricRow[] =
    chCmp && outSides
      ? [
          { key: 'ch', label: '충전기 수', a: `${fmtInt(chCmp.a.chargers)}기`, b: `${fmtInt(chCmp.b.chargers)}기`, diff: diffInt(chCmp.a.chargers, chCmp.b.chargers, '기', na, nb) },
          { key: 'chRank', label: `충전기 순위 (${rankBasis})`, a: fmtRank(chCmp.a.chargerRank), b: fmtRank(chCmp.b.chargerRank), diff: '—' },
          { key: 'chShare', label: filtered ? '필터 결과 중 비중' : '전국 대비 비중', a: fmtP(chCmp.a.filteredShare), b: fmtP(chCmp.b.filteredShare), diff: fmtPp(ppDiff(chCmp.a.filteredShare, chCmp.b.filteredShare)) },
          { key: 'st', label: '충전소 수', a: `${fmtInt(chCmp.a.stations)}곳`, b: `${fmtInt(chCmp.b.stations)}곳`, diff: diffInt(chCmp.a.stations, chCmp.b.stations, '곳', na, nb) },
          {
            key: 'per',
            label: '충전소당 충전기',
            a: chCmp.a.perStation === null ? '—' : `${chCmp.a.perStation.toFixed(2)}기`,
            b: chCmp.b.perStation === null ? '—' : `${chCmp.b.perStation.toFixed(2)}기`,
            diff: chCmp.a.perStation !== null && chCmp.b.perStation !== null ? `${chCmp.b.perStation - chCmp.a.perStation >= 0 ? '+' : '−'}${Math.abs(chCmp.b.perStation - chCmp.a.perStation).toFixed(2)}기` : '—',
          },
          { key: 'hi', label: '100kW 이상 비중 (유효 출력 기준)', a: fmtP(outSides.a.high100Pct), b: fmtP(outSides.b.high100Pct), diff: fmtPp(ppDiff(outSides.a.high100Pct, outSides.b.high100Pct)) },
          { key: 'unk', label: '출력 미상 (비중 계산 제외)', a: `${fmtInt(outSides.a.unknown)}기`, b: `${fmtInt(outSides.b.unknown)}기`, diff: '—' },
          {
            key: 'del',
            label: '삭제 표시 (자료상 표기)',
            a: `${fmtInt(chCmp.a.deleted)}기 · ${fmtP(chCmp.a.deletedPct, 2)}`,
            b: `${fmtInt(chCmp.b.deleted)}기 · ${fmtP(chCmp.b.deletedPct, 2)}`,
            diff: fmtPp(ppDiff(chCmp.a.deletedPct, chCmp.b.deletedPct), 2),
          },
        ]
      : [];

  const evMix: MixRow[] = evCmp
    ? evCmp.a.types.map((t, i) => ({ key: t.key, label: t.label, a: { count: t.count, pct: t.pct }, b: { count: evCmp.b.types[i].count, pct: evCmp.b.types[i].pct }, pp: ppDiff(t.pct, evCmp.b.types[i].pct) }))
    : [];
  const outMix = outSides ? outputMix(outSides.a, outSides.b) : [];
  const opsA = opA.data ? topOperators(opA.data.data, opA.data.meta.matched?.charger_count ?? 0) : [];
  const opsB = opB.data ? topOperators(opB.data.data, opB.data.meta.matched?.charger_count ?? 0) : [];

  return (
    <>
      <Card
        span={6}
        className="cmp-card"
        title="전기차 등록 비교"
        sub="2026년 9월 등록자료끼리 비교합니다. 순위는 전국 16개 지역 기준이며 충전기 필터와 무관합니다."
        scope={{ kind: 'fixed', label: '2026-09 · 필터 무관' }}
        isFetching={ev.isFetching && !ev.isLoading}
        insight={evCmp ? <Insight {...insightEvCompare(evCmp)} /> : undefined}
      >
        <QueryState isLoading={pending(ev)} error={ev.error} onRetry={() => ev.refetch()} isEmpty={!evCmp} height={300}>
          {evCmp && (
            <>
              <DuoBars label="전기차 등록 대수" na={na} nb={nb} va={evCmp.a.count} vb={evCmp.b.count} a={`${fmtInt(evCmp.a.count)}대`} b={`${fmtInt(evCmp.b.count)}대`} />
              <MetricTable caption={`전기차 등록 비교: ${na}, ${nb} (2026년 9월)`} rows={evRows} na={na} nb={nb} />
            </>
          )}
        </QueryState>
      </Card>

      <Card
        span={6}
        className="cmp-card"
        title="충전 인프라 비교"
        sub={`2026년 10월 15일 조회 충전기 자료끼리 비교합니다. 순위는 ${rankBasis}입니다.`}
        scope={filtered ? { kind: 'filtered', label: '2026-10-15 · 필터 적용' } : { kind: 'fixed', label: '2026-10-15 · 전국' }}
        isFetching={(regions.isFetching || outA.isFetching || outB.isFetching) && !chargerPending}
        insight={chCmp && outSides && !chargerPending ? <Insight {...insightChargerCompare(chCmp, outSides, filtered)} /> : undefined}
      >
        <QueryState
          isLoading={chargerPending}
          error={firstError(regions, outA, outB)}
          onRetry={retry(regions, outA, outB)}
          isEmpty={!chCmp || !outSides}
          height={300}
        >
          {chCmp && outSides && (
            <>
              <DuoBars label="충전기 수" na={na} nb={nb} va={chCmp.a.chargers} vb={chCmp.b.chargers} a={`${fmtInt(chCmp.a.chargers)}기`} b={`${fmtInt(chCmp.b.chargers)}기`} />
              <MetricTable caption={`충전 인프라 비교: ${na}, ${nb} (2026년 10월 15일 조회)`} rows={chRows} na={na} nb={nb} />
            </>
          )}
        </QueryState>
      </Card>

      <Card
        span={12}
        className="cmp-card"
        title="구성 비교"
        sub="각 지역 안의 구성비(%)를 나란히 놓습니다. 차이는 B − A(%p)입니다."
        scope={filtered ? { kind: 'filtered', label: '충전기 구성: 필터 적용' } : { kind: 'fixed' }}
      >
        <div className="cmp-mix-grid">
          <section className="cmp-mix-block" aria-labelledby="cmp-mix-ev">
            <h3 id="cmp-mix-ev" className="cmp-mix-title">
              전기차 차종 구성 <span className="muted">2026-09 · 분모: 지역 등록 대수</span>
            </h3>
            <QueryState isLoading={pending(ev)} error={ev.error} onRetry={() => ev.refetch()} isEmpty={!evMix.length} height={180}>
              <MixTable caption={`전기차 차종 구성: ${na}, ${nb}`} rows={evMix} na={na} nb={nb} unit="대" />
            </QueryState>
          </section>
          <section className="cmp-mix-block" aria-labelledby="cmp-mix-type">
            <h3 id="cmp-mix-type" className="cmp-mix-title">
              충전기 유형 구성 <span className="muted">2026-10-15 · 두 지역 합계 상위 5개 + 기타</span>
            </h3>
            <QueryState isLoading={pending(typA, typB)} error={firstError(typA, typB)} onRetry={retry(typA, typB)} isEmpty={!types.length} height={180}>
              <MixTable caption={`충전기 유형 구성: ${na}, ${nb}`} rows={types} na={na} nb={nb} unit="기" />
            </QueryState>
          </section>
          <section className="cmp-mix-block" aria-labelledby="cmp-mix-out">
            <h3 id="cmp-mix-out" className="cmp-mix-title">
              출력 구간 구성 <span className="muted">2026-10-15 · 분모: 유효 출력(양수) 충전기</span>
            </h3>
            <QueryState isLoading={pending(outA, outB)} error={firstError(outA, outB)} onRetry={retry(outA, outB)} isEmpty={!outMix.length} height={180}>
              <MixTable caption={`출력 구간 구성: ${na}, ${nb}`} rows={outMix} na={na} nb={nb} unit="기" />
              {outSides && (
                <p className="small muted cmp-note">
                  출력 미상(결측·0 이하·숫자 아님)은 비중 계산에서 제외: {na} {fmtInt(outSides.a.unknown)}기, {nb} {fmtInt(outSides.b.unknown)}기.
                </p>
              )}
            </QueryState>
          </section>
          <section className="cmp-mix-block" aria-labelledby="cmp-mix-op">
            <h3 id="cmp-mix-op" className="cmp-mix-title">
              상위 운영기관 3곳 <span className="muted">2026-10-15 · 분모: 지역 충전기</span>
            </h3>
            <QueryState isLoading={pending(opA, opB)} error={firstError(opA, opB)} onRetry={retry(opA, opB)} isEmpty={!opsA.length && !opsB.length} height={180}>
              <div className="cmp-ops">
                {(
                  [
                    ['a', na, opsA],
                    ['b', nb, opsB],
                  ] as const
                ).map(([side, n, ops]) => (
                  <div key={side} className={`cmp-ops-col cmp-${side}`}>
                    <SideTag side={side} name={n} />
                    {ops.length ? (
                      <ol>
                        {ops.map((o) => (
                          <li key={`${o.id}-${o.name}`}>
                            <span className="cmp-ops-name">{o.name}</span>
                            <span className="num">
                              {fmtInt(o.count)}기 <span className="muted">· {fmtP(o.pct)}</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="small muted">조건에 맞는 충전기가 없습니다.</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="small muted cmp-note">같은 기관도 명칭 표기가 다르면 별도 조합으로 집계됩니다.</p>
            </QueryState>
          </section>
        </div>
      </Card>
    </>
  );
}

/* ---------------- 섹션 ---------------- */

export function RegionCompareSection() {
  const { a, b, same, set, swap, clear } = useCompareRegions();
  const { chargerParams, state } = useFilters();
  const opts = useFilterOptions();
  const idA = useId();
  const idB = useId();
  const names = useMemo(() => Object.fromEntries((opts.data?.charger_regions ?? []).map((r) => [r.code, r.name])), [opts.data]);
  // 비교는 두 지역을 직접 고르므로 상단 '충전기 지역' 필터는 적용하지 않습니다. 유형·삭제 표시·운영기관 필터는 적용합니다.
  const base = useMemo<ChargerFilterParams>(() => ({ ...chargerParams, region_code: undefined }), [chargerParams]);
  const filtered = !!(state.type || state.deletion !== 'all' || state.operator);
  const applied = [state.type && `유형 ${state.type}`, state.deletion !== 'all' && DELETION_LABEL[state.deletion], state.operator && `운영기관 ${state.operator}`].filter(Boolean);

  const select = (side: 'a' | 'b', id: string, value: string | undefined, other: string | undefined) => (
    <label className="field cmp-field" htmlFor={id}>
      <span className="field-label">
        <span className={`cmp-dot cmp-${side}`} aria-hidden="true" />
        지역 {side.toUpperCase()}
      </span>
      <select
        id={id}
        className={`select cg-menu-select cmp-select cmp-${side} ${value ? 'is-set' : ''}`}
        value={value ?? ''}
        onChange={(e) => set(side, e.target.value || undefined)}
        disabled={!opts.data}
      >
        <option value="">지역 선택</option>
        {opts.data?.charger_regions.map((r) => (
          <option key={r.code} value={r.code} disabled={r.code === other}>
            {chargerRegionLabel(r.code, r.name)}
            {r.code === other ? ` (지역 ${side === 'a' ? 'B' : 'A'}에서 선택됨)` : ''}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <Card
        span={12}
        className="cmp-pick-card"
        // 선택 상자는 처음 보일 때 다시 마운트되면 포커스·입력이 끊기므로 등장 애니메이션을 쓰지 않습니다.
        reveal={false}
        title="두 지역 비교"
        sub="두 지역을 골라 전기차 등록(2026-09)과 충전 인프라(2026-10-15)를 각각 같은 기준일 자료끼리 비교합니다."
        scope={filtered ? { kind: 'filtered', label: '충전기: 필터 적용' } : { kind: 'fixed', label: '전국 기준' }}
      >
        <div className="cmp-pick">
          <div className="cmp-pick-row">
            {select('a', idA, a, b)}
            <button type="button" className="btn btn-sm cmp-swap" onClick={swap} disabled={!a && !b} aria-label="지역 A와 B 바꾸기" title="A·B 바꾸기">
              A ⇄ B
            </button>
            {select('b', idB, b, a)}
            <button type="button" className="btn btn-sm cmp-clear" onClick={clear} disabled={!a && !b}>
              선택 해제
            </button>
          </div>
          <div aria-live="polite" className="cmp-status">
            {same ? (
              <div className="notice warn" role="status">
                <Icon name="alert" />
                <div>
                  <strong>같은 지역은 비교할 수 없습니다.</strong> 지역 B를 비웠습니다. 지역 A와 다른 지역을 선택해 주세요.
                </div>
              </div>
            ) : !a || !b ? (
              <p className="small muted cmp-hint">
                {!a && !b ? '지역 A와 지역 B를 모두 선택하면 비교 결과가 표시됩니다.' : `지역 ${a ? 'B' : 'A'}를 선택하면 비교 결과가 표시됩니다.`}
              </p>
            ) : null}
          </div>
          <div className="cmp-basis">
            <NoRatioNotice />
            <p className="small muted">
              충전 인프라 비교에는 상단의 충전기 유형·삭제 표시·운영기관 필터가 적용되고, 충전기 지역 필터는 적용하지 않습니다
              {applied.length ? ` (현재 적용: ${applied.join(', ')})` : ' (현재 적용된 필터 없음, 전국 기준)'}. 전기차 등록 비교는 필터와 무관합니다. 삭제 표시는
              자료상 표기이며 실제 이용 가능 여부가 아닙니다.
            </p>
          </div>
        </div>
      </Card>
      {a && b && <CompareBody a={a} b={b} base={base} filtered={filtered} names={names} />}
    </>
  );
}
