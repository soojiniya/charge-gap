/* No browser or new dependency: compile TS in memory and test rendered React output. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const native = createRequire(file);
    const requireTs = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(file), id);
        const found = ['.ts', '.tsx'].map(ext => base + ext).find(p => fs.existsSync(p));
        if (found) return load(found);
      }
      return native(id);
    };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function('require', 'module', 'exports', code)(requireTs, module, module.exports);
    return module.exports;
  }
  return load;
}

function outputRow(kw, count) {
  return { output_kw: kw, output_raw: String(kw), value_status: 'positive_numeric', charger_count: count };
}

function interpretation(rows) {
  const { insightOutput } = loader()('src/analysis/insights.tsx');
  return renderToStaticMarkup(React.createElement(React.Fragment, null, insightOutput(rows, undefined, true).interpretation));
}

test('single 100kW output does not claim a tail or diverse high outputs (01 + HE)', () => {
  const text = interpretation([outputRow(100, 3)]);
  assert.match(text, /100/);
  assert.doesNotMatch(text, /오른쪽 꼬리|다양/);
  assert.match(text, /한 가지|1종/);
});

test('single 50kW output reports no high output rather than diversity (01 + JD)', () => {
  const text = interpretation([outputRow(50, 5)]);
  assert.doesNotMatch(text, /오른쪽 꼬리|다양/);
  assert.match(text, /100kW 이상.*없/);
});

test('multiple outputs describe measured counts without assuming a tail', () => {
  const text = interpretation([outputRow(7, 2), outputRow(100, 3), outputRow(200, 5)]);
  assert.match(text, /3/);
  assert.match(text, /80/);
  assert.doesNotMatch(text, /오른쪽 꼬리|다양/);
});

test('empty output is safe', () => assert.equal(interpretation([]), '—'));

/*
 * 지역 × 출력 히트맵(useRegionOutputMatrix): 16개 지역을 /api/charger-output/regions 한 번으로 받습니다.
 * 이전 구현(지역마다 1회, useQueries)의 테스트 3개를 같은 보장으로 바꾼 것입니다.
 *  1) 이전 필터의 결과(placeholder)를 현재 결과와 섞어 그리지 않는다.
 *  2) 요청한 모든 지역의 현재 결과가 있어야 그리고, 지역 순서·필터·값을 그대로 보존한다.
 *  3) 실제 QueryClient에서 필터를 빠르게 바꾸고 응답 순서가 뒤바뀌어도 최신 필터 결과만 보이며, 같은 필터로 돌아가면 캐시를 쓴다.
 *     또 받은 결과로 지역별 캐시(['charger-output', …])를 채워 지역 비교·분석 패널이 같은 값을 재사용한다.
 */
const REGION_FIXTURE = ['11', '41'];
const regionsPayload = (deletion, rows = { '11': 3, '41': 5 }, codes = REGION_FIXTURE) => ({
  data: {
    common_meta: { api_version: '1.0', sources: { chargers: { file: 'charger_info_clean.csv' } }, units: {}, warnings: [], same_period_shortage_rate_computed: false, snapshot_policy: 'fixed', output_note: 'note' },
    regions: codes.map((code) => ({
      region_code: code,
      data: [{ output_raw: '7', output_kw: 7, value_status: 'positive_numeric', charger_count: rows[code], station_count: 1, not_deleted_charger_count: rows[code], deleted_charger_count: 0, share_pct: 100 }],
      filters: { region_code: code, charger_type: null, deletion, operator_id: null },
      matched: { charger_count: rows[code], station_count: 1, not_deleted_charger_count: rows[code], deleted_charger_count: 0 },
      count: 1,
      output_statistics: { valid_positive_count: rows[code], invalid_or_missing_count: 0, median_kw: 7, min_kw: 7, max_kw: 7 },
    })),
  },
  meta: { api_version: '1.0', filters: { region_code: null, deletion }, region_count: codes.length },
});

