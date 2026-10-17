import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type { EvRegistrationRow } from "../api/types";
import { C } from "./theme";
import { TipBox } from "./Tooltip";
import { fmtInt } from "../lib/format";
import { MOTION, useMotion } from "../lib/motion";

/**
 * 지역별 사업용 전기차 비율 점 그래프 (Cleveland dot plot / Seaborn stripplot·pointplot에 대응).
 *  - 사업용 비율 높은 순 정렬, 행 간격 32px
 *  - 0에서 점까지 가는 줄기와 점, 점 오른쪽에 비율 직접 표기
 *  - 최고 지역만 포인트 색(라벤더), 나머지는 세이지 민트
 *  - 전국 사업용 비율 기준선 + 최고·최저 차이 구간 표시
 *  - x축은 0부터 실제 최대값에 맞춘 범위 (0~100% 고정 아님, 0은 항상 포함)
 */

const ROW_H = 32;
const TOP = 58; // 상단 차이 구간 주석 영역
const AXIS_H = 34;
const PAD_R = 64; // 오른쪽 비율 라벨 공간

export interface CommercialDatum {
  code: string;
  name: string;
  commercial: number;
  noncommercial: number;
  total: number;
  share: number; // %
}

export function toCommercialData(rows: EvRegistrationRow[]): CommercialDatum[] {
  return rows
    .map((r) => ({
      code: r.region_code_2025,
      name: r.region_name_2025,
      commercial: r.ev_commercial_count,
      noncommercial: r.ev_noncommercial_count,
      total: r.ev_registration_count,
      share: r.ev_registration_count
        ? (r.ev_commercial_count / r.ev_registration_count) * 100
        : 0,
    }))
    .sort((a, b) => b.share - a.share);
}

/** 0을 포함하고 최대값보다 조금 큰 '깔끔한' 상한 (5% 단위) */
function niceMax(max: number) {
  return Math.max(10, Math.ceil((max * 1.08) / 5) * 5);
}

