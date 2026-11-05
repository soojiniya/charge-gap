/**
 * 도넛 툴팁 위치 계산(순수 함수). 좌표는 모두 도넛 상자(size×size) 기준 px입니다.
 * - 포인터 옆(gap만큼 떨어진 곳)에 두되, 중앙 숫자·라벨이 있는 안쪽 원(innerR)과 겹치지 않는 자리를 고릅니다.
 * - 보이는 영역(bounds: 화면과 잘라내는 상위 요소의 교집합)을 벗어나 글씨가 잘리지 않게 합니다.
 * 바깥쪽(포인터가 중심에서 멀어지는 방향) 사분면을 먼저 시도하고, 안 되면 다른 사분면 → 도넛 상자 바깥 순서로 고릅니다.
 */
export interface TipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));

/** 사각형과 원 중심 사이의 최단 거리 */
export function rectCircleDistance(r: TipRect, cx: number, cy: number) {
  const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w));
  const dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function placeDonutTip(
  pointer: { x: number; y: number },
  tip: { w: number; h: number },
  size: number,
  innerR: number,
  bounds: TipRect,
  gap = 12,
): { x: number; y: number } {
  const c = size / 2;
  const clear = innerR + 2;
  const { w, h } = tip;
  const fits = (r: TipRect) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;
  const ok = (r: TipRect) => fits(r) && rectCircleDistance(r, c, c) >= clear;
  const sx = pointer.x >= c ? 1 : -1;
  const sy = pointer.y >= c ? 1 : -1;
  const quad = (qx: number, qy: number): TipRect => ({
    x: qx > 0 ? pointer.x + gap : pointer.x - gap - w,
    y: qy > 0 ? pointer.y + gap : pointer.y - gap - h,
    w,
    h,
  });
  const clampY = (y: number) => clamp(y, bounds.y, bounds.y + bounds.h - h);
  const clampX = (x: number) => clamp(x, bounds.x, bounds.x + bounds.w - w);
  const side = {
    right: { x: size + gap, y: clampY(pointer.y - h / 2), w, h },
    left: { x: -w - gap, y: clampY(pointer.y - h / 2), w, h },
    below: { x: clampX(pointer.x - w / 2), y: size + gap, w, h },
    above: { x: clampX(pointer.x - w / 2), y: -h - gap, w, h },
  };
  const outside = [
    sx > 0 ? side.right : side.left,
    sy > 0 ? side.below : side.above,
    sy > 0 ? side.above : side.below,
    sx > 0 ? side.left : side.right,
  ];
  const candidates = [quad(sx, sy), quad(sx, -sy), quad(-sx, sy), quad(-sx, -sy), ...outside];
  const hit = candidates.find(ok);
  if (hit) return { x: hit.x, y: hit.y };
  // 어디에도 온전히 들어가지 않으면(아주 좁은 화면) 중앙 원을 피하는 것을 우선하고 보이는 영역 안으로 당깁니다.
  const pull = (r: TipRect): TipRect => ({ ...r, x: clampX(r.x), y: clampY(r.y) });
  const pulled = candidates.map(pull).find((r) => rectCircleDistance(r, c, c) >= clear);
  const best = pulled ?? pull(candidates[0]);
  return { x: best.x, y: best.y };
}
