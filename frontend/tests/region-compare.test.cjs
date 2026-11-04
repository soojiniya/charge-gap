/* 두 지역 비교: 계산(비중·%p·배수·공동 순위·0 나눗셈), URL 정리(cmp_a·cmp_b), 출력 구간·100kW 이상 비중,
 * 유형 구성 상위 5 + 기타, 분석 문장의 금지 표현(교차 기준일 비율, 삭제 표시 = 이용 가능 해석)을 검증합니다. */
const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('./ts-loader.cjs');

const m = loader()('src/analysis/regionCompare.tsx');
const text = (node) => renderToStaticMarkup(React.createElement(React.Fragment, null, node)).replace(/<[^>]+>/g, '');
const CODES = ['11', '12', '26', '27', '28', '30', '31', '36', '41', '43', '44', '47', '48', '50', '51', '52'];

test('ratio/share return null for zero, negative or missing denominators', () => {
  assert.equal(m.ratio(5, 0), null);
  assert.equal(m.ratio(5, -1), null);
  assert.equal(m.ratio(null, 3), null);
  assert.equal(m.ratio(5, undefined), null);
  assert.equal(m.ratio(Number.NaN, 3), null);
  assert.equal(m.share(1, 4), 25);
  assert.equal(m.ppDiff(10, null), null);
  assert.equal(m.ppDiff(10, 12.5), 2.5);
});

test('times only when both values are positive', () => {
  assert.equal(m.times(0, 5), null);
  assert.equal(m.times(5, 0), null);
  assert.equal(m.times(null, 5), null);
  assert.deepEqual(m.times(10, 25), { larger: 'b', x: 2.5 });
  assert.deepEqual(m.times(30, 10), { larger: 'a', x: 3 });
  assert.deepEqual(m.times(7, 7), { larger: 'same', x: 1 });
  assert.equal(m.fmtTimes(m.times(10, 25), '서울', '경기'), '경기가 서울의 2.5배');
  assert.equal(m.fmtTimes(m.times(30, 10), '서울', '경기'), '서울이 경기의 3.0배');
  assert.equal(m.fmtTimes(m.times(0, 10), '서울', '경기'), null);
  assert.equal(m.fmtTimes(m.times(79371, 78509), '전남광주', '제주'), '전남광주가 제주의 1.01배');
});

test('rankDesc uses competition ranking with ties and skips missing values', () => {
  const items = [
    { code: 'a', value: 10 },
    { code: 'b', value: 30 },
    { code: 'c', value: 30 },
    { code: 'd', value: 5 },
    { code: 'e', value: null },
  ];
  assert.deepEqual(m.rankDesc(items, 'b'), { rank: 1, tied: true, of: 4 });
  assert.deepEqual(m.rankDesc(items, 'a'), { rank: 3, tied: false, of: 4 });
  assert.equal(m.rankDesc(items, 'e'), null);
  assert.equal(m.fmtRank({ rank: 1, tied: true, of: 16 }), '16개 중 1위(공동)');
});

test('parseCompareParams drops invalid codes and a B equal to A', () => {
  const p = (q) => m.parseCompareParams(new URLSearchParams(q), CODES);
  assert.deepEqual(p(''), { a: undefined, b: undefined, remove: [], same: false });
  assert.deepEqual(p('cmp_a=11&cmp_b=41'), { a: '11', b: '41', remove: [], same: false });
  assert.deepEqual(p('cmp_a=99&cmp_b=41'), { a: undefined, b: '41', remove: ['cmp_a'], same: false });
  assert.deepEqual(p('cmp_a=&cmp_b=<x>'), { a: undefined, b: undefined, remove: ['cmp_a', 'cmp_b'], same: false });
  assert.deepEqual(p('cmp_a=29&cmp_b=46'), { a: undefined, b: undefined, remove: ['cmp_a', 'cmp_b'], same: false }, 'old 광주·전남 codes are not valid');
  assert.deepEqual(p('cmp_a=12&cmp_b=12'), { a: '12', b: undefined, remove: ['cmp_b'], same: true });
});