/** useRegionOutputMatrix를 한 번 실행: useQuery에 넘긴 옵션을 잡고, useQuery 결과는 current로 흉내 냅니다. */
function runMatrix(filters, current, { api = {}, client = { setQueryData() {} }, codes = REGION_FIXTURE } = {}) {
  let options;
  const hooks = loader({
    '@tanstack/react-query': { useQuery: (o) => { options = o; return current; }, useQueryClient: () => client, keepPreviousData: () => undefined, useInfiniteQuery: () => ({}) },
    './endpoints': { api },
  })('src/api/hooks.ts');
  const out = hooks.useRegionOutputMatrix(filters, codes);
  return { options, out, hooks };
}
const queryResult = (data, extra = {}) => ({ data, isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch() {}, ...extra });

test('heatmap never combines previous-filter placeholders and current responses', () => {
  const { options, hooks } = runMatrix({ deletion: 'deleted' }, queryResult(undefined, { isLoading: true }));
  assert.equal(options.placeholderData, undefined, 'no keepPreviousData for the heatmap');
  assert.deepEqual(options.queryKey, ['charger-output-regions', { region_code: null, charger_type: null, deletion: 'deleted', operator_id: null }]);
  // even if the query reported previous-filter data as a placeholder, the heatmap gets nothing to draw
  const previous = hooks.regionOutputResponses(regionsPayload('all'));
  const { out } = runMatrix({ deletion: 'deleted' }, queryResult(previous, { isPlaceholderData: true, isFetching: true }));
  assert.equal(out.data, undefined);
});

test('heatmap waits for all current regions and preserves correct data', () => {
  const { hooks } = runMatrix({ deletion: 'deleted' }, queryResult(undefined));
  const partial = hooks.regionOutputResponses(regionsPayload('deleted', { '11': 3 }, ['11']));
  assert.equal(runMatrix({ deletion: 'deleted' }, queryResult(partial)).out.data, undefined, 'one region missing → nothing drawn');
  assert.equal(runMatrix({ deletion: 'deleted' }, queryResult(undefined, { isLoading: true })).out.data, undefined);
  const complete = hooks.regionOutputResponses(regionsPayload('deleted'));
  const { out } = runMatrix({ deletion: 'deleted' }, queryResult(complete));
  assert.deepEqual(out.data.map((x) => x.code), ['11', '41']);
  assert.ok(out.data.every((x) => x.res.meta.filters.deletion === 'deleted'));
  assert.deepEqual(out.data.map((x) => x.res.data[0].charger_count), [3, 5]);
  // rebuilt per-region response = common meta + that region's filters/matched/count/output_statistics
  const r41 = out.data[1].res;
  assert.deepEqual(Object.keys(r41.meta).sort(), ['api_version', 'count', 'filters', 'matched', 'output_note', 'output_statistics', 'same_period_shortage_rate_computed', 'snapshot_policy', 'sources', 'units', 'warnings']);
  assert.equal(r41.meta.matched.charger_count, 5);
  assert.equal(r41.meta.filters.region_code, '41');
  // requested order is honoured (and the same array is reused when the order already matches)
  assert.deepEqual(runMatrix({ deletion: 'deleted' }, queryResult(complete), { codes: ['41', '11'] }).out.data.map((x) => x.code), ['41', '11']);
  assert.equal(runMatrix({ deletion: 'deleted' }, queryResult(complete)).out.data, complete);
});

