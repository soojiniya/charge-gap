/* Overview "주요 분석 발견" 계산(analysis/keyFindings.ts): 응답에서만 계산하고, 상관계수는 16개 지역 실제 값으로 구합니다. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./ts-loader.cjs');

const K = loader()('src/analysis/keyFindings.ts');

const row = (code, name, chargers, fast, cps, hhi) => ({
  region_code: code, region_name: name, charger_count: chargers, station_count: Math.round(chargers / cps),
  metrics: {
    high_100kw: { value_pct: fast, rank: 0 }, chargers_per_station: { value: cps }, type_mix: [],
    operator_hhi: { value: hhi, rank: 0 }, deletion_share: { value_pct: 1 },
  },
});
const data = {
  regions: [row('11', '서울', 900, 5, 6.5, 700), row('47', '경북', 200, 15, 3.9, 470), row('36', '세종', 50, 5.4, 6.3, 1100), row('12', '전남광주통합특별시', 300, 8.6, 4.0, 640)],
  national: { high_100kw: { value_pct: 8 }, chargers_per_station: { value: 5.2 }, operator_hhi: { value: 585.7 }, type_mix: [], deletion_share: { value_pct: 1 } },
};
data.regions[0].metrics.high_100kw.rank = 4;

test('extremes, difference inputs and above/below counts come from the response', () => {
  const f = K.computeKeyFindings(data);
  assert.equal(f.fast.max.name, '경북');
  assert.equal(f.fast.min.name, '서울');
  assert.equal(f.fast.national, 8);
  assert.equal(f.fast.above, 2);
  assert.equal(f.fast.below, 2);
  assert.deepEqual([f.fast.largest.name, f.fast.largest.chargers, f.fast.largest.rank], ['서울', 900, 4]);
  assert.equal(f.hhi.max.name, '세종');
  assert.equal(f.hhi.min.name, '경북');
  assert.equal(f.hhi.national, 585.7);
  assert.equal(f.fast.points.find((p) => p.code === '12').name, '전남광주', 'region 12 uses the short label');
});

test('correlation is the Pearson r of chargers-per-station vs 100kW share over the regions', () => {
  const f = K.computeKeyFindings(data);
  const xs = data.regions.map((r) => r.metrics.chargers_per_station.value);
  const ys = data.regions.map((r) => r.metrics.high_100kw.value_pct);
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const [mx, my] = [m(xs), m(ys)];
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const r = sxy / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  assert.ok(Math.abs(f.correlation.r - r) < 1e-12);
  assert.equal(f.correlation.n, 4);
  assert.equal(f.correlation.xMax.name, '서울');
  assert.equal(f.correlation.xMin.name, '경북');
  assert.equal(K.fmtR(-0.9017), '−0.90');
});

test('missing data gives null instead of invented numbers', () => {
  assert.equal(K.computeKeyFindings(undefined), null);
  assert.equal(K.computeKeyFindings({ regions: [], national: data.national }), null);
});

test('section sits between the KPIs and the charts; numbers are not hard-coded; no EV data is combined', () => {
  const root = path.resolve(__dirname, '..');
  const overview = fs.readFileSync(path.join(root, 'src/pages/Overview.tsx'), 'utf8');
  assert.match(overview, /<Kpis \/>\s*<KeyFindingsSection \/>\s*<CumulativeCard/);
  const ui = fs.readFileSync(path.join(root, 'src/features/KeyFindings.tsx'), 'utf8');
  for (const n of ['14.65', '4.69', '9.96', '0.90', '1,104.7', '585.7', '8.04']) assert.ok(!ui.includes(n), `hard-coded ${n}`);
  assert.doesNotMatch(ui, /useEvRegistration|ev_registration|부족률을 (계산|추정)합니다/);
  assert.match(ui, /원인을 뜻하지 않습니다/);
  assert.match(ui, /독점 여부나 서비스 품질을 판정하는 지표가 아닙니다/);
  assert.match(ui, /getChargerInfo/);
});

test('finding links target the disparity card anchor, which scrolls only when the hash is present', () => {
  const root = path.resolve(__dirname, '..');
  const ui = fs.readFileSync(path.join(root, 'src/features/KeyFindings.tsx'), 'utf8');
  assert.match(ui, /pathname: '\/regional-explorer', search, hash: '#regional-gap'/);
  const gap = fs.readFileSync(path.join(root, 'src/features/RegionalDisparity.tsx'), 'utf8');
  assert.match(gap, /export const REGIONAL_GAP_ANCHOR = 'regional-gap'/);
  assert.match(gap, /id=\{REGIONAL_GAP_ANCHOR\}/);
  assert.match(gap, /useHashScroll\(REGIONAL_GAP_ANCHOR, !query\.isLoading\)/);
  const hook = fs.readFileSync(path.join(root, 'src/lib/hashScroll.ts'), 'utf8');
  assert.match(hook, /if \(hash !== `#\$\{id\}` \|\| !ready \|\| done\.current === key\) return;/);
});