export function CommercialDotPlot({
  data,
  nationalShare,
  highlightKey,
  onSelect,
  ariaLabel,
}: {
  data: CommercialDatum[];
  nationalShare: number;
  highlightKey?: string;
  onSelect?: (code: string) => void;
  ariaLabel: string;
}) {
  const motion = useMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [hover, setHover] = useState<{
    d: CommercialDatum;
    x: number;
    y: number;
  } | null>(null);

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
  const svgW = Math.max(260, width || 260);
  const narrow = svgW < 520;
  const labelW = narrow ? 52 : 64;
  const plotW = Math.max(120, svgW - labelW - PAD_R);
  const maxShare = Math.max(0, ...data.map((d) => d.share));
  const xMax = niceMax(maxShare);
  const x = (v: number) => labelW + (v / xMax) * plotW;
  const step =
    xMax <= 20
      ? narrow
        ? 5
        : 2
      : xMax <= 50
        ? narrow
          ? 10
          : 5
        : narrow
          ? 20
          : 10;
  const ticks = Array.from(
    { length: Math.floor(xMax / step) + 1 },
    (_, i) => i * step,
  );
  const plotH = data.length * ROW_H;
  const height = TOP + plotH + AXIS_H;

  const top = data[0];
  const bottom = data[data.length - 1];

  const place = (e: MouseEvent<SVGElement>) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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
          {/* grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={TOP - 6}
                y2={TOP + plotH}
                stroke={t === 0 ? C.axis : C.grid}
              />
              <text
                x={x(t)}
                y={TOP + plotH + 16}
                fill={C.muted}
                fontSize={12}
                textAnchor="middle"
                fontFamily="var(--font-num)"
              >
                {t}%
              </text>
            </g>
          ))}
          <text
            x={labelW + plotW / 2}
            y={TOP + plotH + 32}
            fill={C.muted}
            fontSize={12}
            textAnchor="middle"
          >
            전체 전기차 등록 중 사업용 비율 (%)
          </text>

          {/* 최고·최저 차이 구간 주석 */}
          {top && bottom && data.length > 1 && (
            <g>
              <rect
                x={x(bottom.share)}
                y={TOP - 30}
                width={Math.max(1, x(top.share) - x(bottom.share))}
                height={6}
                rx={3}
                fill={C.s1}
                fillOpacity={0.22}
              />
              <line
                x1={x(bottom.share)}
                x2={x(bottom.share)}
                y1={TOP - 34}
                y2={TOP - 20}
                stroke={C.s2}
                strokeWidth={1.5}
              />
              <line
                x1={x(top.share)}
                x2={x(top.share)}
                y1={TOP - 34}
                y2={TOP - 20}
                stroke={C.s1}
                strokeWidth={1.5}
              />
              <text
                x={(x(bottom.share) + x(top.share)) / 2}
                y={TOP - 42}
                fill={C.ink}
                fontSize={12.5}
                fontWeight={600}
                textAnchor="middle"
              >
                최고·최저 차이 {(top.share - bottom.share).toFixed(1)}%p
              </text>
            </g>
          )}

          {/* 전국 기준선 */}
          <line
            x1={x(nationalShare)}
            x2={x(nationalShare)}
            y1={TOP - 6}
            y2={TOP + plotH}
            stroke={C.ink2}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
          />
          <text
            x={x(nationalShare) + 5}
            y={TOP - 9}
            fill={C.ink2}
            fontSize={11.5}
            fontFamily="var(--font-num)"
          >
            전국 {nationalShare.toFixed(1)}%
          </text>

          {data.map((d, i) => {
            const cy = TOP + i * ROW_H + ROW_H / 2;
            const isTop = i === 0;
            const sel = highlightKey === d.code;
            const isHover = hover?.d.code === d.code;
            const color = isTop ? C.point : C.s2;
            const xv = x(d.share);
            const enter: CSSProperties | undefined = motion.animate
              ? ({
                  animationDelay: `${i * MOTION.stagger}ms`,
                  ["--dx" as string]: `${x(0) - xv}px`,
                } as CSSProperties)
              : undefined;
            return (
              <g
                key={d.code}
                className={`dot-row ${isHover ? "is-hover" : ""}`}
                style={{ cursor: onSelect ? "pointer" : undefined }}
                onMouseMove={(e) => setHover({ d, ...place(e) })}
                onClick={onSelect ? () => onSelect(d.code) : undefined}
              >
                <rect
                  x={0}
                  y={cy - ROW_H / 2}
                  width={svgW}
                  height={ROW_H}
                  fill={isHover ? "rgba(255,255,255,0.035)" : "transparent"}
                />
                <text
                  x={labelW - 10}
                  y={cy + 4.5}
                  fill={sel ? C.s3 : isTop ? C.ink : C.ink2}
                  fontSize={13}
                  fontWeight={sel || isTop ? 600 : 400}
                  textAnchor="end"
                >
                  {d.name}
                </text>
                {/* stem from 0 */}
                <line
                  className={motion.animate ? "dot-stem enter" : "dot-stem"}
                  style={
                    motion.animate
                      ? {
                          animationDelay: `${i * MOTION.stagger}ms`,
                          transformOrigin: `${x(0)}px ${cy}px`,
                        }
                      : undefined
                  }
                  x1={x(0)}
                  x2={xv}
                  y1={cy}
                  y2={cy}
                  stroke={color}
                  strokeOpacity={isTop ? 0.65 : 0.35}
                  strokeWidth={2}
                />
                <g
                  className={motion.animate ? "dot-mark enter" : "dot-mark"}
                  style={enter}
                >
                  <circle
                    cx={xv}
                    cy={cy}
                    r={isTop ? 7.5 : 6}
                    fill={color}
                    stroke={sel ? C.s3 : C.surface}
                    strokeWidth={sel ? 2.5 : 2}
                  />
                  <text
                    x={xv + 12}
                    y={cy + 4.5}
                    fill={isTop ? C.point : C.ink}
                    fontSize={12.5}
                    fontWeight={isTop ? 700 : 500}
                    fontFamily="var(--font-num)"
                  >
                    {d.share.toFixed(1)}%
                  </text>
                </g>
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
              Math.max(hover.x, 110),
              Math.max(110, (width || svgW) - 110),
            ),
            top: hover.y,
            transform:
              hover.y < 220
                ? "translate(-50%, 16px)"
                : "translate(-50%, calc(-100% - 12px))",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <TipBox
            title={hover.d.name}
            rows={[
              {
                label: "사업용",
                value: `${fmtInt(hover.d.commercial)}대`,
                color: C.s2,
              },
              {
                label: "비사업용",
                value: `${fmtInt(hover.d.noncommercial)}대`,
              },
              { label: "전체 등록", value: `${fmtInt(hover.d.total)}대` },
              {
                label: "사업용 비율",
                value: `${hover.d.share.toFixed(1)}%`,
                color: hover.d.code === top?.code ? C.point : C.s2,
              },
            ]}
            note={`전국 ${nationalShare.toFixed(1)}% 대비 ${(hover.d.share - nationalShare >= 0 ? "+" : "") + (hover.d.share - nationalShare).toFixed(1)}%p`}
          />
        </div>
      )}
    </div>
  );
}
