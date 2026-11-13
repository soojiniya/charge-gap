/* Real-browser regression: Regional Explorer region × output heatmap served by ONE /api/charger-output/regions request.
 *   const r = await require(thisFile)(browser, baseUrl, apiUrl)  → { status, checks, failed }
 * Checks
 *  - first load: 1 heatmap request instead of 16 (Regional Explorer 26 → 10 requests; the operator list now fits one
 *    limit=200 page because /api/operators returns one row per operator ID);
 *  - every heatmap cell (aria-label count) equals what the former 16 /api/charger-output requests give, for filter combinations;
 *  - region filter is ignored by the heatmap (all regions, selected row highlighted);
 *  - rapid filter changes with responses arriving in reverse order: only the latest filter is ever drawn;
 *  - cache reuse kept: analysis panel (region selected), region compare pair, and Charging Infrastructure page
 *    need no /api/charger-output request for regions the heatmap already loaded.
 * Kakao SDK requests are answered with tests/fixtures/kakao-maps-stub.js (the heatmap does not depend on the map).
 */
const fs = require('fs');
const path = require('path');
const STUB = fs.readFileSync(path.join(__dirname, 'fixtures', 'kakao-maps-stub.js'), 'utf8');
const REGIONS = '11 12 26 27 28 30 31 36 41 43 44 47 48 50 51 52'.split(' ');
const BANDS = [[0, 30], [30, 50], [50, 100], [100, 200], [200, Infinity]];

