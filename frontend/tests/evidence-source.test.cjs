/* Regression: the evidence panel splits each '데이터 출처' string into name / 조회 date / API for display
 * without dropping or changing any text (every source string used by the insights round-trips). */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loader, root } = require('./ts-loader.cjs');

const { parseSource, joinSourceParts } = loader()('src/analysis/sourceParts.ts');

test('charger source: agency name, 조회 date, API path and note are separated', () => {
  assert.deepEqual(parseSource('한국환경공단 충전기 정보 2026-10-15 조회, /api/charger-types (정의: 한국환경공단 활용가이드 v1.25)'), {
    name: '한국환경공단 충전기 정보',
    date: '2026-10-15 조회',
    api: '/api/charger-types',
    apiNote: '(정의: 한국환경공단 활용가이드 v1.25)',
  });
});

test('sources without a 조회 date or API keep their text', () => {
  assert.deepEqual(parseSource('충전기 설치 성장 추세_2026-10-15.xlsx, /api/growth'), { name: '충전기 설치 성장 추세_2026-10-15.xlsx', api: '/api/growth' });
  assert.deepEqual(parseSource('출처 문구만 있는 경우'), { name: '출처 문구만 있는 경우' });
});

test('every source string in insights.tsx and regionCompare.tsx round-trips unchanged', () => {
  const ds = loader()('src/analysis/dataSources.ts');
  const consts = { EV_SRC: ds.EV_SRC, CH_SRC: ds.CH_SRC, GROWTH_SRC: ds.GROWTH_SRC };
  const sources = [];
  for (const file of ['src/analysis/insights.tsx', 'src/analysis/regionCompare.tsx']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(src, /const (EV_SRC|CH_SRC|GROWTH_SRC) =/, `${file} uses the shared dataSources constants`);
    for (const m of src.matchAll(/source:\s*(EV_SRC|GROWTH_SRC|"[^"]+"|'[^']+'|`[^`]+`)/g)) {
      const raw = m[1];
      if (raw in consts) sources.push(consts[raw]);
      else sources.push(raw.slice(1, -1).replace('${CH_SRC}', consts.CH_SRC).replace(/\$\{fmtInt\(\w+\)\}/, '100,590'));
    }
  }
  assert.ok(sources.length >= 15, `found ${sources.length} sources`);
  for (const s of sources) {
    const parts = parseSource(s);
    assert.equal(joinSourceParts(parts), s);
    assert.ok(parts.items && parts.items.length >= 4, `structured items: ${s}`);
    if (s.includes('/api/')) assert.match(parts.api, /^\/api\//, s);
  }
});

test('structured source: provider, labelled items and API are separated', () => {
  const { EV_SRC } = loader()('src/analysis/dataSources.ts');
  const p = parseSource(EV_SRC);
  assert.equal(p.name, '국토교통부 통계누리');
  assert.deepEqual(p.items.map((i) => i.label), ['작성기관', null, '자료 기준', '파일 저장', '이용 조건']);
  assert.equal(p.items[0].value, '국토교통부');
  assert.equal(p.api, '/api/ev-registration');
});
