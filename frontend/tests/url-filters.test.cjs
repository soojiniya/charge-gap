/* Regression: invalid URL filter values are ignored (and reported for removal) instead of reaching the API. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loader, root } = require('./ts-loader.cjs');

const { parseFilters, REGION_CODES, CHARGER_TYPE_CODES } = loader({ '../api/hooks': { useOperatorIds: () => undefined } })('src/state/filters.ts');
const parse = (query, operators) => parseFilters(new URLSearchParams(query), operators);

test('valid deep link is kept as is', () => {
  const { state, invalid } = parse('region=12&type=11&deletion=deleted&operator=PI&ev_region=41', new Set(['PI']));
  assert.deepEqual(state, { region: '12', type: '11', deletion: 'deleted', operator: 'PI', evRegion: '41' });
  assert.deepEqual(invalid, []);
});

test('unknown region, type, EV region and deletion fall back to 전국/전체 and are reported', () => {
  const { state, invalid } = parse('region=99&type=12&ev_region=29&deletion=maybe&from=2015');
  assert.deepEqual(state, { region: undefined, type: undefined, deletion: 'all', operator: undefined, evRegion: undefined });
  assert.deepEqual(invalid.sort(), ['deletion', 'evRegion', 'region', 'type']);
});

test('empty and malformed values are removed; absent values are not reported', () => {
  assert.deepEqual(parse('region=&operator=%3Cscript%3E').invalid.sort(), ['operator', 'region']);
  assert.deepEqual(parse('').invalid, []);
  assert.deepEqual(parse('region=11%20').invalid, ['region']);
});

test('operator: format-checked until the list arrives, then checked against it', () => {
  assert.equal(parse('operator=ZZ').state.operator, 'ZZ');
  const { state, invalid } = parse('operator=ZZ', new Set(['PI', 'ME']));
  assert.equal(state.operator, undefined);
  assert.deepEqual(invalid, ['operator']);
  assert.equal(parse('operator=ME', new Set(['PI', 'ME'])).state.operator, 'ME');
});

test('frontend code lists match the API definitions in backend/chargegap_api/data.py', () => {
  const py = fs.readFileSync(path.resolve(root, '../backend/chargegap_api/data.py'), 'utf8');
  const regions = py.match(/REGIONS_2026\s*=\s*dict\(zip\('([^']+)'\.split\(\)/)[1].split(/\s+/);
  const typeBlock = py.match(/TYPE_DEFINITIONS\s*=\s*\{([\s\S]*?)\}/)[1];
  const types = [...typeBlock.matchAll(/'(\d{2})'\s*:/g)].map((m) => m[1]);
  assert.deepEqual([...REGION_CODES], regions);
  assert.deepEqual([...CHARGER_TYPE_CODES], types);
});
