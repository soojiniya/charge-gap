import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { seqColor, seqInk } from "./theme";
import { TipBox } from "./Tooltip";
import { fmtInt, fmtPct } from "../lib/format";

export interface HeatRow {
  key: string;
  label: string;
  counts: number[];
}

interface Props {
  rows: HeatRow[];
  columns: string[];
  highlightKey?: string;
  onSelect?: (key: string) => void;
  caption: string;
}

/**
 * 행 기준 비율 히트맵 (Seaborn heatmap(annot=True)에 대응).
 * 색은 지역 안의 구성비(%), 툴팁에 실제 건수를 함께 표시합니다.
 * 색 척도는 열마다 값 범위가 크게 달라(완속 90% vs 고출력 2%) 열별 최대값 기준으로 정규화합니다.
 */
export function Heatmap({
  rows,
  columns,
  highlightKey,
  onSelect,
  caption,
}: Props) {
  // 칸의 화면 좌표(getBoundingClientRect)를 저장하고, 툴팁은 body에 position:fixed로 띄웁니다.
  // 그래서 표를 감싼 가로 스크롤 영역(overflow)에 잘리지 않고, 화면 위·좌우 경계를 넘으면 위치를 바꿉니다.
  const [hover, setHover] = useState<{
    r: number;
    c: number;
    rect: DOMRect;
  } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  const show = (
    ri: number,
    ci: number,
    e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
  ) =>
    setHover({ r: ri, c: ci, rect: e.currentTarget.getBoundingClientRect() });

  useLayoutEffect(() => {
    if (!hover || !tipRef.current) {
      setTipPos(null);
      return;
    }
    const M = 8; // 화면 가장자리 여백
    const GAP = 8; // 칸과 툴팁 간격
    const tw = tipRef.current.offsetWidth;
    const th = tipRef.current.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    // 툴팁은 body에 z-index 1200으로 떠서 고정 필터 막대·모달 위에 그려지므로 화면 경계만 고려합니다.
    const topSafe = M;
    const b = hover.rect;
    let left = b.left + b.width / 2 - tw / 2;
    left = Math.min(Math.max(left, M), Math.max(M, vw - tw - M));
    let top = b.top - th - GAP; // 기본: 칸 위
    if (top < topSafe) top = b.bottom + GAP; // 공간이 없으면 칸 아래
    if (top + th > vh - M) top = Math.max(topSafe, vh - th - M);
    setTipPos({ left, top });
  }, [hover]);

  useLayoutEffect(() => {
    if (!hover) return;
    const hide = () => setHover(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [hover]);
  const pct = rows.map((r) => {
    const total = r.counts.reduce((s, v) => s + v, 0);
    return r.counts.map((v) => (total ? (v / total) * 100 : 0));
  });
  const colMax = columns.map((_, c) =>
    Math.max(0.0001, ...pct.map((p) => p[c])),
  );
  const colMin = columns.map((_, c) => Math.min(...pct.map((p) => p[c])));

  return (
    <div
      style={{ position: "relative", overflowX: "auto" }}
      onMouseLeave={() => setHover(null)}
    >
      <table className="heatmap">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={r.key}
              className={r.key === highlightKey ? "is-selected" : undefined}
            >
              <th scope="row">
                {onSelect ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{
                      height: 24,
                      padding: 0,
                      color: "inherit",
                      fontWeight: "inherit",
                    }}
                    onClick={() => onSelect(r.key)}
                    title="이 지역으로 필터"
                  >
                    {r.label}
                  </button>
                ) : (
                  r.label
                )}
              </th>
              {r.counts.map((v, ci) => {
                const span = colMax[ci] - colMin[ci];
                const t = span > 0 ? (pct[ri][ci] - colMin[ci]) / span : 0.5;
                return (
                  <td
                    key={ci}
                    tabIndex={0}
                    aria-label={`${r.label} ${columns[ci]}: ${fmtPct(pct[ri][ci], 1)}, ${fmtInt(v)}기`}
                    style={{ background: seqColor(t), color: seqInk(t) }}
                    onMouseEnter={(e) => show(ri, ci, e)}
                    onFocus={(e) => show(ri, ci, e)}
                    onBlur={() => setHover(null)}
                  >
                    {pct[ri][ci] >= 10
                      ? pct[ri][ci].toFixed(0)
                      : pct[ri][ci].toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hover &&
        createPortal(
          <div
            ref={tipRef}
            className="heat-tip"
            role="tooltip"
            style={{
              position: "fixed",
              left: tipPos?.left ?? 0,
              top: tipPos?.top ?? 0,
              visibility: tipPos ? "visible" : "hidden",
              maxWidth: "calc(100vw - 16px)",
              pointerEvents: "none",
              zIndex: 1200,
            }}
          >
            <TipBox
              title={`${rows[hover.r].label}, ${columns[hover.c]}`}
              rows={[
                {
                  label: "지역 내 비율",
                  value: fmtPct(pct[hover.r][hover.c], 2),
                },
                {
                  label: "충전기",
                  value: `${fmtInt(rows[hover.r].counts[hover.c])}기`,
                },
                {
                  label: "지역 합계",
                  value: `${fmtInt(rows[hover.r].counts.reduce((s, v) => s + v, 0))}기`,
                },
              ]}
            />
          </div>,
          document.body,
        )}
      <div className="heat-legend" aria-hidden="true">
        <span>열 안에서 낮음</span>
        <i
          style={{
            background: `linear-gradient(90deg, ${seqColor(0)}, ${seqColor(0.5)}, ${seqColor(1)})`,
          }}
        />
        <span>높음 (칸 숫자: 지역 내 %)</span>
      </div>
    </div>
  );
}
