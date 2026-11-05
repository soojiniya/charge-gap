const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const E = loader()('src/features/disparityExport.ts');
const D = loader()('src/analysis/disparity.ts');

function makeRow(i) {
  const code = String(i + 1).padStart(2, '0');
  const count = i === 0 ? 0 : 100 + i;
  const types = count ? [{ charger_type_code: '04', charger_count: i === 1 ? 0 : count / 2, denominator: count, value_pct: i === 1 ? 0 : 50, rank: i === 1 ? 16 : 1 }] : [];
  return {
    region_code: code, region_name: `지역${i + 1}`, charger_count: count, station_count: count ? 10 : 0,
    metrics: {
      high_100kw: { numerator: count / 2, denominator: count, value_pct: count ? 50 : null, rank: count ? 1 : undefined },
      chargers_per_station: { numerator: count, denominator: count ? 10 : 0, value: count ? count / 10 : null, rank: count ? i + 1 : undefined },
      type_mix: types,
      operator_hhi: { value: count ? 2000 : null, operator_count: count ? 4 : 0, rank: count ? 1 : undefined },
      deletion_share: { numerator: 1, denominator: count, value_pct: count ? 1 : null, rank: count ? 1 : undefined },
    },
  };
}
const regions = Array.from({ length: 16 }, (_, i) => makeRow(i));
const data = {
  regions,
  national: {
    high_100kw: { numerator: 750, denominator: 1500, value_pct: 50 },
    chargers_per_station: { numerator: 1500, denominator: 150, value: 10 },
    type_mix: [{ charger_type_code: '04', charger_count: 700, denominator: 1500, value_pct: 46.67 }],
    operator_hhi: { value: 2200, operator_count: 342 },
    deletion_share: { numerator: 15, denominator: 1500, value_pct: 1 },
  },
};
const meta = { warnings: [], same_period_shortage_rate_computed: false };
const context = (patch = {}) => ({ data, meta, metric: 'high_100kw', type: '04', selectedRegionCode: '12', filters: ['유형: 04', '운영기관: ENV'], source: '한국환경공단 · 조회 2026-10-15', ...patch });

test('CSV is BOM encoded, includes all 16 regions, screen-formatted values, ranks and selected region', () => {
  const csv = E.buildDisparityCsv(context());
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal((csv.match(/\r\n/g) || []).length, 16);
  assert.match(csv, /지역 코드/);
  assert.match(csv, /전국 대비 차이/);
  assert.match(csv, /12","전남광주/);
  assert.match(csv, /선택/);
  assert.match(csv, /미적용 \(16개 지역 비교\)/);
  assert.match(csv, /50\.00%/);
  assert.match(csv, /1위/);
  assert.match(csv, /데이터 출처/);
  assert.match(csv, /한국환경공단/);
});

test('CSV represents zero denominator and absent type as em dash, while valid zero share has a rank', () => {
  const csv = E.buildDisparityCsv(context({ metric: 'type_mix', type: '09' }));
  assert.match(csv, /유형 09 비중/);
  assert.match(csv, /—/);
  const presentZero = E.buildDisparityCsv(context({ metric: 'type_mix', type: '04' }));
  assert.match(presentZero, /지역2.*0\.00%.*16위/);
});

test('deletion CSV explicitly says deletion filter is excluded from that indicator population', () => {
  const csv = E.buildDisparityCsv(context({ metric: 'deletion_share', filters: ['삭제 상태: 비삭제'] }));
  assert.match(csv, /삭제 상태 필터 제외/);
  assert.match(csv, /삭제 표시 비중/);
});

