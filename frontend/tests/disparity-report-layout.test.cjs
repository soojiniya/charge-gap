/* PDF 보고서 1쪽 상위·하위 지역 시각화와 3쪽 블록 구분(계산 방법 / 해석 주의사항 / 데이터 출처 및 분석 한계).
 * - 시각화는 선택 지역이 없을 때만 넣고, 값·전국 대비 차이는 02 표의 같은 지역 행과 같은 문자열
 * - 16개 전체를 다시 싣지 않음(상위·하위 최대 3개씩)
 * - 3쪽 세 블록이 순서대로 있고 주의사항 항목은 그대로 유지 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const E = loader()('src/features/disparityExport.ts');

const regions = Array.from({ length: 16 }, (_, i) => {
  const count = 100 + i * 10;
  const v = 10 + i * 3; // 지역마다 다른 값 → 순위 1~16
  return {
    region_code: String(i + 11), region_name: `지역${i + 1}`, charger_count: count, station_count: 10,
    metrics: {
      high_100kw: { numerator: (count * v) / 100, denominator: count, value_pct: v, rank: 16 - i },
      chargers_per_station: { numerator: count, denominator: 10, value: count / 10, rank: 16 - i },
      type_mix: [],
      operator_hhi: { value: 1000 + i * 50, operator_count: 4, rank: 16 - i },
      deletion_share: { numerator: 1, denominator: count, value_pct: 100 / count, rank: i + 1 },
    },
  };
});
const data = {
  regions,
  national: {
    high_100kw: { numerator: 1, denominator: 3, value_pct: 30 },
    chargers_per_station: { numerator: 2600, denominator: 160, value: 16.25 },
    type_mix: [],
    operator_hhi: { value: 1400, operator_count: 342 },
    deletion_share: { numerator: 16, denominator: 2800, value_pct: 0.57 },
  },
};
const context = (patch = {}) => ({ data, meta: { warnings: [], same_period_shortage_rate_computed: false }, metric: 'high_100kw', type: '04', filters: [], source: '한국환경공단 · 조회 2026-10-15', ...patch });
const rowOf = (html, region) => html.match(new RegExp(`<tr[^>]*><td class="rank">[^]*?<td class="region">${region}</td>([^]*?)</tr>`))[1];

test('page 1: top/bottom 3 vs national only without a selected region; values equal the 02 table', () => {
  for (const metric of ['high_100kw', 'chargers_per_station', 'operator_hhi', 'deletion_share']) {
    const html = E.buildDisparityReportHtml(context({ metric }));
    const block = html.match(/<div class="rpt-ext keep">([\s\S]*?)<\/div><\/div>\n?<p class="rpt-note">/);
    assert.ok(block, metric);
    const page1 = html.slice(0, html.indexOf('rpt-page-compare'));
    assert.ok(page1.includes('rpt-ext keep'), `${metric}: visual is on page 1`);
    const rows = [...html.matchAll(/<div class="rpt-ext-row is-(top|bottom)"><span class="r">(\d+)위<\/span><span class="g">([^<]+)<\/span><span class="v num">([^<]+)<\/span>[\s\S]*?<span class="d num[^"]*">([^<]+)<\/span><\/div>/g)];
    assert.equal(rows.length, 6, metric);
    assert.deepEqual(rows.map((r) => Number(r[2])), [1, 2, 3, 14, 15, 16], metric);
    for (const [, , , region, value, diff] of rows) {
      const tableRow = rowOf(html, region);
      assert.ok(tableRow.includes(`<td class="n">${value}</td>`), `${metric} ${region} value ${value}`);
      assert.match(tableRow, new RegExp(`<td class="n[^"]*">${diff.replace(/[+.]/g, '\\$&')}</td>`), `${metric} ${region} diff ${diff}`);
    }
    assert.match(block[0], /전국 기준값\(/, metric);
    assert.match(block[0], /16개 지역 전체 값과 순위는 02 표/, metric);
  }
  const withRegion = E.buildDisparityReportHtml(context({ selectedRegionCode: '12' }));
  assert.doesNotMatch(withRegion, /rpt-ext/);
  assert.match(withRegion, /선택 지역 분석/);
});

test('page 3: 계산 방법 / 해석 주의사항 / 데이터 출처 및 분석 한계 are separate blocks in order; cautions kept', () => {
  const html = E.buildDisparityReportHtml(context({ meta: { warnings: ['전기차 등록은 2026-09, 충전기 API는 2026-10-15 조회 자료입니다. 서로 다른 시점입니다.'], same_period_shortage_rate_computed: false } }));
  const method = html.slice(html.indexOf('rpt-page-method'));
  const order = ['<div class="rpt-block rpt-block-method"><h3 class="rpt-block-title">계산 방법</h3>', '<div class="rpt-block rpt-block-cautions"><h3 class="rpt-block-title">해석 주의사항', '데이터 출처 및 분석 한계'].map((t) => method.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), String(order));
  const items = method.match(/<ol class="rpt-cautions">([\s\S]*?)<\/ol>/)[1].match(/<li>[^<]*<\/li>/g);
  assert.match(method, new RegExp(`해석 주의사항<small>${items.length}개 항목</small>`));
  assert.match(method, /<dt>계산식<\/dt>/);
  assert.match(method, /<div class="rpt-block rpt-block-method">[\s\S]*<dl class="rpt-defs">[\s\S]*<\/dl><\/div>\n<div class="rpt-block rpt-block-cautions">/);
});
