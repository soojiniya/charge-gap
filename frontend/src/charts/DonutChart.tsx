import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { C } from './theme';
import { TipBox } from './Tooltip';
import { placeDonutTip, type TipRect } from './donutTip';
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

/**
 * 활성 조각: 크기·색은 그대로 두고(바깥 확대·표시 호 없음) 다른 조각만 흐리게 해서 구분합니다(.donut-dim CSS).
 * 어떤 항목인지는 중앙의 항목명·수치와 범례 강조로 보여 줍니다.
 */
function ActiveSlice(props: unknown) {
  const p = props as SectorShape;
  return <Sector {...p} stroke={C.surface} strokeWidth={2} />;
}

/** 긴 유형명은 '+' 뒤에서 줄바꿈할 수 있게(예: 06 DC차데모+AC3상+DC콤보) */
function breakable(label: string) {
  const parts = label.split('+');
  return parts.map((t, i) => (
    <span key={i}>
      {t}
      {i < parts.length - 1 && (
        <>
          +<wbr />
        </>
      )}
    </span>
  ));
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
  // 툴팁 위치: 포인터를 따라가되 중앙 숫자·라벨(안쪽 원)과 겹치지 않고, 보이는 영역 밖으로 잘리지 않는 자리(donutTip.ts).
  const boxRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const tipSize = useRef({ w: 180, h: 100 });
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | undefined>(undefined);
  const placeTip = () => {
    const box = boxRef.current;
    if (!box || !pointer.current) return;
    const b = box.getBoundingClientRect();
    // 보이는 영역 = 화면 ∩ 내용을 잘라내는 상위 요소들(overflow ≠ visible), 도넛 상자 기준 좌표로 변환
    let l = 0, t = 0, r = window.innerWidth, btm = window.innerHeight;
    for (let el = box.parentElement; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const e = el.getBoundingClientRect();
        l = Math.max(l, e.left); t = Math.max(t, e.top); r = Math.min(r, e.right); btm = Math.min(btm, e.bottom);
      }
    }
    const pad = 4;
    const bounds: TipRect = { x: l - b.left + pad, y: t - b.top + pad, w: r - l - pad * 2, h: btm - t - pad * 2 };
    const next = placeDonutTip(pointer.current, tipSize.current, size, (size / 2) * 0.64, bounds);
    setTipPos((cur) => (cur && Math.abs(cur.x - next.x) < 0.5 && Math.abs(cur.y - next.y) < 0.5 ? cur : next));
  };
  const trackPointer = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    pointer.current = { x: e.clientX - b.left, y: e.clientY - b.top };
    // 마우스만 즉시 다시 그립니다. 터치는 탭 직후의 조각 선택 이벤트를 방해하지 않도록 조각이 선택된 뒤(아래 효과) 계산합니다.
    if (e.pointerType === 'mouse') placeTip();
  };
  useLayoutEffect(() => {
    if (active !== undefined) placeTip();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // 실제 툴팁 크기(유형 이름 길이에 따라 다름)를 재서 위치를 다시 계산
  useLayoutEffect(() => {
    const el = boxRef.current?.querySelector('.recharts-tooltip-wrapper .tt');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - tipSize.current.w) > 0.5 || Math.abs(r.height - tipSize.current.h) > 0.5) {
      tipSize.current = { w: r.width, h: r.height };
      placeTip();
    }
  });
  const total = data.reduce((s, d) => s + d.value, 0);
  const centerText = fmtInt(active !== undefined ? data[active]?.value : total);
  return (
    <div className="donut-chart">
      <div
        role="img"
        aria-label={ariaLabel}
        ref={boxRef}
        onPointerDown={trackPointer}
        onPointerMove={trackPointer}
        className={active !== undefined ? 'donut-dim' : undefined}
        style={{ position: 'relative', width: size, height: size, flex: 'none' }}
      >
        <ResponsiveContainer>
          <PieChart>
            <Tooltip
              position={tipPos}
              allowEscapeViewBox={{ x: true, y: true }}
              isAnimationActive={false}
              wrapperStyle={{ zIndex: 1 }}
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
              innerRadius="64%"
              outerRadius="88%"
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
            {/* 8자리 이상(예: 1,191,873)은 안쪽 원에 닿지 않도록 한 단계 작게 */}
            <div className="num" style={{ fontSize: centerText.length > 7 ? '1.2rem' : '1.45rem', fontWeight: 650, fontStretch: '110%' }}>
              {centerText}
            </div>
            {/* 긴 유형 이름은 안쪽 원 폭 안에서 줄바꿈 */}
            <div className="small muted" style={{ maxWidth: size * 0.64 * 0.86, margin: '0 auto', lineHeight: 1.3, wordBreak: 'keep-all' }}>
              {active !== undefined ? data[active]?.label : centerLabel}
            </div>
          </div>
        </div>
      </div>
      <ul className={`donut-legend ${active !== undefined ? 'has-active' : ''}`} onMouseLeave={() => setActive(undefined)}>
        {data.map((d, i) => (
          <li key={d.key} className={active === i ? 'is-active' : undefined} onMouseEnter={() => setActive(i)}>
            <span className="swatch" style={{ background: d.color }} />
            <span className="donut-legend-name">{breakable(d.label)}</span>
            <span className="num donut-legend-count">{fmtInt(d.value)}</span>
            <span className="num muted donut-legend-share">{fmtPct(total ? (d.value / total) * 100 : null)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