test('print report includes Korean source, selected five-metric summary, comparison, and interpretation cautions', () => {
  const html = E.buildDisparityReportHtml(context({
    meta: {
      warnings: [],
      same_period_shortage_rate_computed: false,
      metric_rules: { high_100kw: 'output_kw >= 100 / positive numeric output count; missing/nonpositive/nonnumeric excluded' },
      national_basis: 'Nationwide numerator and denominator are summed independently before division; national HHI recalculated.',
    },
  }));
  assert.match(html, /CHARGE GAP/);
  assert.match(html, /한국환경공단/);
  assert.match(html, /2026-10-15/);
  assert.match(html, /선택 지역 분석 · 전남광주/);
  assert.match(html, /요약 지표/);
  assert.match(html, /전기차 등록과 충전기 자료는 기준 시점이 달라/);
  assert.match(html, /실제 충전 수요 대비 부족이나 공급 부족을 뜻하지 않습니다/);
  assert.match(html, /<th>순위<\/th>/);
  assert.match(html, /출력값이 양수인 충전기 중 100kW 이상인 충전기 수의 비중/);
  assert.match(html, /전국 분자와 분모를 각각 합산해 계산/);
  assert.doesNotMatch(html, /output_kw >= 100|Nationwide numerator|인쇄 대화상자에서/);
});

test('print report safely escapes source and handles no selected region', () => {
  const html = E.buildDisparityReportHtml(context({ selectedRegionCode: undefined, source: '<script>alert(1)</script>' }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /선택된 지역이 없습니다/);
});

test('CSV and report use the existing metric formatting and API ranking helpers', () => {
  assert.equal(E.metricTitle('type_mix', '04', 'DC콤보'), '유형 04 DC콤보 비중');
  assert.equal(E.disparityExportFilename('type_mix', '04', 'csv'), 'charge-gap-type-mix-04-2026-10-15.csv');
  assert.equal(D.rankOf(regions[1], 'type_mix', '04'), 16);
});

test('each of five metrics exports all regions with its own display unit and snapshot filename', () => {
  const cases = [
    ['high_100kw', '04', '%'],
    ['chargers_per_station', '04', '기/곳'],
    ['type_mix', '04', '%'],
    ['operator_hhi', '04', '점, 0–10,000'],
    ['deletion_share', '04', '%'],
  ];
  for (const [metric, type, unit] of cases) {
    const csv = E.buildDisparityCsv(context({ metric, type }));
    assert.ok(csv.startsWith('\uFEFF'), metric);
    assert.equal((csv.match(/\r\n/g) || []).length, 16, metric);
    assert.ok(csv.includes(`(${unit})`) || csv.includes(`,"${unit}"`), metric);
    assert.ok(E.disparityExportFilename(metric, type, 'csv').endsWith('-2026-10-15.csv'), metric);
  }
});

test('Regional Explorer exposes the export actions and reports status without changing analysis inputs', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/features/RegionalDisparity.tsx'), 'utf8');
  assert.match(source, /CSV 다운로드/);
  assert.match(source, /PDF 보고서/);
  assert.match(source, /buildDisparityCsv\(exportContext\)/);
  assert.match(source, /buildDisparityReportHtml\(exportContext\)/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /disabled=\{!data \|\| query\.isFetching \|\| query\.isError\}/);
});

test('report HTML is CSP-safe: no inline <style> or style attributes; styles come from the same-origin stylesheet link', () => {
  const html = E.buildDisparityReportHtml(context({ stylesheetHref: 'https://example.test/assets/disparityReport-abc.css' }));
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /\sstyle="/i);
  assert.match(html, /<link rel="stylesheet" href="https:\/\/example\.test\/assets\/disparityReport-abc\.css" data-report-style>/);
  assert.doesNotMatch(E.buildDisparityReportHtml(context()), /<link rel="stylesheet"/);
});

test('report structure: header meta, four numbered sections in order, national row first, numbers right-aligned', () => {
  const html = E.buildDisparityReportHtml(context({ generatedAt: new Date('2026-11-05T00:00:00Z') }));
  const order = ['핵심 분석 요약', '16개 지역 비교 및 순위', '계산 방법 및 해석', '데이터 출처 및 분석 한계'].map((t) => html.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), String(order));
  for (const label of ['데이터 기준일', '분석 지표', '현재 적용 필터', '지역 필터']) assert.match(html, new RegExp(`<dt>${label}</dt>`));
  assert.match(html, /<tr class="is-national"><td class="rank">기준<\/td><td class="region">전국<\/td><td class="n">50\.00%<\/td>/);
  assert.equal((html.match(/<table class="rpt-compare">[\s\S]*?<\/table>/)[0].match(/<tr/g) || []).length, 1 + 1 + 16);
  assert.match(html, /<thead>/);
  assert.match(html, /<tr class="is-selected">/);
  assert.match(html, /<td class="n( (up|down))?">[^<]*%p<\/td>/);
  assert.match(html, /보고서 생성 시점/);
  assert.match(html, /2026\. 11\. 5\./);
});

