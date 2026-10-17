import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { StationSizeRow } from "../api/types";
import { C } from "./theme";
import { TipBox } from "./Tooltip";
import { fmtInt } from "../lib/format";
import { MOTION, useMotion, useTweenedMap } from "../lib/motion";

/**
 * 지역별 가로 박스플롯 (Seaborn boxplot / Matplotlib bxp에 대응).
 * 통계는 API가 계산한 값을 그대로 그립니다. 라이브러리 수염 재계산을 하지 않습니다.
 *  - 상자: q1 ~ q3, 중앙선: median
 *  - 수염: whisker_low ~ whisker_high (1.5×IQR 울타리 안의 실제 최솟값·최댓값). min/max가 아님.
 *  - 이상치: outlier_distribution의 값마다 점 1개, 점 크기 = 그 값을 가진 충전소 수(빈도). 지터 없음.
 *  - 평균: 마름모 표식
 */

const ROW_H = 34;
const BOX_H = 14;
const LABEL_W = 132;
const PAD_R = 18;
const AXIS_H = 34;

const fmtNum = (v: number) =>
  Number.isInteger(v) ? fmtInt(v) : v.toFixed(2).replace(/\.?0+$/, "");

type Hover =
  | { kind: "box"; row: StationSizeRow; x: number; y: number }
  | {
      kind: "outlier";
      row: StationSizeRow;
      value: number;
      freq: number;
      x: number;
      y: number;
    }
  | null;

