import { MOTION, useMotion } from '../lib/motion';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisLine, axisTick, C } from './theme';
import { TipBox, type TipRow } from './Tooltip';
import { fmtCompact, fmtInt } from '../lib/format';

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  tip?: TipRow[];
  note?: string;
}

interface Props {
  data: HBarDatum[];
  unit: string;
  highlightKey?: string;
  onSelect?: (key: string) => void;
  rowHeight?: number;
  labelWidth?: number;
  ariaLabel: string;
  showValues?: boolean;
}

/**
 * 가로 막대. 끝은 4px 둥글게, 기준선은 각지게. 막대 두께는 최대 18px.
 * onSelect가 있으면 막대를 클릭해 해당 항목으로 필터를 바꿉니다.
 * 포인트 색(C.accent)은 한 막대에만: 선택한 항목, 선택이 없으면 최댓값 막대.
 */
export function HBarChart({
  data,
  unit,
  highlightKey,
  onSelect,
  rowHeight = 30,
  labelWidth = 92,
  ariaLabel,
  showValues = true,
}: Props) {
  const m = useMotion();
  const height = Math.max(120, data.length * rowHeight + 36);
  const anyHighlight = highlightKey !== undefined && data.some((d) => d.key === highlightKey);
  const maxKey = data.reduce<HBarDatum | undefined>((m, d) => (!m || d.value > m.value ? d : m), undefined)?.key;
  const fillOf = (d: HBarDatum) =>
    anyHighlight ? (d.key === highlightKey ? C.accent : C.dim) : d.key === maxKey ? C.accent : C.s1;
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: showValues ? 64 : 16, bottom: 4, left: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} tickFormatter={fmtCompact} />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            tick={{ fill: C.ink2, fontSize: 14 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as HBarDatum;
              return (
                <TipBox
                  title={d.label}
                  rows={d.tip ?? [{ label: '값', value: `${fmtInt(d.value)}${unit}`, color: C.s1 }]}
                  note={d.note ?? (onSelect ? '클릭하면 이 항목으로 필터합니다' : undefined)}
                />
              );
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={m.animate} animationDuration={MOTION.enter} animationEasing="ease-out"
            cursor={onSelect ? 'pointer' : undefined}
            onClick={onSelect ? (d: { payload?: HBarDatum }) => d.payload && onSelect(d.payload.key) : undefined}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={fillOf(d)} />
            ))}
            {showValues && (
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => fmtInt(v)}
                style={{ fill: C.ink2, fontSize: 14, fontFamily: 'var(--font-num)' }}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
