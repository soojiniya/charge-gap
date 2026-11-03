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

test('every source string in insights.tsx round-trips unchanged', () => {
  const src = fs.readFileSync(path.join(root, 'src/analysis/insights.tsx'), 'utf8');
  const consts = Object.fromEntries([...src.matchAll(/const (EV_SRC|CH_SRC) =\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.ok(consts.EV_SRC && consts.CH_SRC);
  const sources = [...src.matchAll(/source:\s*(EV_SRC|"[^"]+"|`[^`]+`)/g)].map((m) => {
    const raw = m[1];
    if (raw === 'EV_SRC') return consts.EV_SRC;
    return raw.slice(1, -1).replace('${CH_SRC}', consts.CH_SRC).replace(/\$\{fmtInt\(\w+\)\}/, '100,590');
  });
  assert.ok(sources.length >= 10, `found ${sources.length} sources`);
  for (const s of sources) {
    const parts = parseSource(s);
    assert.equal(joinSourceParts(parts), s);
    if (s.includes('/api/')) assert.match(parts.api, /^\/api\//, s);
  }
});