function niceLinearTicks(max: number) {
  const raw = max / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function BoxPlot({
  rows,
  log,
  highlightKey,
  ariaLabel,
}: {
  rows: StationSizeRow[];
  log: boolean;
  highlightKey?: string;
  ariaLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.floor(e.contentRect.width) || 0),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 카드 안쪽 실제 폭을 그대로 쓰고, 그보다 좁으면 카드 안에서만 가로 스크롤 (페이지 가로 스크롤 방지)
  const svgW = Math.max(280, width || 280);
  const narrow = svgW < 520;
  const labelW = narrow ? 92 : LABEL_W;
  const plotW = Math.max(120, svgW - labelW - PAD_R);
  const height = rows.length * ROW_H + AXIS_H + 8;

  const motion = useMotion();
  const dataMax = Math.max(
    1,
    ...rows.map((r) =>
      Math.max(
        r.whisker_high,
        r.max,
        ...r.outlier_distribution.map((o) => o.charger_count),
      ),
    ),
  );
  const lo = log ? 0.8 : 0;
  const hiTarget = log ? dataMax * 1.25 : dataMax * 1.05;

  // 필터 변경 시 상자·수염·행 위치·축 범위를 이전 값에서 새 값으로 보간 (그리기 전용, 툴팁은 실제 값)
  const target: Record<string, number> = { __hi: hiTarget };
  rows.forEach((r, i) => {
    const k = r.region_code;
    Object.assign(target, {
      [`${k}:q1`]: r.q1,
      [`${k}:median`]: r.median,
      [`${k}:q3`]: r.q3,
      [`${k}:wl`]: r.whisker_low,
      [`${k}:wh`]: r.whisker_high,
      [`${k}:mean`]: r.mean,
      [`${k}:row`]: i,
    });
  });
  const tw = useTweenedMap(target, MOTION.update, motion.animate);
  const g = (k: string, fallback: number) => tw[k] ?? fallback;
  const hi = g("__hi", hiTarget);
  const x = (v: number) => {
    if (log) {
      const vv = Math.max(v, lo);
      return (
        labelW +
        ((Math.log10(vv) - Math.log10(lo)) /
          (Math.log10(hi) - Math.log10(lo))) *
          plotW
      );
    }
    return labelW + ((v - lo) / (hi - lo)) * plotW;
  };
  const ticks = log
    ? [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 500, 1000].filter(
        (t) => t >= lo && t <= hi,
      )
    : niceLinearTicks(hi);
  const maxFreq = Math.max(
    1,
    ...rows.flatMap((r) => r.outlier_distribution.map((o) => o.station_count)),
  );
  // 점이 밀집해 보이지 않도록 작게(1.6~4.6px) 그리고 반투명으로. 빈도 정보는 크기·툴팁으로 유지
  const rOf = (freq: number) => 1.6 + 3 * Math.sqrt(freq / maxFreq);

  const place = (e: MouseEvent<SVGElement>) => {
    const box = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  return (
    <div
      ref={wrap}
      style={{ position: "relative", width: "100%", minWidth: 0 }}
      onMouseLeave={() => setHover(null)}
    >
      <div className="chart-hscroll">
        <svg
          width={svgW}
          height={height}
          role="img"
          aria-label={ariaLabel}
          style={{ display: "block" }}
        >
          {/* grid + axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={0}
                y2={rows.length * ROW_H}
                stroke={C.grid}
              />
              <text
                x={x(t)}
                y={rows.length * ROW_H + 16}
                fill={C.muted}
                fontSize={12}
                textAnchor="middle"
                fontFamily="var(--font-num)"
              >
                {fmtInt(t)}
              </text>
            </g>
          ))}
          <text
            x={labelW + plotW / 2}
            y={rows.length * ROW_H + 32}
            fill={C.muted}
            fontSize={12}
            textAnchor="middle"
          >
            충전소 1곳당 충전기 수 (기{log ? ", 로그 눈금" : ""})
          </text>

          {rows.map((r, i) => {
            const k = r.region_code;
            const cy = g(`${k}:row`, i) * ROW_H + ROW_H / 2;
            const sel = highlightKey === k;
            const isHover = hover?.row.region_code === k;
            const name = k === "12" ? "전남광주" : r.region_name;
            const xq1 = x(g(`${k}:q1`, r.q1));
            const xq3 = x(g(`${k}:q3`, r.q3));
            const xmed = x(g(`${k}:median`, r.median));
            const xwl = x(g(`${k}:wl`, r.whisker_low));
            const xwh = x(g(`${k}:wh`, r.whisker_high));
            const boxX = xq1;
            const boxW = Math.max(2, xq3 - xq1);
            const m = x(g(`${k}:mean`, r.mean));
            return (
              <g key={k} className={`bx-row ${isHover ? "is-hover" : ""}`}>
                <rect
                  x={0}
                  y={cy - ROW_H / 2}
                  width={svgW}
                  height={ROW_H}
                  fill={isHover ? "rgba(255,255,255,0.035)" : "transparent"}
                  style={{ transition: `fill ${MOTION.hover}ms ease-out` }}
                />
                <text
                  x={narrow ? 4 : 8}
                  y={cy - 2}
                  fill={sel ? C.s3 : C.ink2}
                  fontSize={13}
                  fontWeight={sel ? 600 : 400}
                >
                  {name}
                </text>
                <text
                  x={narrow ? 4 : 8}
                  y={cy + 12}
                  fill={C.muted}
                  fontSize={11}
                  fontFamily="var(--font-num)"
                >
                  n={fmtInt(r.sample_count)}
                </text>
                <g
                  className={`bx-body ${motion.animate ? "enter" : ""}`}
                  style={
                    motion.animate
                      ? {
                          animationDelay: `${i * MOTION.stagger}ms`,
                          transformOrigin: `${xmed}px ${cy}px`,
                        }
                      : undefined
                  }
                >
                  {/* whisker line + caps (whisker_low/high, not min/max) */}
                  <line
                    x1={xwl}
                    x2={xwh}
                    y1={cy}
                    y2={cy}
                    stroke={C.ink2}
                    strokeWidth={1.4}
                  />
                  <line
                    x1={xwl}
                    x2={xwl}
                    y1={cy - 6}
                    y2={cy + 6}
                    stroke={C.ink2}
                    strokeWidth={1.4}
                  />
                  <line
                    x1={xwh}
                    x2={xwh}
                    y1={cy - 6}
                    y2={cy + 6}
                    stroke={C.ink2}
                    strokeWidth={1.4}
                  />
                  {/* box q1..q3 */}
                  <rect
                    className="bx-box"
                    x={boxX}
                    y={cy - BOX_H / 2}
                    width={boxW}
                    height={BOX_H}
                    rx={2}
                    fill={C.s1}
                    fillOpacity={0.38}
                    stroke={C.s1}
                    strokeWidth={1.4}
                  />
                  {/* median */}
                  <line
                    x1={xmed}
                    x2={xmed}
                    y1={cy - BOX_H / 2 - 2}
                    y2={cy + BOX_H / 2 + 2}
                    stroke={C.ink}
                    strokeWidth={2.6}
                  />
                  {/* mean */}
                  <path
                    d={`M${m},${cy - 5} L${m + 5},${cy} L${m},${cy + 5} L${m - 5},${cy} Z`}
                    fill={C.s3}
                    stroke={C.surface}
                    strokeWidth={1}
                  />
                  {/* 호버 시 Q1·중앙값·Q3 값 강조 (실제 API 값) */}
                  <text
                    className="bx-q"
                    x={xmed}
                    y={cy - BOX_H / 2 - 4}
                    fill={C.ink}
                    fontSize={11}
                    fontWeight={600}
                    textAnchor="middle"
                    fontFamily="var(--font-num)"
                  >
                    중앙 {fmtNum(r.median)}
                  </text>
                  <text
                    className="bx-q"
                    x={xq1 - 3}
                    y={cy + BOX_H / 2 + 11}
                    fill={C.s1}
                    fontSize={10.5}
                    textAnchor="end"
                    fontFamily="var(--font-num)"
                  >
                    Q1 {fmtNum(r.q1)}
                  </text>
                  <text
                    className="bx-q"
                    x={xq3 + 3}
                    y={cy + BOX_H / 2 + 11}
                    fill={C.s1}
                    fontSize={10.5}
                    textAnchor="start"
                    fontFamily="var(--font-num)"
                  >
                    Q3 {fmtNum(r.q3)}
                  </text>
                </g>
                {/* hit area for the box/whisker tooltip */}
                <rect
                  x={Math.min(xwl, boxX) - 6}
                  y={cy - ROW_H / 2 + 2}
                  width={Math.max(xwh, boxX + boxW) - Math.min(xwl, boxX) + 12}
                  height={ROW_H - 4}
                  fill="transparent"
                  onMouseMove={(e) =>
                    setHover({ kind: "box", row: r, ...place(e) })
                  }
                />
                {/* outliers: one point per distinct value, size = frequency */}
                {r.outlier_distribution.map((o) => (
                  <circle
                    className={motion.animate ? "bx-out" : undefined}
                    style={
                      motion.animate
                        ? { animationDelay: `${180 + i * MOTION.stagger}ms` }
                        : undefined
                    }
                    key={o.charger_count}
                    cx={x(o.charger_count)}
                    cy={cy}
                    r={rOf(o.station_count)}
                    fill={C.s4}
                    fillOpacity={0.32}
                    stroke={C.s4}
                    strokeOpacity={0.6}
                    strokeWidth={0.8}
                    onMouseMove={(e) => {
                      e.stopPropagation();
                      setHover({
                        kind: "outlier",
                        row: r,
                        value: o.charger_count,
                        freq: o.station_count,
                        ...place(e),
                      });
                    }}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(
              Math.max(hover.x, 120),
              Math.max(120, (width || svgW) - 120),
            ),
            top: hover.y,
            transform:
              hover.y < (hover.kind === "box" ? 330 : 150)
                ? "translate(-50%, 16px)"
                : "translate(-50%, calc(-100% - 12px))",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {hover.kind === "box" ? (
            <TipBox
              title={`${hover.row.region_name} (표본 ${fmtInt(hover.row.sample_count)}곳)`}
              rows={[
                { label: "최솟값 (min)", value: `${fmtNum(hover.row.min)}기` },
                {
                  label: "아래 수염",
                  value: `${fmtNum(hover.row.whisker_low)}기`,
                },
                {
                  label: "Q1",
                  value: `${fmtNum(hover.row.q1)}기`,
                  color: C.s1,
                },
                { label: "중앙값", value: `${fmtNum(hover.row.median)}기` },
                {
                  label: "평균",
                  value: `${fmtNum(hover.row.mean)}기`,
                  color: C.s3,
                },
                {
                  label: "Q3",
                  value: `${fmtNum(hover.row.q3)}기`,
                  color: C.s1,
                },
                {
                  label: "위 수염",
                  value: `${fmtNum(hover.row.whisker_high)}기`,
                },
                { label: "최댓값 (max)", value: `${fmtNum(hover.row.max)}기` },
                { label: "IQR", value: `${fmtNum(hover.row.iqr)}기` },
                {
                  label: "이상치",
                  value: `${fmtInt(hover.row.outlier_count)}곳`,
                  color: C.s4,
                },
              ]}
              note={`울타리 ${fmtNum(hover.row.fence_low)} ~ ${fmtNum(hover.row.fence_high)}기 (Q1−1.5×IQR, Q3+1.5×IQR)`}
            />
          ) : (
            <TipBox
              title={`${hover.row.region_name} 이상치`}
              rows={[
                {
                  label: "충전소당 충전기",
                  value: `${fmtInt(hover.value)}기`,
                  color: C.s4,
                },
                { label: "해당 충전소 수", value: `${fmtInt(hover.freq)}곳` },
                {
                  label: "지역 이상치 합계",
                  value: `${fmtInt(hover.row.outlier_count)}곳`,
                },
              ]}
              note={`위 울타리 ${fmtNum(hover.row.fence_high)}기 초과`}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function BoxLegend() {
  return (
    <div className="legend" style={{ marginBottom: 10 }}>
      <span className="legend-item">
        <span
          className="swatch"
          style={{
            background: "rgba(164,155,200,0.38)",
            outline: `1.4px solid ${C.s1}`,
          }}
        />
        상자 Q1–Q3
      </span>
      <span className="legend-item">
        <span
          className="swatch"
          style={{ width: 3, height: 14, background: C.ink, borderRadius: 1 }}
        />
        중앙값
      </span>
      <span className="legend-item">
        <span
          className="swatch"
          style={{
            width: 9,
            height: 9,
            background: C.s3,
            transform: "rotate(45deg)",
            borderRadius: 1,
          }}
        />
        평균
      </span>
      <span className="legend-item">
        <span
          className="swatch"
          style={{ width: 16, height: 2, background: C.ink2, borderRadius: 1 }}
        />
        수염 (1.5×IQR 안 실제 최소·최대)
      </span>
      <span className="legend-item">
        <span
          className="swatch"
          style={{
            width: 8,
            height: 8,
            background: "rgba(191,111,139,0.45)",
            border: `1px solid ${C.s4}`,
            borderRadius: "50%",
          }}
        />
        이상치 (점 크기 = 충전소 수)
      </span>
    </div>
  );
}