const evRow = (code, name, total, [pas, tru, bus, spe], comm) => ({
  reference_month: '2026-09', region_system: '2026', region_code: code, region_name: name, ev_registration_count: total,
  ev_passenger_count: pas, ev_truck_count: tru, ev_bus_count: bus, ev_special_count: spe, ev_commercial_count: comm, ev_noncommercial_count: total - comm,
});

test('compareEv: nation share, ranks among all regions, vehicle-type % and commercial %p', () => {
  const rows = [
    evRow('11', '서울', 100, [80, 10, 8, 2], 20),
    evRow('41', '경기', 300, [240, 50, 9, 1], 30),
    evRow('12', '전남광주통합특별시', 100, [70, 25, 5, 0], 40),
    evRow('50', '제주', 0, [0, 0, 0, 0], 0),
  ];
  const c = m.compareEv(rows, '11', '12');
  assert.equal(c.nationTotal, 500);
  assert.equal(c.a.nationShare, 20);
  assert.deepEqual(c.a.rank, { rank: 2, tied: true, of: 4 });
  assert.equal(c.b.name, '전남광주', 'code 12 shown as 전남광주');
  assert.equal(c.a.types[0].pct, 80);
  assert.equal(c.b.commercialPct, 40);
  assert.equal(c.nationCommercialPct, 18);
  assert.equal(c.b.commercialVsNationPp, 22);
  // 등록 0대 지역: 비중·순위 계산에서 0으로 나누지 않음
  const z = m.compareEv(rows, '50', '11');
  assert.equal(z.a.commercialPct, null);
  assert.ok(z.a.types.every((t) => t.pct === null));
  assert.equal(z.a.commercialRank, null, 'region with no registrations has no commercial-% rank');
  assert.equal(z.b.commercialRank.of, 3, 'ranking is over regions with a defined share');
  assert.equal(m.compareEv(rows, '11', '99'), null);
});

const chRow = (code, name, ch, st, del) => ({ region_code: code, region_name: name, charger_count: ch, station_count: st, deleted_charger_count: del, not_deleted_charger_count: ch - del, share_pct: null });

test('compareChargers: regions without rows count as 0, ranks over all 16 codes, safe per-station ratio', () => {
  const rows = [chRow('11', '서울', 100, 20, 2), chRow('41', '경기', 300, 50, 0), chRow('26', '부산', 100, 25, 1)];
  const names = { 50: '제주' };
  const c = m.compareChargers(rows, CODES, names, '11', '50');
  assert.equal(c.filteredTotal, 500);
  assert.equal(c.a.filteredShare, 20);
  assert.deepEqual(c.a.chargerRank, { rank: 2, tied: true, of: 16 });
  assert.equal(c.a.perStation, 5);
  assert.equal(c.a.deletedPct, 2);
  assert.equal(c.b.chargers, 0);
  assert.equal(c.b.name, '제주');
  assert.equal(c.b.perStation, null, '0 stations → no ratio');
  assert.equal(c.b.deletedPct, null);
  assert.deepEqual(c.b.chargerRank, { rank: 4, tied: true, of: 16 });
});

const out = (kw, n, status = 'positive_numeric') => ({ output_raw: String(kw), output_kw: status === 'positive_numeric' ? kw : null, value_status: status, charger_count: n, station_count: 1, deleted_charger_count: 0, not_deleted_charger_count: n, share_pct: null });

