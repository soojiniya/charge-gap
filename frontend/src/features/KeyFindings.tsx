import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { QueryState } from '../components/ui/QueryState';
import { useRegionalDisparity } from '../api/hooks';
import { DATA_SOURCES } from '../analysis/dataSources';
import { computeKeyFindings, fmtR, type Correlation, type Extremes } from '../analysis/keyFindings';
import { C } from '../charts/theme';
import { fmtInt, fmtPct } from '../lib/format';

/**
 * Overview "주요 분석 발견" (전시용 요약).
 * 숫자는 모두 /api/regional-disparity(필터 없음 = 전국 기준, 16개 지역) 응답에서 계산하며 하드코딩하지 않습니다.
 * Regional Explorer의 기본 격차 분석과 같은 요청(같은 쿼리 키)을 씁니다. 전기차 등록 통계와는 결합하지 않습니다.
 */

const NO_FILTERS = {};
const SCOPE = { kind: 'fixed' as const, label: '전국 기준 · 필터 무관' };
const fmtHhi = (n: number) => `${n.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}점`;
const fmtCps = (n: number) => `${n.toFixed(2)}기`;
const explorer = (search: string) => ({ pathname: '/regional-explorer', search });

/** 실제 그리기 폭(px)을 재서 SVG 글자가 화면 크기와 무관하게 같은 크기로 보이게 합니다. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width) || 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(240, width || 320)] as const;
}

/** 16개 지역 값을 한 줄에 점으로 찍고 전국 기준선을 표시 (최고 = 보라, 최저 = 민트) */
function DotStrip({ data, format, label }: { data: Extremes; format: (n: number) => string; label: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 60;
  const vals = data.points.map((p) => p.value).concat(data.national);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.03 || 1;
  const x = (v: number) => 14 + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (W - 28);
  const nx = x(data.national);
  const anchor = (px: number) => (px < 50 ? 'start' : px > W - 50 ? 'end' : 'middle');
  return (
    <div ref={ref} className="kf-chart">
      <svg
        className="kf-strip"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: 16개 지역 분포. 최고 ${data.max.name} ${format(data.max.value)}, 최저 ${data.min.name} ${format(data.min.value)}, 전국 ${format(data.national)}`}
      >
        <line x1={14} x2={W - 14} y1={30} y2={30} stroke={C.axis} strokeWidth={1} />
        <line x1={nx} x2={nx} y1={15} y2={44} stroke={C.muted} strokeWidth={1} strokeDasharray="3 3" />
        <text x={nx} y={10} textAnchor={anchor(nx)} className="kf-svg-note">
          전국 {format(data.national)}
        </text>
        {data.points
          .filter((p) => p.code !== data.max.code && p.code !== data.min.code)
          .map((p) => (
            <circle key={p.code} cx={x(p.value)} cy={30} r={4.5} fill={C.dim} stroke={C.surface} strokeWidth={1}>
              <title>{`${p.name} ${format(p.value)}`}</title>
            </circle>
          ))}
        {[
          { p: data.min, fill: C.compare },
          { p: data.max, fill: C.point },
        ].map(({ p, fill }) => (
          <g key={p.code}>
            <circle cx={x(p.value)} cy={30} r={6.5} fill={fill} stroke={C.surface} strokeWidth={1.5}>
              <title>{`${p.name} ${format(p.value)}`}</title>
            </circle>
            <text x={x(p.value)} y={56} textAnchor={anchor(x(p.value))} className="kf-svg-label" fill={fill}>
              {p.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** 16개 지역 산점도: x = 충전소당 충전기, y = 100kW 이상 비중, 점선 = 전국 기준, 실선 = 최소제곱 추세선 */
function MiniScatter({ data }: { data: Correlation }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 176;
  const L = 40;
  const R = 14;
  const T = 24;
  const B = 34;
  const xs = data.points.map((p) => p.x);
  const ys = data.points.map((p) => p.y);
  const xPad = (Math.max(...xs) - Math.min(...xs)) * 0.05;
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.08;
  const [x0, x1] = [Math.min(...xs) - xPad, Math.max(...xs) + xPad];
  const [y0, y1] = [Math.min(...ys) - yPad, Math.max(...ys) + yPad];
  const px = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const py = (v: number) => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const labelled = [data.xMax, data.xMin];
  const isLabelled = (code: string) => labelled.some((p) => p.code === code);
  const xLo = Math.min(...xs);
  const xHi = Math.max(...xs);
  return (
    <div ref={ref} className="kf-chart">
      <svg
        className="kf-scatter"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`16개 지역 산점도: 충전소당 충전기 수와 100kW 이상 비중, 피어슨 r ${fmtR(data.r)}`}
      >
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={C.axis} />
        <line x1={L} x2={L} y1={T} y2={H - B} stroke={C.axis} />
        <line x1={px(data.national.x)} x2={px(data.national.x)} y1={T} y2={H - B} stroke={C.muted} strokeDasharray="3 3" />
        <line x1={L} x2={W - R} y1={py(data.national.y)} y2={py(data.national.y)} stroke={C.muted} strokeDasharray="3 3" />
        {data.fit && (
          <line
            x1={px(xLo)}
            x2={px(xHi)}
            y1={py(data.fit.intercept + data.fit.slope * xLo)}
            y2={py(data.fit.intercept + data.fit.slope * xHi)}
            stroke={C.compare}
            strokeWidth={1.5}
            opacity={0.85}
          />
        )}
        {data.points.map((p) => (
          <circle key={p.code} cx={px(p.x)} cy={py(p.y)} r={isLabelled(p.code) ? 5.5 : 4.5} fill={C.point} fillOpacity={isLabelled(p.code) ? 1 : 0.7} stroke={C.surface}>
            <title>{`${p.name}: 충전소당 ${fmtCps(p.x)}, 100kW 이상 ${fmtPct(p.y, 2)}`}</title>
          </circle>
        ))}
        {labelled.map((p) => {
          const right = p.code === data.xMin.code;
          return (
            <text key={p.code} x={px(p.x) + (right ? 9 : -9)} y={py(p.y) + 4} textAnchor={right ? 'start' : 'end'} className="kf-svg-label kf-halo" fill={C.ink}>
              {p.name}
            </text>
          );
        })}
        <text x={px(xLo)} y={H - B + 15} textAnchor="middle" className="kf-svg-note">{xLo.toFixed(1)}</text>
        <text x={px(xHi)} y={H - B + 15} textAnchor="middle" className="kf-svg-note">{xHi.toFixed(1)}</text>
        <text x={(L + W - R) / 2} y={H - 3} textAnchor="middle" className="kf-svg-note">충전소당 충전기(기) →</text>
        <text x={L - 5} y={py(Math.max(...ys)) + 4} textAnchor="end" className="kf-svg-note">{fmtPct(Math.max(...ys), 0)}</text>
        <text x={L - 5} y={py(Math.min(...ys)) + 4} textAnchor="end" className="kf-svg-note">{fmtPct(Math.min(...ys), 0)}</text>
        <text x={L - 5} y={11} textAnchor="start" className="kf-svg-note">↑ 100kW 이상 비중</text>
      </svg>
    </div>
  );
}

const foot = (to: { pathname: string; search: string }, text: string) => (
  <Link className="kf-link" to={to}>
    {text} →
  </Link>
);

export function KeyFindingsSection() {
  const q = useRegionalDisparity(NO_FILTERS);
  const f = computeKeyFindings(q.data?.data);
  const snapshot = q.data?.meta.sources?.chargers?.snapshot_date ?? '2026-10-15';
  const loading = q.isLoading;
  const state = (h: number, body: () => React.ReactNode) => (
    <QueryState isLoading={loading} error={q.error} onRetry={() => q.refetch()} isEmpty={!loading && !q.error && !f} height={h}>
      {f && body()}
    </QueryState>
  );
  return (
    <>
      <div className="kf-head span-12">
        <h2 className="kf-title">주요 분석 발견</h2>
        <p className="kf-basis">
          16개 지역 · {DATA_SOURCES.chargers.provider} getChargerInfo · {snapshot} 조회 · 전국 기준(필터와 무관) · 충전 수요·부족률은 계산하지 않음
        </p>
      </div>

      <Card
        span={6}
        className="kf-card"
        title="고출력(100kW 이상) 충전기 비중의 지역 차이"
        scope={SCOPE}
        foot={foot(explorer(f ? `?region=${f.fast.max.code}` : ''), 'Regional Explorer에서 16개 지역 비교')}
      >
        {state(170, () => {
          const d = f!.fast;
          return (
            <div className="kf-body">
              <div className="kf-figures">
                <div>
                  <span className="kf-k">{d.max.name}</span>
                  <b className="kf-v is-max">{fmtPct(d.max.value, 2)}</b>
                </div>
                <div>
                  <span className="kf-k">{d.min.name}</span>
                  <b className="kf-v is-min">{fmtPct(d.min.value, 2)}</b>
                </div>
                <div>
                  <span className="kf-k">차이</span>
                  <b className="kf-v">{(d.max.value - d.min.value).toFixed(2)}%p</b>
                </div>
              </div>
              <DotStrip data={d} format={(n) => fmtPct(n, 2)} label="100kW 이상 충전기 비중" />
              <p className="kf-text">
                전국 {fmtPct(d.national, 2)} 기준으로 {d.above}개 지역은 높고 {d.below}개 지역은 낮습니다. 충전기 대수와 별개로 구성 비율이 지역마다 크게 다릅니다.
              </p>
              <p className="kf-note">
                충전기가 가장 많은 {d.largest.name}({fmtInt(d.largest.chargers)}기)은 {fmtPct(d.largest.value, 2)}로 16개 지역 중 {d.largest.rank}위입니다.{' '}
                <span className="kf-caution">비중이 높다고 충전 여건이 낫다는 뜻은 아닙니다.</span>
              </p>
            </div>
          );
        })}
      </Card>

      <Card
        span={6}
        className="kf-card"
        title="충전소당 충전기 수와 고출력 비중의 관계"
        scope={SCOPE}
        foot={foot(explorer('?gap_metric=chargers_per_station'), 'Regional Explorer에서 충전소당 충전기 보기')}
      >
        {state(170, () => {
          const d = f!.correlation;
          return (
            <div className="kf-body">
              <div className="kf-figures">
                <div>
                  <span className="kf-k">피어슨 r ({d.n}개 지역)</span>
                  <b className="kf-v is-max">{fmtR(d.r)}</b>
                </div>
                <div>
                  <span className="kf-k">충전소당 충전기</span>
                  <b className="kf-v kf-v-sm">
                    {d.xMax.name} {fmtCps(d.xMax.x)} · {d.xMin.name} {fmtCps(d.xMin.x)}
                  </b>
                </div>
              </div>
              <MiniScatter data={d} />
              <p className="kf-text">
                충전소당 충전기가 많은 지역일수록 100kW 이상 비중이 낮은 경향입니다(점선: 전국 {fmtCps(d.national.x)} · {fmtPct(d.national.y, 2)}).{' '}
                <span className="kf-caution">지역 집계값 사이의 상관관계이며 원인을 뜻하지 않습니다.</span>
              </p>
            </div>
          );
        })}
      </Card>

      <Card
        span={12}
        className="kf-card kf-aux"
        title="운영기관 집중도(HHI)의 지역 차이"
        scope={SCOPE}
        foot={foot(explorer(f ? `?gap_metric=operator_hhi&region=${f.hhi.max.code}` : '?gap_metric=operator_hhi'), 'Regional Explorer에서 HHI 보기')}
      >
        {state(90, () => {
          const d = f!.hhi;
          return (
            <div className="kf-aux-body">
              <div className="kf-figures">
                <div>
                  <span className="kf-k">최고 {d.max.name}</span>
                  <b className="kf-v is-max">{fmtHhi(d.max.value)}</b>
                </div>
                <div>
                  <span className="kf-k">전국</span>
                  <b className="kf-v">{fmtHhi(d.national)}</b>
                </div>
                <div>
                  <span className="kf-k">최저 {d.min.name}</span>
                  <b className="kf-v is-min">{fmtHhi(d.min.value)}</b>
                </div>
              </div>
              <DotStrip data={d} format={fmtHhi} label="운영기관 집중도 HHI" />
              <p className="kf-text">
                HHI(0~10,000)는 지역 충전기의 운영기관별 점유율 분포를 나타냅니다. <span className="kf-caution">독점 여부나 서비스 품질을 판정하는 지표가 아닙니다.</span>
              </p>
            </div>
          );
        })}
      </Card>
    </>
  );
}
