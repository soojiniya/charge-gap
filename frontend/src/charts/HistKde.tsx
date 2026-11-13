import { useMotion } from '../lib/motion';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisLine, axisTick, C } from './theme';
import { TipBox } from './Tooltip';
import { fmtCompact, fmtInt, fmtPct } from '../lib/format';
import { logHistogram, weightedKde, type WeightedValue } from '../lib/stats';

/** log10 공간 구간 폭. KDE 대역폭도 같은 값으로 고정합니다. */
export const LOG_BIN = 0.125;
const LO = 0.375; // 10^0.375 ≈ 2.4kW
const HI = 2.75; // 10^2.75 ≈ 562kW

export const HIST_EDGES = Array.from({ length: Math.round((HI - LO) / LOG_BIN) + 1 }, (_, i) => +(LO + i * LOG_BIN).toFixed(4));
const TICKS_KW = [3, 7, 11, 22, 50, 100, 200, 400];

/**
 * 히스토그램 + KDE (Seaborn histplot(log_scale=True, kde=True)에 대응).
 * 입력은 /api/charger-output의 (output_kw, charger_count) 중 positive_numeric 값.
 */
export function HistKde({ items, height = 300, ariaLabel, logY = false }: { items: WeightedValue[]; height?: number; ariaLabel: string; logY?: boolean }) {
  const m = useMotion();
  const bins = logHistogram(items, HIST_EDGES);
  const total = bins.reduce((s, b) => s + b.count, 0);
  const kde = weightedKde(items, bins.map((b) => b.mid), LOG_BIN, LOG_BIN);
  // 로그 세로축에서는 0을 표현할 수 없어 0인 구간·1 미만 KDE 값은 그리지 않습니다 (툴팁·표에는 실제 값 유지)
  const rows = bins.map((b, i) => ({
    ...b,
    kde: kde[i],
    plotCount: logY && b.count <= 0 ? null : b.count,
    plotKde: logY && kde[i] < 1 ? null : kde[i],
  }));

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 22, left: 4 }} barCategoryGap={1}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            type="number"
            dataKey="mid"
            domain={[LO, HI]}
            ticks={TICKS_KW.map((k) => Math.log10(k))}
            tickFormatter={(v: number) => `${Math.round(10 ** v)}`}
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
            label={{ value: '정격 출력 (kW, 로그 눈금)', position: 'insideBottom', offset: -14, fill: C.muted, fontSize: 14 }}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={fmtCompact}
            scale={logY ? 'log' : 'auto'}
            domain={logY ? [1, 'auto'] : [0, 'auto']}
            allowDataOverflow={logY}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as (typeof rows)[number];
              const lo = 10 ** b.lo;
              const hi = 10 ** b.hi;
              return (
                <TipBox
                  title={`${lo.toFixed(1)} ~ ${hi.toFixed(1)} kW`}
                  rows={[
                    { label: '충전기', value: `${fmtInt(b.count)}기`, color: C.s1 },
                    { label: '전체 대비', value: fmtPct(total ? (b.count / total) * 100 : null, 2) },
                    { label: 'KDE 추정', value: `${fmtInt(Math.round(b.kde))}기`, color: C.compare },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="plotCount" fill={C.s1} fillOpacity={0.85} radius={[3, 3, 0, 0]} isAnimationActive={m.animate} animationDuration={380} animationEasing="ease-out" />
          <Line dataKey="plotKde" connectNulls={false} type="monotone" stroke={C.compare} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: C.compare, stroke: C.surface, strokeWidth: 2 }} isAnimationActive={m.animate} animationBegin={m.animate ? 300 : 0} animationDuration={330} animationEasing="ease-out" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
