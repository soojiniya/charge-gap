import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { axisLine, axisTick, C } from './theme';
import { TipBox, type TipRow } from './Tooltip';

export interface DotDatum {
  key: string;
  label: string;
  value: number;
  tip?: TipRow[];
}

/**
 * 범주별 단일 값 점 그래프 (Seaborn stripplot/pointplot에 대응). 기준선(전국값)을 함께 표시합니다.
 */
export function DotPlot({
  data,
  reference,
  referenceLabel,
  unit,
  highlightKey,
  ariaLabel,
  digits = 2,
}: {
  data: DotDatum[];
  reference?: number;
  referenceLabel?: string;
  unit: string;
  highlightKey?: string;
  ariaLabel: string;
  digits?: number;
}) {
  const rows = data.map((d, i) => ({ ...d, y: i }));
  const height = Math.max(160, rows.length * 26 + 70);
  const max = Math.max(...rows.map((r) => r.value), reference ?? 0);
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 26, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" dataKey="value" domain={[0, Math.ceil(max * 1.1)]} tick={axisTick} axisLine={axisLine} tickLine={false} />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-0.6, rows.length - 0.4]}
            reversed
            ticks={rows.map((r) => r.y)}
            tickFormatter={(v: number) => rows[v]?.label ?? ''}
            tick={{ fill: C.ink2, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={70}
            interval={0}
          />
          {reference !== undefined && (
            <ReferenceLine
              x={reference}
              stroke={C.compare}
              strokeDasharray="5 4"
              label={{ value: referenceLabel ?? '기준', position: 'top', fill: C.compare, fontSize: 12 }}
            />
          )}
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as DotDatum;
              return <TipBox title={d.label} rows={d.tip ?? [{ label: '값', value: `${d.value.toFixed(digits)}${unit}`, color: C.s1 }]} />;
            }}
          />
          <Scatter
            data={rows}
            isAnimationActive={false}
            shape={(p: unknown) => {
              const s = p as { cx: number; cy: number; payload: DotDatum };
              const sel = s.payload.key === highlightKey;
              return <circle cx={s.cx} cy={s.cy} r={sel ? 7 : 5.5} fill={sel ? C.s3 : C.s1} stroke={C.surface} strokeWidth={2} />;
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