test('output bands use the heatmap boundaries; 100kW+ share is over valid positive output only', () => {
  assert.equal(m.outputBand({ value_status: 'positive_numeric', output_kw: 29.9 }), 0);
  assert.equal(m.outputBand({ value_status: 'positive_numeric', output_kw: 30 }), 1);
  assert.equal(m.outputBand({ value_status: 'positive_numeric', output_kw: 50 }), 2);
  assert.equal(m.outputBand({ value_status: 'positive_numeric', output_kw: 100 }), 3);
  assert.equal(m.outputBand({ value_status: 'positive_numeric', output_kw: 200 }), 4);
  assert.equal(m.outputBand({ value_status: 'missing', output_kw: null }), -1);
  const s = m.outputSide([out(7, 60), out(100, 30), out(350, 10), out(0, 50, 'nonpositive'), out(0, 5, 'missing')]);
  assert.equal(s.valid, 100);
  assert.equal(s.unknown, 55);
  assert.equal(s.high100Pct, 40);
  const empty = m.outputSide([out(0, 5, 'missing')]);
  assert.equal(empty.high100Pct, null);
  const mix = m.outputMix(s, empty);
  assert.equal(mix.length, 5);
  assert.equal(mix[0].a.pct, 60);
  assert.equal(mix[0].b.pct, null);
  assert.equal(mix[0].pp, null);
});

const ty = (code, def, n) => ({ charger_type_code: code, official_definition: def, definition_verified: true, charger_count: n, station_count: 1, deleted_charger_count: 0, not_deleted_charger_count: n, share_pct: null });

test('typeMix: top 5 by combined count, the rest grouped as 기타, shares per region', () => {
  const A = [ty('02', 'AC완속', 70), ty('04', 'DC콤보', 10), ty('01', 'a', 5), ty('03', 'b', 5), ty('05', 'c', 5), ty('06', 'd', 3), ty('07', 'e', 2)];
  const B = [ty('02', 'AC완속', 50), ty('04', 'DC콤보', 50)];
  const r = m.typeMix(A, B);
  assert.equal(r.length, 6);
  assert.equal(r[0].key, '02');
  assert.equal(r[0].a.pct, 70);
  assert.equal(r[0].b.pct, 50);
  assert.equal(r[0].pp, -20);
  const etc = r[5];
  assert.equal(etc.key, 'etc');
  assert.equal(etc.a.count, 5);
  assert.equal(etc.b.pct, 0);
  assert.equal(m.typeMix([], []).length, 0);
});

test('insight text: no cross-date ratios, deletion flag is not availability, ranks state their basis', () => {
  const ev = m.compareEv([evRow('11', '서울', 100, [80, 10, 8, 2], 20), evRow('41', '경기', 300, [240, 50, 9, 1], 30)], '11', '41');
  const ch = m.compareChargers([chRow('11', '서울', 100, 20, 2), chRow('41', '경기', 300, 50, 0)], CODES, {}, '11', '41');
  const o = { a: m.outputSide([out(7, 90), out(150, 10)]), b: m.outputSide([out(7, 70), out(150, 30)]) };
  const ie = m.insightEvCompare(ev);
  const fixed = m.insightChargerCompare(ch, o, false);
  const filt = m.insightChargerCompare(ch, o, true);
  assert.match(ie.modeNote, /전국 16개 지역 기준/);
  assert.match(fixed.modeNote, /전국 16개 지역 기준/);
  assert.match(filt.modeNote, /필터 적용 16개 지역 기준/);
  assert.equal(filt.mode, 'dynamic');
  const all = [ie, fixed, filt].map((i) => [...i.findings, i.interpretation].map(text).join(' ')).join(' ');
  assert.doesNotMatch(all, /1기당|부족률|충전기당 차량|차량당 충전기\s*\d/);
  assert.doesNotMatch(all, /이용 가능(한|합니다|하다)|사용 가능/);
  assert.match(all, /경기가 서울의 3\.0배/);
  assert.match(all, /100kW 이상 비중\(유효 출력 기준\): 서울 10\.0%, 경기 30\.0%, 차이 \+20\.0%p/);
  assert.match(text(fixed.caution), /실제 이용 가능 여부를 뜻하지 않습니다/);
  assert.match(text(ie.caution), /서로 나눈 지표.*만들지 않습니다/);
});

test('fmtPp shows ± when the rounded difference is zero', () => {
  assert.equal(m.fmtPp(0.03), '±0.0%p');
  assert.equal(m.fmtPp(-0.04), '±0.0%p');
  assert.equal(m.fmtPp(1.25), '+1.3%p');
  assert.equal(m.fmtPp(-7.9), '−7.9%p');
  assert.equal(m.fmtPp(null), '—');
});
