/* Canvas map layer helpers: region circles hidden under on-map controls (legend, zoom buttons, top bar)
 * are moved to the nearest free spot inside the map (F-3). */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const { avoidObstacles } = loader()('src/components/geo/MarkCanvasLayer.ts');

const size = { x: 659, y: 540 };
const legend = { left: 13, top: 402, right: 257, bottom: 527 }; // 1024px: 펼친 범례
const zoom = { left: 610, top: 407, right: 646, bottom: 511 };
const topbar = { left: 13, top: 13, right: 479, bottom: 55 };
const free = (p, pad, obs) => obs.every((o) => !(p.x + pad > o.left && p.x - pad < o.right && p.y + pad > o.top && p.y - pad < o.bottom));

test('a circle that is not covered stays where it is', () => {
  assert.deepEqual(avoidObstacles(300, 300, 20, [legend, zoom, topbar], size), { x: 300, y: 300 });
});

test('Jeju pinned at the bottom edge under the legend moves to the nearest free spot inside the map', () => {
  const pad = 26;
  const p = avoidObstacles(150, size.y - pad, pad, [legend, zoom, topbar], size);
  assert.ok(free(p, pad, [legend, zoom, topbar]), JSON.stringify(p));
  assert.ok(p.x >= pad && p.y >= pad && p.x <= size.x - pad && p.y <= size.y - pad, JSON.stringify(p));
  // 가장 가까운 후보: 범례 오른쪽(같은 높이) 또는 범례 위 — 이동 거리가 범례 크기를 넘지 않음
  assert.ok(Math.hypot(p.x - 150, p.y - (size.y - pad)) <= 260, JSON.stringify(p));
});

test('a circle under the zoom buttons moves out of them; one under the top bar moves below it', () => {
  const a = avoidObstacles(628, 460, 20, [legend, zoom, topbar], size);
  assert.ok(free(a, 20, [legend, zoom, topbar]), JSON.stringify(a));
  const b = avoidObstacles(200, 30, 18, [legend, zoom, topbar], size);
  assert.ok(free(b, 18, [legend, zoom, topbar]) && b.y >= topbar.bottom + 18, JSON.stringify(b));
});

test('no free spot → original position is kept (never moved outside the map)', () => {
  const all = { left: 0, top: 0, right: size.x, bottom: size.y };
  assert.deepEqual(avoidObstacles(100, 100, 20, [all], size), { x: 100, y: 100 });
});
