import { MOTION, useMotion } from '../lib/motion';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisLine, axisTick, C } from './theme';
import { TipBox, type TipRow } from './Tooltip';
import { fmtCompact, fmtInt } from '../lib/format';

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  /** 부분 연도 등 '불완전' 값: 빗금 채움 */
  partial?: boolean;
  tip?: TipRow[];
  note?: string;
}

interface Props {
  data: ColumnDatum[];
  unit: string;
  height?: number;
  log?: boolean;
  xTitle?: string;
  ariaLabel: string;
  /** 막대 끝 값 표기: 최댓값과 부분 값만 (전부 표기하지 않음) */
  labelPolicy?: 'none' | 'extremes';
  highlightKey?: string;
}

export function ColumnChart({ data, unit, height = 260, log, xTitle, ariaLabel, labelPolicy = 'none', highlightKey }: Props) {
  const m = useMotion();
  const max = Math.max(0, ...data.map((d) => d.value));
  const rows = data.map((d) => ({
    ...d,
    // 로그 축에서 0은 표현 불가 → 0건 범주는 막대를 그리지 않음 (툴팁/표에는 0 유지)
    plot: log && d.value <= 0 ? null : d.value,
    lbl: labelPolicy === 'extremes' && (d.value === max || d.partial) ? fmtInt(d.value) : '',
  }));
  const anyHighlight = highlightKey !== undefined && data.some((d) => d.key === highlightKey);
  const many = data.length > 20;

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 26, right: 20, bottom: xTitle ? 18 : 0, left: 0 }} barCategoryGap={many ? 2 : '22%'}>
          <defs>
            <pattern id="hatch-partial" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgba(245,245,245,0.12)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke={C.s3} strokeWidth="2.2" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="label"
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
            // 좁은 화면에서 연도 눈금이 겹치면 일부만 표시(데스크톱은 모두 표시됨)
            interval="preserveStartEnd"
            minTickGap={4}
            label={xTitle ? { value: xTitle, position: 'insideBottom', offset: -12, fill: C.muted, fontSize: 13 } : undefined}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={48}
            scale={log ? 'log' : 'auto'}
            domain={log ? [0.5, 'auto'] : [0, 'auto']}
            allowDataOverflow={log}
            tickFormatter={fmtCompact}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as ColumnDatum;
              return (
                <TipBox
                  title={d.label}
                  rows={d.tip ?? [{ label: '값', value: `${fmtInt(d.value)}${unit}`, color: C.s1, hatched: d.partial }]}
                  note={d.note}
                />
              );
            }}
          />
          <Bar dataKey="plot" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={m.animate} animationDuration={MOTION.enter} animationEasing="ease-out">
            {rows.map((d) => (
              <Cell
                key={d.key}
                fill={d.partial ? 'url(#hatch-partial)' : !anyHighlight || d.key === highlightKey ? C.s1 : C.dim}
              />
            ))}
            {labelPolicy !== 'none' && (
              <LabelList dataKey="lbl" position="top" style={{ fill: C.ink2, fontSize: 13, fontFamily: 'var(--font-num)' }} />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