test('report summary states only facts from the data (no shortage/good/bad judgement)', () => {
  for (const metric of ['high_100kw', 'chargers_per_station', 'type_mix', 'operator_hhi', 'deletion_share']) {
    const html = E.buildDisparityReportHtml(context({ metric }));
    const findings = html.match(/<ul class="rpt-findings">([\s\S]*?)<\/ul>/)[1];
    assert.doesNotMatch(findings, /(부족|위험|좋음|나쁨|좋습니다|나쁩니다|우수|열악|취약)/, metric);
    assert.match(findings, /전국 기준보다 높은 지역 \d+곳, 낮은 지역 \d+곳/, metric);
    assert.match(html, /<dt>계산식<\/dt>/, metric);
    assert.match(html, /<ol class="rpt-cautions">/, metric);
  }
});

test('source string is split into organisation, dataset and dates; the reference source is marked as not combined', () => {
  const html = E.buildDisparityReportHtml(context({
    source: '한국환경공단 · 제공 공공데이터포털 · 「전기자동차 충전소 정보」 getChargerInfo · 자료 기준 2026-10-15 조회 시점 현황 · 조회 2026-10-15 04:16–04:19 KST · 이용 조건 공공누리 제1유형 (출처표시), /api/regional-disparity · 참고(비결합): 국토교통부 통계누리 · 작성기관 국토교통부 · 「자료」 · 자료 기준 2026년 9월 말 · 파일 저장 2026-10-20 · 이용 조건 확인 중, /api/ev-registration',
  }));
  assert.match(html, /<dt>기관<\/dt><dd>한국환경공단<\/dd>/);
  assert.match(html, /<dt>데이터명<\/dt><dd>「전기자동차 충전소 정보」 getChargerInfo<\/dd>/);
  assert.match(html, /<dt>조회 시각<\/dt><dd>2026-10-15 04:16–04:19 KST<\/dd>/);
  assert.match(html, /참고 자료<small>결합하지 않음<\/small>/);
  assert.match(html, /<dt>기관<\/dt><dd>국토교통부 통계누리<\/dd>/);
});

test('page layout: 02 and 03 start new pages; formula box carries numerator/denominator; cautions are not duplicated', () => {
  for (const metric of ['high_100kw', 'chargers_per_station', 'type_mix', 'operator_hhi', 'deletion_share']) {
    const html = E.buildDisparityReportHtml(context({ metric, meta: { warnings: ['전기차 등록은 2026-09, 충전기 API는 2026-10-15 조회 자료입니다. 서로 다른 시점입니다.'], same_period_shortage_rate_computed: false } }));
    assert.match(html, /<section class="rpt-section rpt-page-compare"><h2><span class="no">02<\/span>/, metric);
    assert.match(html, /<section class="rpt-section rpt-page-method"><h2><span class="no">03<\/span>/, metric);
    assert.match(html, /<dl class="f-parts"><div><dt>분자<\/dt><dd>[^<]+<\/dd><\/div><div><dt>분모<\/dt>/, metric);
    const items = html.match(/<ol class="rpt-cautions">([\s\S]*?)<\/ol>/)[1].match(/<li>[^<]*<\/li>/g);
    assert.equal(new Set(items).size, items.length, metric);
    assert.equal(items.filter((x) => /시점/.test(x)).length, 2, metric); // API 경고 1 + 같은 시점 계산 안 함 1
    assert.doesNotMatch(html, /rpt-foot/);
  }
});
