/* 도넛 툴팁 위치(charts/donutTip.ts): 링 위 어느 지점을 가리켜도 툴팁이 중앙 숫자·라벨이 있는 안쪽 원과 겹치지 않고,
 * 보이는 영역 안에 들어오며, 공간이 있으면 포인터 바로 옆(바깥쪽)에 놓이는지 검증합니다. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const { placeDonutTip, rectCircleDistance } = loader()('src/charts/donutTip.ts');

const ring = (size) => {
  const c = size / 2, ri = c * 0.68, ro = c * 0.92, pts = [];
  for (let deg = 0; deg < 360; deg += 7.5) for (const r of [ri + 1, (ri + ro) / 2, ro - 1]) pts.push({ x: c + r * Math.cos((deg * Math.PI) / 180), y: c + r * Math.sin((deg * Math.PI) / 180) });
  return { c, ri, pts };
};
const inside = (p, tip, b) => p.x >= b.x - 1e-6 && p.y >= b.y - 1e-6 && p.x + tip.w <= b.x + b.w + 1e-6 && p.y + tip.h <= b.y + b.h + 1e-6;

// [설명, 도넛 크기, 툴팁 크기, 보이는 영역(도넛 상자 기준)]
const cases = [
  ['card desktop (300px donut, roomy card)', 300, { w: 182, h: 97 }, { x: -40, y: -60, w: 640, h: 420 }],
  ['card desktop (190px donut)', 190, { w: 170, h: 97 }, { x: -24, y: -80, w: 560, h: 360 }],
  ['long type name (wider tooltip)', 220, { w: 236, h: 97 }, { x: -24, y: -90, w: 700, h: 400 }],
  ['390px phone (legend wraps below)', 190, { w: 170, h: 97 }, { x: -20, y: -160, w: 342, h: 700 }],
  ['donut flush with the left edge', 220, { w: 170, h: 97 }, { x: 0, y: -40, w: 380, h: 330 }],
];

for (const [name, size, tip, bounds] of cases) {
  test(`${name}: never covers the centre and stays visible`, () => {
    const { c, ri, pts } = ring(size);
    for (const p of pts) {
      const pos = placeDonutTip(p, tip, size, ri, bounds);
      const rect = { ...pos, ...tip };
      assert.ok(rectCircleDistance(rect, c, c) >= ri, `covers centre at ${JSON.stringify(p)} → ${JSON.stringify(pos)}`);
      assert.ok(inside(pos, tip, bounds), `clipped at ${JSON.stringify(p)} → ${JSON.stringify(pos)}`);
    }
  });
}

test('with room, the tooltip sits right next to the pointer on the outward side (follows the mouse)', () => {
  const size = 300, { ri } = ring(size), tip = { w: 180, h: 97 }, bounds = { x: -400, y: -400, w: 1100, h: 1100 };
  const right = placeDonutTip({ x: 270, y: 160 }, tip, size, ri, bounds);
  assert.deepEqual(right, { x: 282, y: 172 });
  const topLeft = placeDonutTip({ x: 60, y: 50 }, tip, size, ri, bounds);
  assert.deepEqual(topLeft, { x: 60 - 12 - 180, y: 50 - 12 - 97 });
  const moved = placeDonutTip({ x: 275, y: 170 }, tip, size, ri, bounds);
  assert.deepEqual(moved, { x: 287, y: 182 });
});
