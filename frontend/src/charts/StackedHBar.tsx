import { MOTION, useMotion } from '../lib/motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisLine, axisTick, C } from './theme';
import { TipBox } from './Tooltip';
import { fmtCompact, fmtInt, fmtPct } from '../lib/format';

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

interface Props<T extends object> {
  data: T[];
  labelKey: keyof T & string;
  idKey: keyof T & string;
  series: [StackSeries, StackSeries];
  unit: string;
  highlightId?: string;
  onSelect?: (id: string) => void;
  /** true면 각 행을 100%로 정규화해 구성비를 비교 */
  normalized?: boolean;
  labelWidth?: number;
  ariaLabel: string;
}

/** 두 계열 누적 가로 막대. 세그먼트 사이 2px 표면 간격. 범례는 차트 위에 항상 표시. */
export function StackedHBar<T extends object>({
  data,
  labelKey,
  idKey,
  series,
  unit,
  highlightId,
  onSelect,
  normalized,
  labelWidth = 92,
  ariaLabel,
}: Props<T>) {
  const m = useMotion();
  const rows = data.map((src) => {
    const d = src as Record<string, unknown>;
    const a = Number(d[series[0].key]) || 0;
    const b = Number(d[series[1].key]) || 0;
    const total = a + b;
    return {
      ...d,
      __a: normalized ? (total ? (a / total) * 100 : 0) : a,
      __b: normalized ? (total ? (b / total) * 100 : 0) : b,
      __rawA: a,
      __rawB: b,
      __total: total,
    };
  });
  const height = Math.max(140, rows.length * 28 + 40);
  const dimmed = (id: unknown) => highlightId !== undefined && rows.some((r) => (r as Record<string, unknown>)[idKey] === highlightId) && id !== highlightId;

  return (
    <div>
      <div className="legend" style={{ marginBottom: 10 }}>
        {series.map((s) => (
          <span className="legend-item" key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 4, left: 0 }} barCategoryGap={7}>
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis
              type="number"
              tick={axisTick}
              axisLine={axisLine}
              tickLine={false}
              domain={normalized ? [0, 100] : [0, 'auto']}
              tickFormatter={(v: number) => (normalized ? `${v}%` : fmtCompact(v))}
            />
            <YAxis type="category" dataKey={labelKey} width={labelWidth} tick={{ fill: C.ink2, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as (typeof rows)[number];
                return (
                  <TipBox
                    title={String((r as Record<string, unknown>)[labelKey])}
                    rows={[
                      { label: series[0].label, value: `${fmtInt(r.__rawA)}${unit} (${fmtPct(r.__total ? (r.__rawA / r.__total) * 100 : null)})`, color: series[0].color },
                      { label: series[1].label, value: `${fmtInt(r.__rawB)}${unit} (${fmtPct(r.__total ? (r.__rawB / r.__total) * 100 : null)})`, color: series[1].color },
                      { label: '합계', value: `${fmtInt(r.__total)}${unit}` },
                    ]}
                    note={onSelect ? '클릭하면 이 지역으로 필터합니다' : undefined}
                  />
                );
              }}
            />
            {(['__a', '__b'] as const).map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="s"
                fill={series[i].color}
                maxBarSize={18}
                radius={i === 1 ? [0, 4, 4, 0] : 0}
                stroke={C.surface}
                strokeWidth={i === 1 ? 2 : 0}
                isAnimationActive={m.animate} animationDuration={MOTION.enter} animationEasing="ease-out"
                cursor={onSelect ? 'pointer' : undefined}
                onClick={onSelect ? (d: { payload?: Record<string, unknown> }) => d.payload && onSelect(String(d.payload[idKey])) : undefined}
                shape={(props: unknown) => {
                  const p = props as { x: number; y: number; width: number; height: number; fill: string; payload: Record<string, unknown> };
                  if (!p.width || p.width <= 0) return <g />;
                  const x = i === 1 ? p.x + 2 : p.x; // 2px surface gap between segments
                  const w = i === 1 ? Math.max(0, p.width - 2) : p.width;
                  const r = i === 1 ? Math.min(4, w, p.height / 2) : 0;
                  const op = dimmed(p.payload[idKey]) ? 0.35 : 1;
                  if (w <= 0) return <g />;
                  return (
                    <path
                      opacity={op}
                      fill={p.fill}
                      d={
                        r
                          ? `M${x},${p.y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${p.height - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`
                          : `M${x},${p.y} h${w} v${p.height} h-${w} z`
                      }
                    />
                  );
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
