/* Region × output heatmap merge: region compare / analysis panel share the heatmap's single request (real QueryClient). */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const regionsPayload = (deletion, codes = ['11', '41']) => ({
  data: {
    common_meta: { api_version: '1.0', sources: {}, units: {}, warnings: [], same_period_shortage_rate_computed: false, snapshot_policy: 'fixed', output_note: 'note' },
    regions: codes.map((code, i) => ({
      region_code: code,
      data: [{ output_raw: '7', output_kw: 7, value_status: 'positive_numeric', charger_count: 10 + i, station_count: 1, not_deleted_charger_count: 10 + i, deleted_charger_count: 0, share_pct: 100 }],
      filters: { region_code: code, charger_type: null, deletion, operator_id: null },
      matched: { charger_count: 10 + i, station_count: 1, not_deleted_charger_count: 10 + i, deleted_charger_count: 0 },
      count: 1,
      output_statistics: { valid_positive_count: 10 + i, invalid_or_missing_count: 0, median_kw: 7, min_kw: 7, max_kw: 7 },
    })),
  },
  meta: { api_version: '1.0', filters: { region_code: null, deletion } },
});

function setup() {
  const { QueryClient, QueryObserver } = require('@tanstack/query-core');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  const calls = { regions: 0, single: 0 };
  let release;
  const api = {
    chargerOutputRegions: () => { calls.regions += 1; return new Promise((resolve) => { release = () => resolve(regionsPayload('all')); }); },
    chargerOutput: (f) => { calls.single += 1; return Promise.resolve({ data: [], meta: { filters: f } }); },
  };
  const hooksWith = (capture) => loader({
    '@tanstack/react-query': { useQuery: (o) => { capture(o); return {}; }, useQueryClient: () => client, keepPreviousData: (x) => x, useInfiniteQuery: () => ({}) },
    './endpoints': { api },
  })('src/api/hooks.ts');
  const observe = (call) => {
    let options;
    call(hooksWith((o) => { options = o; }));
    const observer = new QueryObserver(client, client.defaultQueryOptions(options));
    const unsubscribe = observer.subscribe(() => {});
    return { observer, done: () => { unsubscribe(); observer.destroy(); } };
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  return { client, calls, api, observe, tick, release: () => release() };
}

test('panel/compare region output started BEFORE the heatmap shares the one merged request (first load with ?region / ?cmp)', async () => {
  const { client, calls, observe, tick, release } = setup();
  const a = observe((h) => h.useChargerOutput({ region_code: '41', deletion: 'all' }, { shareRegionRequest: true }));   // analysis panel (region 41) mounts first
  const b = observe((h) => h.useChargerOutput({ region_code: '11', deletion: 'all' }, { shareRegionRequest: true }));   // region compare
  const heat = observe((h) => h.useRegionOutputMatrix({ deletion: 'all' }, ['11', '41']));       // heatmap
  try {
    await tick();
    assert.equal(calls.regions, 1, 'one merged request for all three');
    assert.equal(calls.single, 0, 'no per-region /api/charger-output requests');
    release();
    await tick(); await tick();
    assert.equal(a.observer.getCurrentResult().data.data[0].charger_count, 11);
    assert.equal(a.observer.getCurrentResult().data.meta.filters.region_code, '41');
    assert.equal(b.observer.getCurrentResult().data.meta.filters.region_code, '11');
    assert.deepEqual(heat.observer.getCurrentResult().data.map((x) => x.code), ['11', '41']);
    // same object the heatmap seeded under the per-region key (Charging Infrastructure reuses it too)
    assert.equal(client.getQueryData(['charger-output', { region_code: '41', charger_type: null, deletion: 'all', operator_id: null }]), a.observer.getCurrentResult().data);
  } finally { a.done(); b.done(); heat.done(); client.clear(); }
});

test('without a region the panel keeps using /api/charger-output (all regions), unchanged', async () => {
  const { client, calls, observe, tick } = setup();
  const p = observe((h) => h.useChargerOutput({ deletion: 'all' }, { shareRegionRequest: true }));
  try {
    await tick();
    assert.equal(calls.single, 1);
    assert.equal(calls.regions, 0);
  } finally { p.done(); client.clear(); }
});

test('region output keeps placeholder semantics of useChargerOutput (N-1 panel guard relies on isPlaceholderData)', () => {
  let options;
  loader({
    '@tanstack/react-query': { useQuery: (o) => { options = o; return {}; }, useQueryClient: () => ({}), keepPreviousData: 'KEEP', useInfiniteQuery: () => ({}) },
    './endpoints': { api: {} },
  })('src/api/hooks.ts').useChargerOutput({ region_code: '11' }, { shareRegionRequest: true });
  assert.equal(options.placeholderData, 'KEEP');
  assert.deepEqual(options.queryKey, ['charger-output', { region_code: '11', charger_type: null, deletion: 'all', operator_id: null }]);
});
