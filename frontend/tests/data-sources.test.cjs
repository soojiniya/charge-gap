/* Regression: data-source labelling.
 * - The frontend source table (src/analysis/dataSources.ts) and the backend metadata (backend/chargegap_api/data.py)
 *   carry the same provider / author / dataset / basis / saved date / licence text.
 * - 공공누리 제1유형 appears only for the charger API (officially confirmed); registration and growth stay "확인 중".
 * - The growth cautions say the stored 2026-10-15 table is not the current official value, read the partial-year
 *   cumulative from the data (no hard-coded 540,210), and do not state an unconfirmed cause of the official revision. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader, root } = require('./ts-loader.cjs');

const ds = loader()('src/analysis/dataSources.ts');
const { insightAnnual, insightCumulative } = loader()('src/analysis/insights.tsx');
const text = (node) => renderToStaticMarkup(React.createElement(React.Fragment, null, node)).replace(/<[^>]+>/g, '');
const py = fs.readFileSync(path.resolve(root, '../backend/chargegap_api/data.py'), 'utf8');
const block = (name, next) => py.slice(py.indexOf(`${name} = {`), py.indexOf(next));
const has = (src, key, value) => assert.ok(src.replace(/'\s*\n\s*'/g, '').includes(`'${key}':${typeof value === 'boolean' ? (value ? 'True' : 'False') : `'${value}'`}`), `${key} = ${value}`);

test('frontend and backend source metadata agree', () => {
  const pairs = [
    [ds.DATA_SOURCES.ev, block('EV_SOURCE', 'API_SOURCE =')],
    [ds.DATA_SOURCES.chargers, block('API_SOURCE', 'GROWTH_SOURCE =')],
    [ds.DATA_SOURCES.growth, block('GROWTH_SOURCE', '\ndef records')],
  ];
  for (const [f, b] of pairs) {
    has(b, 'provider', f.provider);
    has(b, 'author', f.author);
    has(b, 'dataset', f.dataset);
    has(b, 'reference_basis', f.basis);
    has(b, 'license', f.license.text);
    has(b, 'license_confirmed', f.license.confirmed);
    has(b, 'source_url', f.url);
    if (f.collectedLabel === '파일 저장') has(b, 'file_saved_date', f.collected);
    if ('platform' in f) has(b, 'platform', f.platform);
  }
  has(block('GROWTH_SOURCE', '\ndef records'), 'official_update_label_at_collection', '2026-09-30');
});

test('required providers and authors are named', () => {
  assert.match(ds.EV_SRC, /^국토교통부 통계누리 · 작성기관 국토교통부 · /);
  assert.match(ds.CH_SRC, /^한국환경공단 · 제공 공공데이터포털 · /);
  assert.match(ds.GROWTH_SRC, /^무공해차 통합누리집 · /);
  for (const s of [ds.EV_SRC, ds.GROWTH_SRC]) assert.match(s, / · 파일 저장 \d{4}-\d{2}-\d{2} · /);
  assert.match(ds.CH_SRC, / · 조회 2026-10-15 04:16–04:19 KST · /);
  assert.match(ds.GROWTH_SRC, /당시 공식 화면 갱신 표시 2026-09-30 · 파일 저장 2026-10-15/);
});

test('공공누리 제1유형 only on the officially confirmed charger API', () => {
  assert.equal(ds.DATA_SOURCES.chargers.license.confirmed, true);
  assert.match(ds.CH_SRC, /이용 조건 공공누리 제1유형/);
  for (const k of ['ev', 'growth']) {
    assert.equal(ds.DATA_SOURCES[k].license.confirmed, false);
    assert.match(ds.DATA_SOURCES[k].license.text, /^확인 중/);
  }
  for (const s of [ds.EV_SRC, ds.GROWTH_SRC]) assert.doesNotMatch(s, /공공누리|제1유형/);
  assert.doesNotMatch(block('EV_SOURCE', 'API_SOURCE ='), /제1유형/);
  assert.doesNotMatch(block('GROWTH_SOURCE', '\ndef records'), /제1유형/);
});

const g = (year, annual, cumulative, partial = false) => ({
  year, annual_installed_count: annual, cumulative_count: cumulative, is_partial_year: partial,
  completed_calendar_year: !partial, measurement_cutoff_date: null,
});
const rows = [g(2023, 111981, 280562), g(2024, 108435, 388997), g(2025, 89805, 478802), g(2026, 61408, 540210, true)];

test('growth cautions: stored snapshot, not the current official value; data-driven partial cumulative', () => {
  const cum = text(insightCumulative(rows).caution);
  assert.match(cum, /2026년 누적 540,210기는 프로젝트가 2026-10-15에 저장한 당시 표의 값이며 현재 공식 최신값이 아닙니다/);
  assert.match(cum, /2026-10-31 갱신에서 과거 연도 수치까지 수정/);
  const other = text(insightCumulative([g(2024, 1, 10), g(2025, 2, 12), g(2026, 3, 123456, true)]).caution);
  assert.match(other, /123,456기는/);
  assert.doesNotMatch(other, /540,210/);
  // selected range without the partial year still names it from the full series
  assert.match(text(insightCumulative(rows.slice(0, 2), rows).caution), /2026년 누적 540,210기/);
  const ann = text(insightAnnual(rows).caution);
  assert.match(ann, /2026-10-15에 저장한 당시 표의 값이며 현재 공식 최신값이 아닙니다/);
  for (const c of [cum, ann, ds.GROWTH_REVISION_NOTE]) {
    assert.doesNotMatch(c, /철거|삭제된|설치연도 정정|정정되었/);
    assert.match(c, /사유는 공식적으로 확인되지 않았습니다/);
  }
});

test('source code no longer hard-codes the 2026 cumulative in the caution', () => {
  const src = fs.readFileSync(path.join(root, 'src/analysis/insights.tsx'), 'utf8');
  assert.doesNotMatch(src, /540,210/);
});

test('PNG vs web basis labels', () => {
  assert.deepEqual([...ds.EV_PNG_IDS], [1, 2, 3]);
  assert.match(ds.EV_PNG_VS_WEB.png.month, /2025년 12월/);
  assert.match(ds.EV_PNG_VS_WEB.png.regions, /17개 시도/);
  assert.match(ds.EV_PNG_VS_WEB.web.month, /2026년 9월/);
  assert.match(ds.EV_PNG_VS_WEB.web.regions, /16개 지역/);
});
