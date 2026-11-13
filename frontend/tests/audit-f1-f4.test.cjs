const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('./ts-loader.cjs');

test('F1: operator rows are one per operator ID (busiId); name variants stay inside the row', () => {
  // /api/operators: one row per operator ID, display name = institution name, other spellings in name_variants.
  const rows = [['PI', 'GS차지비'], ['PW', '파워큐브'], ['EV', '에버온'], ['PL', '플러그링크'], ['LU', 'LG유플러스 볼트업']].map(([id, name], i) => ({
    operator_id: id, operator_name: name, charger_count: 5 - i, share_pct: 20,
    name_variants: [{ name, charger_count: 4 - i }, { name: `${name}(주)`, charger_count: 1 }],
  }));
  const panel = loader({
    react: { ...React, useMemo: fn => fn(), useState: initial => [initial, () => {}] },
    '../api/hooks': { useFilterOptions: () => ({}), useOverview: () => ({}),
      useChargerTypes: () => ({}), useChargerOutput: () => ({}),
      useOperators: () => ({ data: { data: rows, meta: { pagination: { total_items: 5 } } } }) },
    './FilterBar': { chargerRegionLabel: (_code, name) => name },
    '../features/ChartCards': { OUTPUT_BANDS: [], bandIndex: () => 0 },
    './ui/QueryState': { ErrorState: () => null },
  })('src/components/MapAnalysisPanel.tsx').MapAnalysisPanel;
  const tree = panel({ filters: {}, selected: null });
  function findItems(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type?.name === 'BarList' && node.props.items?.some(r => r.value === 5)) return node.props.items;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = findItems(child); if (found) return found;
    }
    return null;
  }
  const items = findItems(tree);
  assert.ok(items);
  assert.equal(new Set(items.map(i => i.key)).size, rows.length);
  assert.deepEqual(items.map(i => i.key), rows.map(r => r.operator_id));
  assert.deepEqual(items.map(i => i.value), rows.map(r => r.charger_count));
});

test('F2: changed location queries do not expose previous-filter placeholder rows', () => {
  let options;
  const hooks = loader({ '@tanstack/react-query': { keepPreviousData: previous => previous,
    useQuery: input => { options = input; return input; } }, './endpoints': { api: {} },
  })('src/api/hooks.ts');
  hooks.useLocationsPage({ charger_type: '09' }, 1, 20, null);
  assert.equal(options.placeholderData, undefined);
  assert.equal(options.queryKey[1].charger_type, '09');
});

function year(year, count, partial = false) {
  return { year, annual_installed_count: count, cumulative_count: count,
    is_partial_year: partial, completed_calendar_year: !partial };
}
const annual = loader()('src/analysis/insights.tsx').insightAnnual;
const text = rows => renderToStaticMarkup(React.createElement(React.Fragment, null, annual(rows).interpretation));

test('F3: actual 2024–2025 decline is never described as an increase', () => {
  const value = text([year(2024, 108435), year(2025, 89805)]);
  assert.doesNotMatch(value, /가장 크게 늘/);
  assert.match(value, /증가한 해는 없/);
  assert.match(value, /108,435/);
});

test('F3: rising intervals still report their largest positive increase', () => {
  assert.match(text([year(2021, 31512), year(2022, 92460), year(2023, 111981)]), /2022.*가장 크게 늘/);
});

test('F3: equal values do not become increases, and one completed year is insufficient', () => {
  assert.doesNotMatch(text([year(2024, 100), year(2025, 100)]), /가장 크게 늘/);
  assert.match(text([year(2025, 89805)]), /부족/);
});

test('F3: partial 2026 stays out of completed-year comparisons', () => {
  const rows = [year(2024, 108435), year(2025, 89805), year(2026, 61408, true)];
  assert.doesNotMatch(text(rows), /2026.*가장 크게 늘/);
  const findings = renderToStaticMarkup(React.createElement(React.Fragment, null, annual(rows).findings));
  assert.match(findings, /부분 연도/);
});

test('F4: size legend declares minimum-size correction while preserving geometry', () => {
  const { REGION_SIZE_LEGEND, regionRadius } = loader()('src/components/geo/cluster.ts');
  assert.match(REGION_SIZE_LEGEND, /최소 크기 보정/);
  assert.doesNotMatch(REGION_SIZE_LEGEND, /넓이 비례/);
  assert.equal(regionRadius(100, 10000), 13);
  assert.equal(regionRadius(10000, 10000), 31);
});
