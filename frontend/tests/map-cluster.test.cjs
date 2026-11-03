/* Map clustering (pure functions used by the canvas cluster layer): every station lands in exactly one cluster,
 * nearby points merge, far points stay apart, and marker sizes stay within their bounds. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const { gridCluster, clusterRadius, regionRadius, stationRadius, CLUSTER_OFF_ZOOM } = loader()('src/components/geo/cluster.ts');

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