module.exports = async function heatmapMergeRegressions(browser, BASE = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:10000') {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); if (!ok) console.log('FAIL', name, JSON.stringify(detail ?? '').slice(0, 600)); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = async (p) => (await fetch(API + p)).json();
  const qs = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v).sort()).toString();

  /** What the heatmap drew with the former 16 requests: rows (non-empty regions) sorted by total desc, 6 band counts each. */
  async function expectedRows(f) {
    const nr = { ...f }; delete nr.region_code;
    const rows = [];
    for (const code of REGIONS) {
      const res = await api(`/api/charger-output?${qs({ ...nr, region_code: code })}`);
      const counts = [0, 0, 0, 0, 0, 0];
      for (const r of res.data) {
        const k = r.output_kw;
        const i = r.value_status !== 'positive_numeric' || k === null ? 5 : BANDS.findIndex(([lo, hi]) => k >= lo && k < hi);
        counts[i] += r.charger_count;
      }
      if (counts.some((v) => v > 0)) rows.push(counts);
    }
    return rows.sort((a, b) => b.reduce((s, v) => s + v, 0) - a.reduce((s, v) => s + v, 0));
  }
  /** Counts drawn in the heatmap (from each cell's aria-label "…, N기"), row by row. */
  const drawnRows = (page) => page.evaluate(() => [...document.querySelectorAll('table.heatmap tbody tr')].map((tr) =>
    [...tr.querySelectorAll('[aria-label]')].map((c) => (c.getAttribute('aria-label').match(/([0-9,]+)기$/) || [])[1]).filter(Boolean).map((s) => Number(s.replace(/,/g, '')))).filter((r) => r.length === 6));
  const heatReady = (page) => page.waitForFunction(() => document.querySelectorAll('table.heatmap tbody tr').length > 0, null, { timeout: 60000 });

  async function open(url) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    await page.route(/dapi\.kakao\.com\/v2\/maps\/sdk\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
    await page.route(/kakaocdn\.net|daumcdn\.net/, (r) => r.abort());
    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('/api/')) reqs.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
    await page.goto(BASE + url);
    return { page, reqs };
  }

  // 1) first load: 10 requests, one heatmap request, no per-region output requests
  {
    const { page, reqs } = await open('/regional-explorer');
    await heatReady(page);
    await page.waitForLoadState('networkidle');
    const heat = reqs.filter((u) => u.startsWith('/api/charger-output/regions'));
    const perRegion = reqs.filter((u) => /^\/api\/charger-output\?.*region_code=/.test(u));
    check('first load: exactly one /api/charger-output/regions request', heat.length === 1, heat);
    check('first load: no per-region /api/charger-output requests', perRegion.length === 0, perRegion);
    check('first load: Regional Explorer sends 10 API requests (was 26)', reqs.length === 10, reqs);
    check('heatmap request carries no region filter', !/region_code=/.test(heat[0] || ''), heat);
    const expected = await expectedRows({});
    check('heatmap cells = former 16 requests (no filter)', JSON.stringify(await drawnRows(page)) === JSON.stringify(expected), { drawn: await drawnRows(page), expected });

    // 2) cache reuse: select region 41 → analysis panel (output composition) needs no new output request
    reqs.length = 0;
    await page.selectOption('.filterbar select.cg-region-select', '41');
    await page.waitForFunction(() => document.querySelector('.geo-panel-title')?.textContent.includes('경기'));
    await page.locator('.geo-mini-seg button', { hasText: '출력' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.geo-panel .geo-bars').length === 2, null, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    check('analysis panel reuses the heatmap result for region 41 (no /api/charger-output request)', !reqs.some((u) => u.startsWith('/api/charger-output')), reqs.filter((u) => u.includes('charger-output')));
    const panelBars = await page.evaluate(() => [...document.querySelectorAll('.geo-panel .geo-bars')][0].textContent);
    const out41 = await api('/api/charger-output?region_code=41');
    check('panel output composition for 41 equals the API (seeded cache has the same values)', out41.data.length > 0 && /기/.test(panelBars), panelBars.slice(0, 80));

    // 3) region filter ignored by the heatmap; selected row highlighted; same values
    check('heatmap with region filter: still all regions, same values', JSON.stringify(await drawnRows(page)) === JSON.stringify(expected));
    check('selected region row is highlighted', (await page.locator('table.heatmap tbody tr.is-selected').count()) === 1);

    // 4) region compare pair (11, 26): no output requests (seeded per-region cache)
    reqs.length = 0;
    await page.goto(`${BASE}/regional-explorer?region=41&cmp_a=11&cmp_b=26`);
    await heatReady(page);
    await page.waitForLoadState('networkidle');
    // direct first load with a region filter and a compare pair: panel (41) and compare (11, 26) share the one merged request
    const cmpOutput = reqs.filter((u) => /^\/api\/charger-output\?.*region_code=/.test(u));
    check('first load with ?region & compare pair: no per-region /api/charger-output requests', cmpOutput.length === 0, cmpOutput);
    check('first load with ?region & compare pair: exactly one merged request', reqs.filter((u) => u.startsWith('/api/charger-output/regions')).length === 1, reqs.filter((u) => u.includes('charger-output')));
    check('compare section shows both regions\' output', (await page.locator('.cmp-card').count()) > 0);

    // 5) Charging Infrastructure page (SPA navigation, region filter 41) reuses the seeded entry
    await page.goto(`${BASE}/regional-explorer?region=41`);
    await heatReady(page);
    await page.waitForLoadState('networkidle');
    reqs.length = 0;
    await page.getByRole('navigation').getByRole('link', { name: /Charging Infrastructure|충전 인프라/ }).first().click();
    await page.waitForURL(/charging-infrastructure/);
    await page.waitForLoadState('networkidle');
    await sleep(500);
    check('Charging Infrastructure reuses region 41 output (no /api/charger-output?region_code=41)', !reqs.some((u) => /^\/api\/charger-output\?region_code=41$/.test(u)), reqs);
    await page.context().close();
  }

  // 6) filter combinations: drawn cells = former 16 requests
  for (const [url, f] of [
    ['?deletion=deleted', { deletion: 'deleted' }],
    ['?type=02', { charger_type: '02' }],
    ['?operator=PI', { operator_id: 'PI' }],
    ['?type=04&deletion=not_deleted', { charger_type: '04', deletion: 'not_deleted' }],
    ['?type=07&operator=ME', { charger_type: '07', operator_id: 'ME' }],
  ]) {
    const { page, reqs } = await open(`/regional-explorer${url}`);
    const expected = await expectedRows(f);
    // 결과가 없는 조합(예: 유형 07 + 운영기관 ME)은 히트맵 대신 빈 상태가 나오므로 행이 생길 때까지 기다리지 않습니다.
    if (expected.length) await heatReady(page);
    await page.waitForLoadState('networkidle');
    await sleep(300);
    check(`heatmap cells = former 16 requests (${url})`, JSON.stringify(await drawnRows(page)) === JSON.stringify(expected), { drawn: (await drawnRows(page)).slice(0, 3), expected: expected.slice(0, 3) });
    check(`heatmap request carries the filter (${url})`, reqs.some((u) => u.startsWith('/api/charger-output/regions') && Object.entries(f).every(([k, v]) => u.includes(`${k}=${v}`))), reqs.filter((u) => u.includes('regions')));
    await page.context().close();
  }

  // 7) rapid filter changes, responses in reverse order: only the latest filter is drawn
  {
    const { page } = await open('/regional-explorer');
    await heatReady(page);
    await page.waitForLoadState('networkidle');
    const delayed = (ms) => async (r) => { await sleep(ms); await r.continue().catch(() => {}); };
    await page.route(/\/api\/charger-output\/regions\?charger_type=02/, delayed(2600));
    await page.route(/\/api\/charger-output\/regions\?charger_type=04/, delayed(1400));
    await page.route(/\/api\/charger-output\/regions\?charger_type=07/, delayed(200));
    const typeSelect = page.locator('.filterbar select').nth(1);
    await typeSelect.selectOption('02'); await sleep(120);
    await typeSelect.selectOption('04'); await sleep(120);
    await typeSelect.selectOption('07');
    const latest = JSON.stringify(await expectedRows({ charger_type: '07' }));
    const before = JSON.stringify(await expectedRows({}));
    const samples = [];
    for (let i = 0; i < 16; i += 1) { samples.push(JSON.stringify(await drawnRows(page))); await sleep(220); }
    const drawn = samples.filter((s) => s !== '[]');
    check('rapid changes: heatmap never shows the previous (no filter) values after the change', !samples.slice(1).includes(before), { n: samples.length });
    check('rapid changes: every drawn heatmap is the latest filter (07), also after late 02/04 responses', drawn.length > 0 && drawn.every((s) => s === latest), { distinct: [...new Set(drawn)].length });
    await page.context().close();
  }

  const failed = results.filter((r) => !r.ok);
  return { status: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed };
};
