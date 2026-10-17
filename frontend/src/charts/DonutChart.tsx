import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { C } from './theme';
import { TipBox } from './Tooltip';
import { fmtInt, fmtPct } from '../lib/format';
import { useMotion } from '../lib/motion';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface SectorShape {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
}

/** 활성 조각: 바깥 반지름을 4px만 키우는 미세 강조 */
function ActiveSlice(props: unknown) {
  const p = props as SectorShape;
  return <Sector {...p} outerRadius={p.outerRadius + 4} stroke={C.surface} strokeWidth={2} />;
}

/**
 * 도넛 + 범례(값·비율 직접 표기). 중앙에 합계. 조각 사이 2px 표면 간격.
 * 첫 등장 시 시계 방향으로 채워지고, 조각이나 범례 항목에 마우스를 올리면 그 조각만 강조합니다.
 */
export function DonutChart({
  data,
  unit,
  centerLabel,
  ariaLabel,
  size = 220,
}: {
  data: DonutSlice[];
  unit: string;
  centerLabel: string;
  ariaLabel: string;
  size?: number;
}) {
  const m = useMotion();
  const [active, setActive] = useState<number | undefined>(undefined);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <div
        role="img"
        aria-label={ariaLabel}
        className={active !== undefined ? 'donut-dim' : undefined}
        style={{ position: 'relative', width: size, height: size, flex: 'none' }}
      >
        <ResponsiveContainer>
          <PieChart>
            <Tooltip
              content={({ active: on, payload }) => {
                if (!on || !payload?.length) return null;
                const d = payload[0].payload as DonutSlice;
                return (
                  <TipBox
                    title={d.label}
                    rows={[
                      { label: '대수', value: `${fmtInt(d.value)}${unit}`, color: d.color },
                      { label: '구성비', value: fmtPct(total ? (d.value / total) * 100 : null) },
                    ]}
                  />
                );
              }}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              stroke={C.surface}
              strokeWidth={2}
              minAngle={1.5}
              activeIndex={active}
              activeShape={ActiveSlice}
              onMouseEnter={(_: unknown, i: number) => setActive(i)}
              onMouseLeave={() => setActive(undefined)}
              isAnimationActive={m.animate}
              animationDuration={600}
              animationEasing="ease-out"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div className="num" style={{ fontSize: '1.45rem', fontWeight: 650, fontStretch: '110%' }}>
              {fmtInt(active !== undefined ? data[active]?.value : total)}
            </div>
            <div className="small muted">{active !== undefined ? data[active]?.label : centerLabel}</div>
          </div>
        </div>
      </div>
      <ul
        className={`donut-legend ${active !== undefined ? 'has-active' : ''}`}
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, flex: 1, minWidth: 180 }}
        onMouseLeave={() => setActive(undefined)}
      >
        {data.map((d, i) => (
          <li
            key={d.key}
            className={active === i ? 'is-active' : undefined}
            onMouseEnter={() => setActive(i)}
            style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 10, alignItems: 'baseline', fontSize: 'var(--t-sm)' }}
          >
            <span className="swatch" style={{ background: d.color, alignSelf: 'center' }} />
            <span style={{ color: 'var(--ink-2)' }}>{d.label}</span>
            <span className="num" style={{ textAlign: 'right' }}>
              {fmtInt(d.value)}
              <span className="muted small" style={{ marginLeft: 8, display: 'inline-block', minWidth: 46 }}>
                {fmtPct(total ? (d.value / total) * 100 : null)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
