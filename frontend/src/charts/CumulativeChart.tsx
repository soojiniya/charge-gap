import { useMotion } from '../lib/motion';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GrowthRow } from '../api/types';
import { axisLine, axisTick, C } from './theme';
import { TipBox } from './Tooltip';
import { fmtCompact, fmtInt } from '../lib/format';

/**
 * 누적 설치 영역 그래프 (Matplotlib fill_between / stackplot에 대응).
 * 완료 연도는 채운 영역 + 실선, 부분 연도(2026)로 이어지는 구간은 점선과 음영 띠로 구분합니다.
 * 이중 축을 쓰지 않도록 연간 설치량과는 별도 차트로 그립니다.
 */
export function CumulativeChart({ rows, height = 280, ariaLabel }: { rows: GrowthRow[]; height?: number; ariaLabel: string }) {
  const m = useMotion();
  const lastComplete = [...rows].reverse().find((r) => !r.is_partial_year)?.year;
  const partial = rows.find((r) => r.is_partial_year);
  const data = rows.map((r) => ({
    ...r,
    label: String(r.year),
    solid: r.is_partial_year ? null : r.cumulative_count,
    dashed: r.is_partial_year || r.year === lastComplete ? r.cumulative_count : null,
  }));
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 22, right: 18, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cum-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.s1} stopOpacity={0.32} />
              <stop offset="100%" stopColor={C.s1} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          {partial && lastComplete !== undefined && (
            <ReferenceArea
              x1={String(lastComplete)}
              x2={String(partial.year)}
              fill={C.s3}
              fillOpacity={0.07}
              label={{ value: '부분 연도', position: 'insideTopRight', fill: C.s3, fontSize: 12 }}
            />
          )}
          <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={fmtCompact} />
          <Tooltip
            cursor={{ stroke: C.muted, strokeOpacity: 0.5, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as GrowthRow;
              return (
                <TipBox
                  title={`${r.year}년${r.is_partial_year ? ' (부분 연도)' : ''}`}
                  rows={[
                    { label: '누적 설치', value: `${fmtInt(r.cumulative_count)}기`, color: C.s1 },
                    { label: '연간 설치', value: `${fmtInt(r.annual_installed_count)}기` },
                  ]}
                  note={r.is_partial_year ? '집계 마감일 미기재. 완료 연도와 직접 비교하지 마세요.' : undefined}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="solid" stroke={C.s1} strokeWidth={2} fill="url(#cum-fill)" isAnimationActive={m.animate} animationDuration={460} animationEasing="ease-out" dot={false} activeDot={{ r: 6, stroke: C.surface, strokeWidth: 2, fill: C.s1 }} connectNulls={false} />
          <Line
            type="monotone"
            dataKey="dashed"
            stroke={C.s3}
            strokeWidth={2}
            strokeDasharray="5 5"
            isAnimationActive={m.animate}
            animationBegin={m.animate ? 420 : 0}
            animationDuration={200}
            animationEasing="ease-out"
            dot={(p: { cx?: number; cy?: number; payload?: GrowthRow; index?: number }) =>
              p.payload?.is_partial_year && p.cx !== undefined && p.cy !== undefined ? (
                <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={5} fill={C.surface} stroke={C.s3} strokeWidth={2} />
              ) : (
                <g key={`d${p.index}`} />
              )
            }
            activeDot={false}
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
