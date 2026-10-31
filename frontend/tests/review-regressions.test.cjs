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

function matrixOptions(filters = { deletion: 'deleted' }, api = {}) {
  let options;
  const load = loader({ '@tanstack/react-query': { useQueries: o => { options = o; return o; } }, './endpoints': { api } });
  load('src/api/hooks.ts').useRegionOutputMatrix(filters, ['11', '41']);
  return options;
}

const result = (deletion, extra = {}) => ({
  data: { data: [], meta: { filters: { deletion } } },
  isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch() {}, ...extra,
});

test('heatmap never combines previous-filter placeholders and current responses', () => {
  const options = matrixOptions();
  assert.equal(options.queries[0].placeholderData, undefined);
  const mixed = options.combine([result('all', { isPlaceholderData: true, isFetching: true }), result('deleted')]);
  assert.equal(mixed.data, undefined);
});

test('heatmap waits for all current regions and preserves correct data', () => {
  const options = matrixOptions();
  assert.equal(options.combine([result('deleted'), result('deleted', { data: undefined, isLoading: true })]).data, undefined);
  const complete = options.combine([result('deleted'), result('deleted')]);
  assert.deepEqual(complete.data.map(x => x.code), ['11', '41']);
  assert.ok(complete.data.every(x => x.res.meta.filters.deletion === 'deleted'));
});

test('real query observers keep staggered filter responses separate and reuse matching cache', async () => {
  const { QueryClient, QueriesObserver } = require('@tanstack/query-core');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  const pending = new Map();
  const api = { chargerOutput: f => f.deletion === 'all'
    ? Promise.resolve(result('all').data)
    : new Promise(resolve => pending.set(f.region_code, () => resolve(result('deleted').data))) };
  let options = matrixOptions({ deletion: 'all' }, api);
  // useQueries supplies defaulted options (including queryHash) to its observer.
  const queries = () => options.queries.map(q => client.defaultQueryOptions(q));
  const observer = new QueriesObserver(client, queries());
  const unsubscribe = observer.subscribe(() => {});
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    await tick();
    assert.ok(options.combine(observer.getCurrentResult()).data.every(x => x.res.meta.filters.deletion === 'all'));
    options = matrixOptions({ deletion: 'deleted' }, api);
    observer.setQueries(queries());
    assert.equal(options.combine(observer.getCurrentResult()).data, undefined);
    pending.get('11')();
    await tick();
    assert.equal(options.combine(observer.getCurrentResult()).data, undefined);
    pending.get('41')();
    await tick();
    assert.ok(options.combine(observer.getCurrentResult()).data.every(x => x.res.meta.filters.deletion === 'deleted'));
    options = matrixOptions({ deletion: 'all' }, api);
    observer.setQueries(queries());
    assert.ok(options.combine(observer.getCurrentResult()).data.every(x => x.res.meta.filters.deletion === 'all'));
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
