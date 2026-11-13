/* Map clustering (pure functions used by the canvas cluster layer): every station lands in exactly one cluster,
 * nearby points merge, far points stay apart, and marker sizes stay within their bounds. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const { gridCluster, weightedGridCluster, clusterRadius, regionRadius, stationRadius, CLUSTER_OFF_ZOOM } = loader()('src/components/geo/cluster.ts');

const pts = (list) => list.map(([x, y], i) => ({ id: `s${i}`, x, y, lat: 37 + y / 1000, lng: 127 + x / 1000 }));
const run = (items, cell = 64) => gridCluster(items, (p) => ({ x: p.x, y: p.y }), (p) => [p.lat, p.lng], cell);

test('every input point is in exactly one cluster', () => {
  const items = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2000;
  for (let i = 0; i < 5000; i += 1) items.push({ id: `p${i}`, x: rnd(), y: rnd(), lat: 0, lng: 0 });
  const clusters = run(items);
  const ids = clusters.flatMap((c) => c.members.map((m) => m.id));
  assert.equal(ids.length, items.length);
  assert.equal(new Set(ids).size, items.length);
});

test('points closer than a cell merge across a cell edge; far points stay separate', () => {
  const clusters = run(pts([[63, 10], [65, 10], [500, 500]]));
  assert.equal(clusters.length, 2);
  const big = clusters.find((c) => c.members.length === 2);
  assert.ok(big);
  assert.equal(big.x, 64);
  assert.ok(Math.abs(big.lng - 127.064) < 1e-9);
  assert.equal(big.west, 127.063);
  assert.equal(big.east, 127.065);
});

test('a tiny cell (individual-station zoom) keeps distinct points apart', () => {
  const clusters = run(pts([[10, 10], [12, 10], [14, 10]]), 0.5);
  assert.equal(clusters.length, 3);
  assert.ok(clusters.every((c) => c.members.length === 1));
});

test('non-finite projections are skipped instead of producing NaN clusters', () => {
  const clusters = gridCluster([{ x: NaN }, { x: 1 }], (p) => ({ x: p.x, y: 0 }), () => [0, 0], 64);
  assert.equal(clusters.length, 1);
});

test('marker sizes are bounded and grow with counts', () => {
  assert.equal(clusterRadius(1), 12);
  assert.ok(clusterRadius(100) > clusterRadius(10));
  assert.equal(clusterRadius(10 ** 9), 30);
  assert.equal(regionRadius(0, 100), 11);
  assert.equal(regionRadius(100, 100), 31);
  assert.equal(stationRadius(0), 4);
  assert.equal(stationRadius(10 ** 6), 9);
  assert.ok(CLUSTER_OFF_ZOOM > 11);
});

/* Server grid cells (/api/locations/grid) re-merged on screen: weighted by station count. */
const cells = (list) => list.map(([x, y, n], i) => ({ id: `g${i}`, x, y, n, lat: 37 + y / 1000, lng: 127 + x / 1000 }));
const runW = (items, cell = 64) => weightedGridCluster(items, (c) => ({ x: c.x, y: c.y }),
  (c) => ({ weight: c.n, lat: c.lat, lng: c.lng, south: c.lat - 0.001, west: c.lng - 0.001, north: c.lat + 0.001, east: c.lng + 0.001 }), cell);

test('weighted: total station count is preserved and every cell lands in exactly one cluster', () => {
  const items = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3000; i += 1) items.push({ id: `c${i}`, x: rnd() * 1500, y: rnd() * 700, n: 1 + Math.floor(rnd() * 40), lat: 37, lng: 127 });
  const out = runW(items);
  assert.equal(out.reduce((n, c) => n + c.count, 0), items.reduce((n, c) => n + c.n, 0));
  const ids = out.flatMap((c) => c.members.map((m) => m.id));
  assert.equal(new Set(ids).size, items.length);
  assert.equal(ids.length, items.length);
});

test('weighted: centroid and lat/lng follow station counts; bounds are the union of cell bounds', () => {
  const out = runW(cells([[60, 10, 3], [66, 10, 1]]));
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 4);
  assert.ok(Math.abs(out[0].x - 61.5) < 1e-9);
  assert.ok(Math.abs(out[0].lng - 127.0615) < 1e-9);
  assert.ok(Math.abs(out[0].west - 127.059) < 1e-9 && Math.abs(out[0].east - 127.067) < 1e-9);
});

test('weighted: zero-weight cells are ignored; far cells stay separate', () => {
  const out = runW(cells([[10, 10, 0], [500, 500, 2], [10, 300, 5]]));
  assert.deepEqual(out.map((c) => c.count).sort(), [2, 5]);
});

test('gridCluster (weight 1) still reports count = members', () => {
  const out = run(pts([[1, 1], [2, 2], [900, 900]]));
  assert.ok(out.every((c) => c.count === c.members.length));
});
