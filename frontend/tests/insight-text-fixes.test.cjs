/* Regression for three analysis-text fixes:
 *  G5: every region tied for the widest IQR is named (from the data, not hard-coded);
 *  G1: when the top 3 regions are exactly 서울·경기·인천, the same share is not stated twice;
 *  G10: the basis note says the operator filter is excluded from the calculation. */
const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('./ts-loader.cjs');

const { insightBoxplot, insightEvRegions, insightOperators } = loader()('src/analysis/insights.tsx');
const text = (node) => renderToStaticMarkup(React.createElement(React.Fragment, null, node)).replace(/<[^>]+>/g, '');

const box = (code, name, q1, q3, median = 3) => ({ region_code: code, region_name: name, q1, q3, iqr: q3 - q1, median, mean: median + 1,
  max: 50, min: 1, sample_count: 100, outlier_count: 5, station_count: 100, charger_count: 400, whisker_low: 1, whisker_high: 10, fence_low: 0, fence_high: 20, outlier_distribution: [] });

test('G5: all regions tied for the widest IQR are listed', () => {
  const r = insightBoxplot([box('36', '세종', 2, 7), box('27', '대구', 2, 7), box('11', '서울', 2, 6)], 'not_deleted', false, 300);
  const line = r.findings.map(text).find((t) => t.includes('IQR'));
  assert.match(line, /세종·대구 2~7기\(IQR 5기, 공동\)/);
  assert.doesNotMatch(line, /서울/);
});

test('G5: tied regions with different Q1~Q3 are listed with their own ranges; a single widest region is unchanged', () => {
  const tie = insightBoxplot([box('36', '세종', 2, 7), box('50', '제주', 3, 8), box('11', '서울', 2, 6)], 'all', false, 300).findings.map(text).find((t) => t.includes('IQR'));
  assert.match(tie, /세종 2~7기, 제주 3~8기\(IQR 5기, 공동\)/);
  const one = insightBoxplot([box('36', '세종', 2, 7), box('11', '서울', 2, 6)], 'all', false, 200).findings.map(text).find((t) => t.includes('IQR'));
  assert.match(one, /세종 2~7기\(IQR 5기\)\.$/);
});

const ev = (code, name, n) => ({ region_code: code, region_name: name, ev_registration_count: n });
const others = [ev('26', '부산', 80), ev('36', '세종', 10)];

test('G1: top 3 = 수도권 → one sentence, no repeated share', () => {
  const r = insightEvRegions([ev('41', '경기', 300), ev('11', '서울', 130), ev('28', '인천', 100), ...others]);
  const line = text(r.findings[1]);
  assert.equal((line.match(/%/g) || []).length, 1, line);
  assert.match(line, /이 세 지역이 곧 수도권\(서울·경기·인천\)입니다/);
});

test('G1: top 3 ≠ 수도권 → both shares stay', () => {
  const r = insightEvRegions([ev('41', '경기', 300), ev('11', '서울', 130), ev('26', '부산', 120), ev('28', '인천', 100), ev('36', '세종', 10)]);
  const line = text(r.findings[1]);
  assert.match(line, /상위 3개 지역\(경기, 서울, 부산\)이 .*%, 수도권\(서울·경기·인천\)이 .*%를 차지합니다/);
});

const op = (id, name, n) => ({ operator_id: id, operator_name: name, charger_count: n, share_pct: null, station_count: 1, not_deleted_charger_count: n, deleted_charger_count: 0 });

test('G10: basis note states that the operator filter is excluded', () => {
  const rows = [op('PI', 'GS차지비', 50), op('PL', '플러그링크', 30)];
  assert.equal(insightOperators(rows, 100, 2, true, true).modeNote, '지역·유형·삭제 필터 결과로 계산 (운영기관 필터는 계산에서 제외)');
  assert.equal(insightOperators(rows, 100, 2, false, true).modeNote, '전국 기준 고정 분석 (운영기관 필터는 계산에서 제외)');
  assert.equal(insightOperators(rows, 100, 2, false, false).modeNote, undefined);
  assert.match(insightOperators(rows, 100, 2, false).caution, /운영기관 필터를 선택해도 이 그래프의 계산에는 적용하지 않고/);
});
