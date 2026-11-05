/* Regional disparity: rule-based sentences, rank ties, 0건/0분모/미집계 states, heatmap color rule, URL params.
 * Uses small synthetic API responses so every branch is covered; real-API checks run in the browser regression. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const D = loader()('src/analysis/disparity.ts');

const typeItem = (code, count, denom, rank) => ({ charger_type_code: code, charger_count: count, denominator: denom, value_pct: denom ? (count / denom) * 100 : null, rank });
function row(code, name, o) {
  return {
    region_code: code, region_name: name, charger_count: o.chargers, station_count: o.stations,
    metrics: {
      high_100kw: { numerator: o.hi[0], denominator: o.hi[1], value_pct: o.hi[1] ? (o.hi[0] / o.hi[1]) * 100 : null, rank: o.hiRank },
      chargers_per_station: { numerator: o.chargers, denominator: o.stations, value: o.stations ? o.chargers / o.stations : null, rank: o.cpsRank },
      type_mix: o.types,
      operator_hhi: { value: o.hhi, scale: '0-10000', operator_count: o.ops, rank: o.hhiRank },
      deletion_share: { numerator: o.del[0], denominator: o.del[1], value_pct: o.del[1] ? (o.del[0] / o.del[1]) * 100 : null, rank: o.delRank },
    },
  };
}
const data = {
  regions: [
    row('11', '서울', { chargers: 100, stations: 40, hi: [20, 80], hiRank: 1, cpsRank: 2, types: [typeItem('04', 30, 100, 1), typeItem('02', 70, 100, 2)], hhi: 2500, ops: 5, hhiRank: 2, del: [5, 110], delRank: 1 }),
    row('26', '부산', { chargers: 50, stations: 20, hi: [5, 20], hiRank: 1, cpsRank: 1, types: [typeItem('04', 0, 50, 3), typeItem('02', 50, 50, 1)], hhi: 5000, ops: 2, hhiRank: 1, del: [0, 50], delRank: 2 }),
    row('27', '대구', { chargers: 30, stations: 30, hi: [0, 0], hiRank: undefined, cpsRank: 3, types: [typeItem('04', 3, 30, 2), typeItem('02', 27, 30, 3)], hhi: 2500, ops: 4, hhiRank: 2, del: [0, 30], delRank: 2 }),
    row('50', '제주', { chargers: 0, stations: 0, hi: [0, 0], types: [], hhi: null, ops: 0, del: [1, 4], delRank: 2 }),
  ],
  national: {
    high_100kw: { numerator: 25, denominator: 100, value_pct: 25 },
    chargers_per_station: { numerator: 180, denominator: 90, value: 2 },
    type_mix: [typeItem('04', 33, 180), typeItem('02', 147, 180)],
    operator_hhi: { value: 2000, scale: '0-10000', operator_count: 8 },
    deletion_share: { numerator: 6, denominator: 194, value_pct: (6 / 194) * 100 },
  },
};
data.regions[3].metrics.deletion_share.value_pct = 25; // 제주 4기 중 1기
data.regions[3].metrics.deletion_share.rank = 1; // 25% > 서울 4.5% (synthetic, only for state tests)
const [seoul, busan, daegu, jeju] = data.regions;
const text = (r, k, t = '04', ctx = { typeName: 'DC콤보' }) => D.narrate(data, r, k, t, ctx).join(' ');

test('higher / lower / same than national, with the displayed numbers', () => {
  assert.match(text(seoul, 'high_100kw'), /서울의 100kW 이상 충전기 비중은 25\.00%로 전국 기준\(25\.00%\)과 같은 수준입니다/);
  assert.match(text(seoul, 'high_100kw'), /출력값이 확인된 충전기 80기 중 20기가 100kW 이상/);
  assert.match(text(seoul, 'chargers_per_station'), /서울의 충전소당 평균 충전기 수는 2\.50기\/곳으로 전국 기준\(2\.00기\/곳\)보다 0\.50기\/곳 높습니다/);
  assert.match(text(daegu, 'chargers_per_station'), /대구의 .*1\.00기\/곳.*보다 1\.00기\/곳 낮습니다/);
  assert.match(text(seoul, 'operator_hhi'), /2,500점으로 전국 기준\(2,000점\)보다 500점 높습니다/);
});

test('ties are reported with the number of tied regions', () => {
  assert.match(text(seoul, 'high_100kw'), /2개 지역 중 1위\(2개 지역 공동\)/);
  assert.match(text(seoul, 'operator_hhi'), /3개 지역 중 2위\(2개 지역 공동\)/);
  assert.match(text(busan, 'chargers_per_station'), /3개 지역 중 1위입니다/);
  assert.doesNotMatch(text(busan, 'chargers_per_station'), /공동/);
});

test('0 chargers, 0 denominator and missing fields are distinguished', () => {
  assert.equal(D.metricReading(data, jeju, 'high_100kw', '04').status, 'no-chargers');
  assert.match(text(jeju, 'high_100kw'), /충전기가 제주에 0기여서 .*계산하지 않았고 순위에서도 제외/);
  assert.match(text(jeju, 'type_mix'), /0기여서/);
  assert.equal(D.metricReading(data, daegu, 'high_100kw', '04').status, 'zero-denominator');
  assert.match(text(daegu, 'high_100kw'), /충전기 30기가 있지만 출력값이 확인된 충전기가 0기여서\(분모 0\)/);
  // deletion share uses its own population: 제주 has 4 rows across all deletion statuses
  assert.equal(D.metricReading(data, jeju, 'deletion_share', '04').status, 'ok');
  const broken = structuredClone(seoul);
  delete broken.metrics.operator_hhi;
  assert.equal(D.metricReading(data, broken, 'operator_hhi', '04').status, 'not-aggregated');
  assert.match(D.narrate(data, broken, 'operator_hhi', '04').join(' '), /집계되지 않아/);
});

test('type share: a present region with 0 of the type says 0기, not missing', () => {
  const t = text(busan, 'type_mix');
  assert.match(t, /유형 04 DC콤보 충전기는 부산 충전기의 0\.00%\(0기\)/);
  assert.match(t, /충전기가 없어 비중이 0%/);
});

test('no national value -> no comparison sentence', () => {
  const d2 = structuredClone(data);
  d2.national.operator_hhi.value = null;
  assert.match(D.narrate(d2, seoul, 'operator_hhi', '04').join(' '), /전국 기준값이 없어 전국과 비교하지 않았습니다/);
});

test('HHI is explained as operator concentration; deletion is not called a fault', () => {
  assert.match(text(seoul, 'operator_hhi'), /점유율을 제곱해 더한 값\(0–10,000\).*소수 운영기관에 몰려/);
  assert.match(text(seoul, 'operator_hhi'), /운영기관 그룹 5개/);
  const del = text(seoul, 'deletion_share');
  assert.match(del, /110기 중 삭제 표시 충전기는 5기로 4\.55%/);
  assert.match(del, /실제 고장이나 사용 불가를 뜻하지 않습니다/);
});

test('sentences never judge good/bad or claim demand/shortage', () => {
  const all = [];
  for (const r of data.regions) for (const k of D.DISPARITY_METRIC_KEYS) for (const t of ['04', '02', '07']) all.push(D.narrate(data, r, k, t).join(' '));
  all.push(D.NARRATIVE_NOTE);
  const banned = /(부족합니다|부족하다|부족한|수요가 (많|적|높|낮)|좋습니다|나쁩니다|우수|열악|취약|양호|고장입니다|고장 난|사용할 수 없습니다)/;
  for (const s of all.slice(0, -1)) assert.doesNotMatch(s, banned, s);
  assert.match(D.NARRATIVE_NOTE, /좋고 나쁨을 뜻하지 않습니다/);
});

test('particle (으)로 follows the last syllable', () => {
  assert.equal(D.ro('2.50기/곳'), '2.50기/곳으로');
  assert.equal(D.ro('596점'), '596점으로');
  assert.equal(D.ro('4.69%'), '4.69%로');
  assert.equal(D.ro('5.32%(1,342기)'), '5.32%(1,342기)로');
});

test('card headline: one short comparison line, or the state', () => {
  assert.equal(D.headline(data, seoul, 'high_100kw', '04'), '전국 기준(25.00%)과 같은 수준입니다.');
  assert.equal(D.headline(data, seoul, 'chargers_per_station', '04'), '전국 기준(2.00기/곳)보다 0.50기/곳 높습니다.');
  assert.equal(D.headline(data, daegu, 'chargers_per_station', '04'), '전국 기준(2.00기/곳)보다 1.00기/곳 낮습니다.');
  assert.equal(D.headline(data, jeju, 'high_100kw', '04'), '필터 조건의 충전기가 0기라 계산하지 않았습니다.');
  assert.match(D.headline(data, daegu, 'high_100kw', '04'), /분모 0/);
  const broken = structuredClone(seoul); delete broken.metrics.operator_hhi;
  assert.match(D.headline(data, broken, 'operator_hhi', '04'), /^미집계/);
  assert.equal(D.rankLine(data, seoul, 'high_100kw', '04'), '2개 지역 중 1위(2개 지역 공동)');
  assert.equal(D.rankLine(data, jeju, 'high_100kw', '04'), '순위 없음(계산 제외)');
  for (const r of data.regions) for (const k of D.DISPARITY_METRIC_KEYS) assert.doesNotMatch(D.headline(data, r, k, '04'), /(부족|위험|좋음|나쁨|좋습니다|나쁩니다)/);
});

test('default explanations are Korean; field names only in the technical list', () => {
  const internal = /(output_kw|statId|chgerType|busiId|busiNm|delYn|zcode)/;
  for (const k of D.DISPARITY_METRIC_KEYS) {
    const d = D.DISPARITY_DEFS[k];
    for (const t of [d.definition, d.formula, d.numerator, d.denominator, d.caution, ...d.variables]) assert.doesNotMatch(t, internal, `${k}: ${t}`);
    assert.ok(d.fields.some((f) => internal.test(f)), k);
  }
  for (const r of data.regions) for (const k of D.DISPARITY_METRIC_KEYS) assert.doesNotMatch(D.narrate(data, r, k, '04').join(' '), internal);
});

test('equality uses the displayed rounding', () => {
  assert.equal(D.compareToNational(25.004, 25, 'high_100kw'), 'same');
  assert.equal(D.compareToNational(25.006, 25, 'high_100kw'), 'up');
  assert.equal(D.compareToNational(1999.6, 2000, 'operator_hhi'), 'same');
  assert.equal(D.compareToNational(null, 25, 'high_100kw'), null);
});

test('heatmap color matches the original rule exactly', () => {
  const old = (delta, national) => {
    if (delta == null) return undefined;
    const intensity = Math.min(1, Math.abs(delta) / (Math.abs(national ?? 0) || 1));
    return delta >= 0 ? [129, 211, 203, 0.1 + intensity * 0.35] : [177, 157, 255, 0.1 + intensity * 0.35];
  };
  const parse = (c) => c && c.match(/[\d.]+/g).map(Number);
  for (const [d, n] of [[0, 25], [5, 25], [-5, 25], [30, 25], [-100, 25], [0.4, 0], [3, null], [-0.2, 2], [null, 5], [500, 2000]]) {
    const a = parse(D.heatColor(d, n));
    const b = old(d, n);
    if (b === undefined) { assert.equal(a, undefined); continue; }
    assert.deepEqual(a.slice(0, 3), b.slice(0, 3), `${d},${n}`);
    assert.ok(Math.abs(a[3] - b[3]) < 1e-4, `${d},${n}`);
  }
  assert.equal(D.heatScale(25), 25);
  assert.equal(D.heatScale(0), 1);
  assert.equal(D.heatScale(null), 1);
});

test('URL params: valid values kept, invalid/default/irrelevant removed', () => {
  const codes = ['01', '02', '04', '07'];
  const p = (s) => D.parseGapParams(new URLSearchParams(s), codes);
  assert.deepEqual(p(''), { metric: 'high_100kw', type: '04', remove: [] });
  assert.deepEqual(p('gap_metric=operator_hhi'), { metric: 'operator_hhi', type: '04', remove: [] });
  assert.deepEqual(p('gap_metric=type_mix&gap_type=02'), { metric: 'type_mix', type: '02', remove: [] });
  assert.deepEqual(p('gap_metric=bogus&gap_type=02'), { metric: 'high_100kw', type: '04', remove: ['gap_metric', 'gap_type'] });
  assert.deepEqual(p('gap_metric=type_mix&gap_type=99'), { metric: 'type_mix', type: '04', remove: ['gap_type'] });
  assert.deepEqual(p('gap_metric=high_100kw'), { metric: 'high_100kw', type: '04', remove: ['gap_metric'] });
  assert.deepEqual(p('gap_metric=deletion_share&gap_type=02'), { metric: 'deletion_share', type: '04', remove: ['gap_type'] });
  // does not touch the shared filter keys
  assert.deepEqual(p('region=11&type=02&cmp_a=11').remove, []);
});
