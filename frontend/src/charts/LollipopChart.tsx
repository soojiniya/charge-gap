import { MOTION, useMotion } from '../lib/motion';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisLine, axisTick, C } from './theme';
import { TipBox } from './Tooltip';
import { fmtCompact, fmtInt, fmtPct } from '../lib/format';

export interface LollipopDatum {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface StemShape {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: LollipopDatum;
}

/** 막대 대신 0에서 값까지 가는 선(줄기)과 끝 점(사탕)을 그립니다. 줄기는 무채색, 점만 범주 색. */
function Stem({ x = 0, y = 0, width = 0, height = 0, payload }: StemShape) {
  const cy = y + height / 2;
  const end = x + Math.max(width, 0);
  return (
    <g>
      <line x1={x} x2={end} y1={cy} y2={cy} stroke={C.s1} strokeWidth={2} />
      <circle cx={end} cy={cy} r={7} fill={payload?.color ?? C.s1} stroke={C.surface} strokeWidth={2} />
    </g>
  );
}

interface EndLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}

/** 점 오른쪽 라벨. Recharts 기본 라벨은 폭에 맞춰 줄바꿈하므로, 한 줄로 고정된 SVG 텍스트로 그립니다. */
function EndLabel({ x = 0, y = 0, width = 0, height = 0, value }: EndLabelProps) {
  return (
    <text
      x={Number(x) + Math.max(Number(width), 0) + 16}
      y={Number(y) + Number(height) / 2}
      dominantBaseline="central"
      fill={C.ink2}
      fontSize={14}
      style={{ fontFamily: 'var(--font-num)', whiteSpace: 'pre' }}
    >
      {value}
    </text>
  );
}

/**
 * 가로형 롤리팝 차트 (Matplotlib hlines + scatter에 대응). 값이 큰 순서로 위에서 아래로 배치하고,
 * 점 오른쪽에 실제 값과 전체 대비 구성비를 함께 적습니다. 가로축은 0부터 시작하는 선형 축입니다.
 */
export function LollipopChart({
  data,
  unit,
  ariaLabel,
  rowHeight = 44,
  labelWidth = 56,
}: {
  data: LollipopDatum[];
  unit: string;
  ariaLabel: string;
  rowHeight?: number;
  labelWidth?: number;
}) {
  const m = useMotion();
  const total = data.reduce((a, d) => a + d.value, 0);
  const rows = [...data]
    .sort((a, b) => b.value - a.value)
    .map((d) => ({ ...d, text: `${fmtInt(d.value)}${unit} · ${fmtPct(total ? (d.value / total) * 100 : 0)}` }));
  const height = Math.max(140, rows.length * rowHeight + 36);
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 150, bottom: 4, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" domain={[0, 'auto']} tick={axisTick} axisLine={axisLine} tickLine={false} tickFormatter={fmtCompact} />
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
              const d = payload[0].payload as LollipopDatum;
              return (
                <TipBox
                  title={d.label}
                  rows={[
                    { label: '등록 대수', value: `${fmtInt(d.value)}${unit}`, color: d.color },
                    { label: '구성비', value: fmtPct(total ? (d.value / total) * 100 : 0) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="value"
            shape={(p: unknown) => <Stem {...(p as StemShape)} />}
            isAnimationActive={m.animate}
            animationDuration={MOTION.enter}
            animationEasing="ease-out"
          >
            <LabelList dataKey="text" content={EndLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