test('real query observers keep staggered filter responses separate and reuse matching cache', async () => {
  const { QueryClient, QueryObserver } = require('@tanstack/query-core');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  const pending = new Map();
  const calls = [];
  const api = {
    chargerOutputRegions: (f) => {
      calls.push(f.deletion);
      if (f.deletion === 'all') return Promise.resolve(regionsPayload('all', { '11': 1, '41': 2 }));
      return new Promise((resolve) => pending.set(f.deletion, () => resolve(regionsPayload(f.deletion, f.deletion === 'deleted' ? { '11': 3, '41': 4 } : { '11': 5, '41': 6 }))));
    },
  };
  let observer;
  const view = (deletion) => {
    const { options } = runMatrix({ deletion }, queryResult(undefined), { api, client });
    const defaulted = client.defaultQueryOptions(options);
    if (!observer) observer = new QueryObserver(client, defaulted); else observer.setOptions(defaulted);
    return runMatrix({ deletion }, observer.getCurrentResult(), { api, client }).out;
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const unsubscribe = (() => { view('all'); return observer.subscribe(() => {}); })();
  const perRegion = (deletion, code) => client.getQueryData(['charger-output', { region_code: code, charger_type: null, deletion, operator_id: null }]);
  try {
    await tick();
    assert.ok(view('all').data.every((x) => x.res.meta.filters.deletion === 'all'));
    // seeded per-region caches (region compare / analysis panel reuse them without new requests)
    assert.equal(perRegion('all', '41').data[0].charger_count, 2);
    assert.equal(perRegion('all', '41').meta.filters.region_code, '41');
    // switch to deleted (slow), then quickly to not_deleted (slow); responses arrive in reverse order
    assert.equal(view('deleted').data, undefined, 'no previous-filter data while deleted loads');
    assert.equal(view('not_deleted').data, undefined);
    pending.get('not_deleted')();
    await tick();
    assert.deepEqual(view('not_deleted').data.map((x) => x.res.data[0].charger_count), [5, 6]);
    pending.get('deleted')();
    await tick();
    const latest = view('not_deleted').data;
    assert.ok(latest.every((x) => x.res.meta.filters.deletion === 'not_deleted'), 'late deleted response must not overwrite the latest filter');
    assert.deepEqual(latest.map((x) => x.res.data[0].charger_count), [5, 6]);
    assert.equal(perRegion('deleted', '11').data[0].charger_count, 3, 'late response only fills its own filter keys');
    assert.equal(perRegion('not_deleted', '11').data[0].charger_count, 5);
    // back to an already-loaded filter: served from cache immediately, no new request
    const before = calls.length;
    const back = view('all');
    assert.ok(back.data.every((x) => x.res.meta.filters.deletion === 'all'));
    assert.equal(calls.length, before);
  } finally {
    unsubscribe();
    observer.destroy();
    client.clear();
  }
});

function renderHeatmap({ optionsError = null, matrixError = null, optionsLoading = false, optionsReady = false, matrixLoading = false } = {}) {
  let queryProps;
  const calls = { options: 0, matrix: 0 };
  const actualQuery = loader({ '../../api/client': { ApiError: class ApiError extends Error {} } })('src/components/ui/QueryState.tsx').QueryState;
  const load = loader({
    '../api/hooks': {
      useFilterOptions: () => ({ data: optionsReady ? { charger_regions: [{ code: '11', name: '서울' }] } : undefined, error: optionsError, isLoading: optionsLoading, refetch: () => { calls.options++; } }),
      useRegionOutputMatrix: () => ({ data: undefined, isLoading: matrixLoading, isFetching: matrixLoading, error: matrixError, refetch: () => { calls.matrix++; } }),
    },
    '../state/filters': { useFilters: () => ({ chargerParams: {}, state: {}, update() {}, activeChargerCount: 0 }) },
    '../components/ui/Card': { Card: ({ children }) => React.createElement('section', null, children) },
    '../components/ui/ChartDetail': {},
    '../components/ui/Insight': { Insight: () => null },
    '../components/FilterBar': { chargerRegionLabel: (_code, name) => name },
    '../components/ui/QueryState': { QueryState: props => { queryProps = props; return React.createElement(actualQuery, props); } },
  });
  const Component = load('src/features/ChartCards.tsx').RegionOutputHeatmapCard;
  const html = renderToStaticMarkup(React.createElement(Component));
  return { html, calls, retry: () => queryProps.onRetry() };
}

test('failed filter-options request shows an error instead of an endless skeleton', () => {
  const state = renderHeatmap({ optionsError: new Error('Options unavailable') });
  assert.match(state.html, /role="alert"/);
  assert.doesNotMatch(state.html, /skeleton-chart/);
  state.retry();
  assert.equal(state.calls.options, 1);
  const recovered = renderHeatmap({ optionsReady: true, matrixLoading: true });
  assert.match(recovered.html, /skeleton-chart/);
  assert.doesNotMatch(recovered.html, /role="alert"/);
});

test('filter-options initial loading remains a loading state', () => {
  const state = renderHeatmap({ optionsLoading: true });
  assert.match(state.html, /skeleton-chart/);
});

test('matrix errors remain visible and retry matrix requests', () => {
  const state = renderHeatmap({ matrixError: new Error('Region unavailable') });
  assert.match(state.html, /role="alert"/);
  state.retry();
  assert.equal(state.calls.matrix, 1);
});
