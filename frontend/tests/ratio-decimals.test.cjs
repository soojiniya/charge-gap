/* Regression for ratio display in the analysis text (graphs 2 and 6):
 *  - G6 shares are shown with one decimal, the same as the legend;
 *  - "나머지 N개 유형 합계" never shows a negative zero (-0.0%) when 100 − 1위 − 2위 leaves floating-point noise;
 *  - G2 shows the special-vehicle share with one decimal (1,559대(0.1%)), not two.
 * Share values below are the API's full-precision share_pct for real filter combinations. */
const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('./ts-loader.cjs');

const { insightTypes, insightEvTypes } = loader()('src/analysis/insights.tsx');
const text = (node) =>
  renderToStaticMarkup(React.createElement(React.Fragment, null, node))
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const DEF = { '02': 'AC완속', '04': 'DC콤보', '06': 'DC차데모+AC3상+DC콤보', '11': 'DC콤보2(버스전용)' };
const row = (code, count, share) => ({ charger_type_code: code, official_definition: DEF[code], charger_count: count, share_pct: share });
const g6 = (rows) => {
  const r = insightTypes(rows, true);
  return { findings: r.findings.map(text), interpretation: text(r.interpretation) };
};
const noTwoDecimals = (s) => assert.doesNotMatch(s, /\d\.\d\d%/, s);

test('G6, two types (인천 + 운영기관 ME): remaining share is 0.0%, never -0.0%', () => {
  // 100 − 87.84530386740332 − 12.154696132596685 is a tiny negative number in floating point.
  const { findings } = g6([row('04', 318, 87.84530386740332), row('06', 44, 12.154696132596685)]);
  const rest = findings.find((t) => t.includes('나머지'));
  assert.equal(rest, '나머지 0개 유형 합계 0.0%.');
  for (const t of findings) {
    assert.doesNotMatch(t, /-0\.0%/, t);
    noTwoDecimals(t);
  }
  assert.match(findings[1], /87\.8%.*12\.2%/);
});

test('G6, two types with positive floating-point residue (부산 + 운영기관 PW): remaining share is 0.0%, not <0.1%', () => {
  // 100 − 99.99113003370587 − 0.008869966294128 is a tiny positive number in floating point.
  const { findings } = g6([row('02', 11273, 99.99113003370587), row('06', 1, 0.008869966294128)]);
  assert.equal(findings.find((t) => t.includes('나머지')), '나머지 0개 유형 합계 0.0%.');
  assert.match(findings[1], /1위 02 AC완속 100\.0%, 2위 06 .* <0\.1%\./);
});

test('G6, three types with a genuinely small remainder (경기 + 운영기관 PW): <0.1% is kept', () => {
  const { findings } = g6([row('02', 18859, 99.97349448685327), row('07', 3, 0.015903307888041), row('06', 2, 0.010602205258694)]);
  assert.equal(findings.find((t) => t.includes('나머지')), '나머지 1개 유형 합계 <0.1%.');
});

test('G6, one type: no remaining-share line, 100.0% with one decimal', () => {
  const { findings, interpretation } = g6([row('02', 40, 100)]);
  assert.equal(findings.some((t) => t.includes('나머지')), false);
  assert.match(findings[1], /1위 02 AC완속 100\.0%\.$/);
  assert.match(interpretation, /100\.0%/);
});

test('G6, three types (삭제 표시만): one decimal, small remainder shown as <0.1%', () => {
  const { findings } = g6([row('02', 4024, 97.64620237806358), row('04', 94, 2.280999757340451), row('11', 3, 0.072797864595972)]);
  assert.match(findings[1], /97\.6%.*2\.3%/);
  assert.equal(findings.find((t) => t.includes('나머지')), '나머지 1개 유형 합계 <0.1%.');
  findings.forEach(noTwoDecimals);
});

test('G6, default national view: findings match the legend (one decimal)', () => {
  const total = 527433;
  const counts = [['02', 469049], ['04', 43676], ['06', 6449], ['11', 5587]];
  const { findings, interpretation } = g6(counts.map(([c, n]) => row(c, n, (n / total) * 100)));
  assert.match(findings[1], /1위 02 AC완속 88\.9%, 2위 04 DC콤보 8\.3%\./);
  assert.match(interpretation, /88\.9%/);
  findings.forEach(noTwoDecimals);
});

test('G2: special-vehicle share uses one decimal (1,559대(0.1%))', () => {
  const r = insightEvTypes({ total: 1191873, passenger: 969627, truck: 202429, bus: 18258, special: 1559 }, '전국', false);
  const lines = r.findings.map(text);
  assert.match(lines[1], /특수 1,559대\(0\.1%\)/);
  lines.forEach(noTwoDecimals);
});
