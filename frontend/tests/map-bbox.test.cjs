/* Map view → API bbox (N-2): the request must always cover the whole screen.
 * Previously Math.round(v, 3 decimals) could move an edge inward by up to 0.0005° (≈ 100px at zoom 18),
 * so stations near the screen edge were not requested or drawn. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const { coverBBox, BBOX_DECIMALS } = loader()('src/components/geo/bbox.ts');
const UNIT = 10 ** -BBOX_DECIMALS;

const covers = (b, w, s, e, n) => b[0] <= w && b[1] <= s && b[2] >= e && b[3] >= n;
const decimals = (v) => (String(v).split('.')[1] ?? '').length;

test('the bbox always contains the real view (outward on every edge)', () => {
  // 0.0004–0.0006 fractions: the old 3-decimal rounding moved these edges inward
  const views = [
    [126.9786, 37.5656, 126.9894, 37.5714],
    [126.97851, 37.56549, 126.98949, 37.57151],
    [129.16044, 35.15855, 129.16446, 35.16061],
    [127.0285999, 37.2635001, 127.0291001, 37.2640999],
  ];
  for (const v of views) {
    const b = coverBBox(...v);
    assert.ok(covers(b, ...v), JSON.stringify({ v, b }));
    const old = v.map((x) => Math.round(x * 1000) / 1000);
    // at least one of these views was cut by the old rule (regression guard for the test itself)
    if (v === views[0]) assert.ok(!covers(old, ...v), 'old rounding must cut this view');
  }
});

test('expansion is at most one 5-decimal unit (≈ 1 m) per edge', () => {
  for (let i = 0; i < 2000; i += 1) {
    const w = 124 + Math.random() * 8;
    const s = 33 + Math.random() * 6;
    const v = [w, s, w + Math.random() * 0.05, s + Math.random() * 0.03];
    const b = coverBBox(...v);
    assert.ok(covers(b, ...v), JSON.stringify({ v, b }));
    assert.ok(v[0] - b[0] <= UNIT + 1e-12 && v[1] - b[1] <= UNIT + 1e-12 && b[2] - v[2] <= UNIT + 1e-12 && b[3] - v[3] <= UNIT + 1e-12, JSON.stringify({ v, b }));
    b.forEach((x) => assert.ok(decimals(x) <= BBOX_DECIMALS, `${x} has more than ${BBOX_DECIMALS} decimals`));
  }
});

test('values already on the grid stay unchanged; floating-point residue does not widen them', () => {
  assert.deepEqual(coverBBox(126.978, 37.5, 127, 37.6), [126.978, 37.5, 127, 37.6]);
  assert.deepEqual(coverBBox(126.97800000000001, 37.49999999999999, 126.99000000000001, 37.6), [126.978, 37.5, 126.99, 37.6]);
  assert.deepEqual(coverBBox(0.1 + 0.2, 33, 127, 34), [0.3, 33, 127, 34]);
});

test('same view → same bbox (deterministic request key) and world limits are kept', () => {
  const v = [126.978123456, 37.566543219, 126.99887766, 37.5711];
  assert.deepEqual(coverBBox(...v), coverBBox(...v));
  assert.deepEqual(coverBBox(-180.0000001, -90.0000001, 180.0000001, 90.0000001), [-180, -90, 180, 90]);
});

test('the request parameter keeps the covering bbox exactly (no re-rounding inward)', () => {
  const { bboxParam } = loader()('src/api/endpoints.ts');
  for (let i = 0; i < 2000; i += 1) {
    const w = 124 + Math.random() * 8;
    const s = 33 + Math.random() * 6;
    const v = [w, s, w + Math.random() * 0.02, s + Math.random() * 0.02];
    const sent = bboxParam(coverBBox(...v)).split(',').map(Number);
    assert.ok(covers(sent, ...v), JSON.stringify({ v, sent }));
    assert.deepEqual(sent, coverBBox(...v));
  }
  // the previous toFixed(4) would have shrunk this covered view back inside the screen
  const v = [127.02799410578749, 37.494389139251915, 127.04500728699435, 37.50661086074809];
  const old = coverBBox(...v).map((x) => Number(x.toFixed(4)));
  assert.ok(!covers(old, ...v), 'old 4-decimal formatting must cut this view');
  assert.equal(bboxParam(coverBBox(...v)), '127.02799,37.49438,127.04501,37.50662');
  // other callers (same-location list lookup) keep up to 7 decimals
  assert.equal(bboxParam([126.12345678, 37.1, 127, 37.2]), '126.1234568,37.1,127,37.2');
});
