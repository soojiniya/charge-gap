import {
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { axisLine, axisTick, C } from "./theme";
import { TipBox } from "./Tooltip";
import { fmtCompact, fmtInt } from "../lib/format";
import { ols } from "../lib/stats";
import { MOTION, useMotion } from "../lib/motion";

export interface ScatterPoint {
  key: string;
  label: string;
  x: number;
  y: number;
}

interface Props {
  data: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  highlightKey?: string;
  onSelect?: (key: string) => void;
  height?: number;
  /** 직접 라벨을 붙일 점 수 (x 기준 상위) */
  labelTop?: number;
  ariaLabel: string;
}

/**
 * 산점도 + 최소제곱 회귀선 (Seaborn lmplot/regplot에 대응).
 * 회귀선은 같은 응답의 점들로만 계산합니다.
 */
export function RegionScatter({
  data,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  highlightKey,
  onSelect,
  height = 320,
  labelTop = 2,
  ariaLabel,
}: Props) {
  const m = useMotion();
  // 순차 등장 순서: 충전소 수(x)가 작은 점부터 (왼쪽 → 오른쪽)
  const order = new Map(
    [...data].sort((a, b) => a.x - b.x).map((d, i) => [d.key, i]),
  );
  const shape = (fill: string) => (props: unknown) => {
    const p = props as { cx?: number; cy?: number; payload: ScatterPoint };
    if (p.cx === undefined || p.cy === undefined) return <g />;
    const i = order.get(p.payload.key) ?? 0;
    return (
      <circle
        className={`scatter-pt ${m.animate ? "enter" : ""}`}
        style={m.animate ? { animationDelay: `${i * 24}ms` } : undefined}
        cx={p.cx}
        cy={p.cy}
        r={fill === C.s3 ? 7 : 6}
        fill={fill}
        stroke={C.surface}
        strokeWidth={2}
      />
    );
  };
  const fit = ols(
    data.map((d) => d.x),
    data.map((d) => d.y),
  );
  const xMax = Math.max(1, ...data.map((d) => d.x));

  /**
   * 회귀선은 최소제곱 회귀식 y = a + b·x 위의 두 점으로만 그립니다 (계수는 바꾸지 않음).
   * 축이 0부터 시작하므로, 절편이 음수면 선이 y=0과 만나는 x = −a/b부터 시작해 보이는 구간만 남깁니다.
   * 위쪽·오른쪽 축 경계 밖은 ifOverflow="hidden"(clipPath)으로 잘라냅니다.
   */
  const segment = (() => {
    if (!fit) return null;
    const xEnd = xMax * 1.04;
    let xStart = 0;
    if (fit.intercept < 0 && fit.slope > 0) xStart = -fit.intercept / fit.slope;
    if (xStart >= xEnd) return null;
    return [
      { x: xStart, y: fit.intercept + fit.slope * xStart },
      { x: xEnd, y: fit.intercept + fit.slope * xEnd },
    ];
  })();
  // 직접 라벨: 규모 상위 지역 + 충전소당 충전기 최대·최소 지역 (나머지는 툴팁·표로)
  const byRatio = data
    .filter((d) => d.x > 0)
    .sort((a, b) => b.y / b.x - a.y / a.x);
  const labelled = new Set([
    ...[...data]
      .sort((a, b) => b.x - a.x)
      .slice(0, labelTop)
      .map((d) => d.key),
    ...(byRatio.length
      ? [byRatio[0].key, byRatio[byRatio.length - 1].key]
      : []),
  ]);
  if (highlightKey) labelled.add(highlightKey);
  const rows = data.map((d) => ({
    ...d,
    lbl: labelled.has(d.key) ? d.label : "",
  }));
  const sel = rows.filter((d) => d.key === highlightKey);
  const rest = rows.filter((d) => d.key !== highlightKey);

  return (
    <>
      <div role="img" aria-label={ariaLabel} style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 26, right: 28, bottom: 26, left: 6 }}>
            <CartesianGrid stroke={C.grid} />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={[0, "auto"]}
              tick={axisTick}
              axisLine={axisLine}
              tickLine={false}
              tickFormatter={fmtCompact}
              label={{
                value: `${xLabel} (${xUnit})`,
                position: "insideBottom",
                offset: -16,
                fill: C.muted,
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              domain={[0, "auto"]}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={fmtCompact}
              label={{
                value: `${yLabel} (${yUnit})`,
                angle: -90,
                position: "insideLeft",
                offset: 10,
                fill: C.muted,
                fontSize: 12,
                dy: 50,
              }}
            />
            <ZAxis range={[90, 90]} />
            {segment && (
              <ReferenceLine
                segment={segment!}
                stroke={C.compare}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                ifOverflow="hidden"
                className={m.animate ? "bx-out" : undefined}
              />
            )}
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: C.muted }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as ScatterPoint;
                return (
                  <TipBox
                    title={d.label}
                    rows={[
                      { label: xLabel, value: `${fmtInt(d.x)}${xUnit}` },
                      {
                        label: yLabel,
                        value: `${fmtInt(d.y)}${yUnit}`,
                        color: C.s1,
                      },
                      {
                        label: "충전소당 충전기",
                        value: d.x ? `${(d.y / d.x).toFixed(2)}기` : "—",
                      },
                    ]}
                    note={
                      onSelect
                        ? "점을 누르면 이 지역으로 필터합니다"
                        : undefined
                    }
                  />
                );
              }}
            />
            <Scatter
              data={rest}
              fill={C.s1}
              shape={shape(C.s1)}
              isAnimationActive={m.animate}
              animationDuration={MOTION.update}
              animationEasing="ease-out"
              cursor={onSelect ? "pointer" : undefined}
              onClick={
                onSelect
                  ? (d: { payload?: ScatterPoint }) =>
                      d?.payload && onSelect(d.payload.key)
                  : undefined
              }
            >
              <LabelList
                dataKey="lbl"
                position="top"
                offset={9}
                style={{ fill: C.ink2, fontSize: 12 }}
              />
            </Scatter>
            {sel.length > 0 && (
              <Scatter
                data={sel}
                fill={C.s3}
                shape={shape(C.s3)}
                isAnimationActive={m.animate}
                animationDuration={MOTION.update}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="lbl"
                  position="top"
                  offset={9}
                  style={{ fill: C.ink, fontSize: 12, fontWeight: 600 }}
                />
              </Scatter>
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {fit && (
        <p
          className="small muted reg-eq"
          style={{ margin: "4px 0 0", textAlign: "right" }}
        >
          회귀선(점선): {yLabel} = {fit.intercept < 0 ? "−" : ""}
          {fmtInt(Math.abs(Math.round(fit.intercept)))} + {fit.slope.toFixed(3)}{" "}
          × {xLabel}, R² = {fit.r2.toFixed(3)}
        </p>
      )}
    </>
  );
}
