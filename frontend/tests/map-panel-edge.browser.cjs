/* Real-browser regression for N-1 (analysis panel never shows the previous filter's numbers under the new filter)
 * and N-2 (stations near the screen edge at zoom 16–18 are requested and drawn).
 *   const r = await require(thisFile)(browser, baseUrl, apiUrl)  → { status, checks, failed }
 * Needs a production build (any non-empty VITE_KAKAO_MAP_KEY) and the local backend; the Kakao SDK is answered with
 * tests/fixtures/kakao-maps-stub.js (the stub map instance is exposed as window.__cgMap for this test only).
 */
const fs = require('fs');
const path = require('path');
const STUB = fs.readFileSync(path.join(__dirname, 'fixtures', 'kakao-maps-stub.js'), 'utf8') +
  '\n;(function(){var O=window.kakao.maps.Map;function M(el,o){var m=new O(el,o);window.__cgMap=m;return m;}M.prototype=O.prototype;window.kakao.maps.Map=M;})();';
const SDK_RE = /dapi\.kakao\.com\/v2\/maps\/sdk\.js/;

module.exports = async function mapPanelEdgeRegressions(browser, BASE = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:10000') {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); if (!ok) console.log('FAIL', name, JSON.stringify(detail ?? '')); };
  const api = async (p) => (await fetch(API + p)).json();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function open(url, viewport = { width: 1440, height: 1000 }) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.route(SDK_RE, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
    await page.route(/kakaocdn\.net|daumcdn\.net/, (r) => r.abort());
    await page.goto(BASE + url);
    await page.waitForFunction(() => window.__cgMap && document.querySelector('.cg-mark-canvas') && document.querySelector('.geo-panel .geo-bars'), null, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    return page;
  }
  const panel = (page) => page.evaluate(() => ({
    title: document.querySelector('.geo-panel-title')?.textContent ?? '',
    kpi: [...document.querySelectorAll('.geo-panel .geo-kpi-value')].map((e) => e.textContent.replace(/[^0-9.]/g, '')),
    bars: [...document.querySelectorAll('.geo-panel .geo-bars')].map((u) => [...u.querySelectorAll('.geo-bar-count')].map((e) => Number(e.textContent.replace(/[^0-9]/g, '')))),
    skeletons: document.querySelectorAll('.geo-panel .geo-skeleton').length,
    errors: document.querySelectorAll('.geo-panel .state.error').length,
    updating: /갱신 중/.test(document.querySelector('.geo-panel')?.textContent ?? ''),
    // 영역별 수치(없으면 null): 요약 KPI, 유형·출력 구성, 주요 운영기관
    sections: Object.fromEntries([...document.querySelectorAll('.geo-panel .geo-panel-section')].map((sec) => {
      const head = sec.querySelector('h4')?.textContent ?? '';
      const key = /요약/.test(head) ? 'kpi' : /구성/.test(head) ? 'mix' : /운영기관/.test(head) && !/같은/.test(head) ? 'ops' : null;
      if (!key) return [null, null];
      const vals = key === 'kpi' ? [...sec.querySelectorAll('.geo-kpi-value')].slice(0, 2).map((e) => e.textContent.replace(/[^0-9]/g, ''))
        : [...sec.querySelectorAll('.geo-bar-count')].map((e) => Number(e.textContent.replace(/[^0-9]/g, '')));
      return [key, vals.length ? vals : null];
    }).filter(([k]) => k)),
  }));
  /** 새 필터 기준의 기대값: 요약 충전기·충전소 수, 유형 구성 상위 수치, 운영기관 상위 수치 */
  async function expected(params) {
    const qs = new URLSearchParams(params).toString();
    const [ov, ty, op] = await Promise.all([api(`/api/overview?${qs}`), api(`/api/charger-types?${qs}`), api(`/api/operators?limit=5&page=1&${qs}`)]);
    const types = ty.data.filter((r) => r.charger_count > 0).map((r) => r.charger_count).sort((a, b) => b - a);
    const top = types.slice(0, 5);
    if (types.length > 5) top.push(types.slice(5).reduce((a, b) => a + b, 0));
    return { kpi: [String(ov.data.chargers.charger_count), String(ov.data.chargers.station_count)], types: top, ops: op.data.map((o) => o.charger_count) };
  }
  const matches = (p, e) => p.kpi[0] === e.kpi[0] && p.kpi[1] === e.kpi[1] && JSON.stringify(p.bars[0]) === JSON.stringify(e.types) && JSON.stringify(p.bars[1]) === JSON.stringify(e.ops);
  const regionSelect = '.filterbar select.cg-region-select';
  const typeSelect = '.filterbar select >> nth=1';
  const cors = { 'Access-Control-Allow-Origin': BASE };
  const delayed = (ms) => async (r) => { await sleep(ms); await r.continue().catch(() => {}); };

  // ---------- N-1 ----------
  {
    const page = await open('/regional-explorer');
    const before = await panel(page);
    const national = await expected({});
    check('N-1 baseline: national panel numbers equal the API', matches(before, national), { before, national });

    // (a) slow response: until the new filter's data arrives, no previous numbers under the new title
    await page.route(/\/api\/(overview|charger-types|charger-output|operators)\?.*region_code=26/, delayed(2500));
    await page.selectOption(regionSelect, '26');
    await sleep(700);
    const during = await panel(page);
    check('N-1 slow: title switches to the new region immediately', /부산/.test(during.title), during);
    check('N-1 slow: no previous-filter numbers while waiting (KPI and bars hidden)', during.kpi.length === 0 && during.bars.length === 0, during);
    check('N-1 slow: existing loading skeletons shown in the three sections', during.skeletons >= 3, during);
    await page.waitForFunction(() => document.querySelectorAll('.geo-panel .geo-bars').length === 2 && document.querySelectorAll('.geo-panel .geo-kpi-value').length > 0, null, { timeout: 15000 });
    const busan = await expected({ region_code: '26' });
    const after = await panel(page);
    check('N-1 slow: after the response the numbers are the new filter\'s (= API)', matches(after, busan), { after, busan });
    await page.unroute(/\/api\/(overview|charger-types|charger-output|operators)\?.*region_code=26/);

    // (b) back to an already-loaded filter: cached data appears at once and equals the API
    await page.selectOption(regionSelect, '');
    await sleep(300);
    const back = await panel(page);
    check('N-1 cached: switching back to 전국 shows the national numbers immediately', /전국/.test(back.title) && matches(back, national), back);

    // (c) error for the new filter: an error state, never the previous numbers
    const errRe = /\/api\/(charger-types|operators)\?.*region_code=27/;
    await page.route(errRe, (r) => r.fulfill({ status: 500, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.', parameter: null } }) }));
    await page.selectOption(regionSelect, '27');
    await sleep(500);
    const errWait = await panel(page);
    check('N-1 error: while the failing request is (re)tried, previous numbers are not shown in those sections', errWait.bars.length === 0, errWait);
    await page.waitForFunction(() => document.querySelectorAll('.geo-panel .state.error').length >= 2, null, { timeout: 15000 });
    const errShown = await panel(page);
    const daegu = await expected({ region_code: '27' });
    check('N-1 error: failing sections show the error state (no stale bars); summary still shows the new filter', errShown.errors >= 2 && errShown.bars.length === 0 && errShown.kpi[0] === daegu.kpi[0], { errShown, daegu: daegu.kpi });
    await page.unroute(errRe);
    // 버튼을 누르면 그 영역이 다시 그려지므로, 남은 '다시 요청' 버튼을 매번 새로 찾아 누릅니다.
    for (let i = 0; i < 4 && (await page.locator('.geo-panel .state.error button').count()) > 0; i += 1) {
      await page.locator('.geo-panel .state.error button').first().click().catch(() => {});
      await sleep(150);
    }
    await page.waitForFunction(() => document.querySelectorAll('.geo-panel .geo-bars').length === 2, null, { timeout: 15000 });
    check('N-1 error: retry after recovery shows the new filter\'s numbers', matches(await panel(page), daegu), await panel(page));

    // (d) rapid changes with out-of-order responses: only the latest filter is ever shown
    await page.route(/\/api\/(overview|charger-types|charger-output|operators)\?.*region_code=28/, delayed(2600));
    await page.route(/\/api\/(overview|charger-types|charger-output|operators)\?.*region_code=30/, delayed(1600));
    await page.route(/\/api\/(overview|charger-types|charger-output|operators)\?.*region_code=31/, delayed(200));
    await page.selectOption(regionSelect, '28');
    await sleep(150);
    await page.selectOption(regionSelect, '30');
    await sleep(150);
    await page.selectOption(regionSelect, '31');
    const ulsan = await expected({ region_code: '31' });
    const samples = [];
    for (let i = 0; i < 16; i += 1) { samples.push(await panel(page)); await sleep(250); }
    // 영역마다: 수치가 보이면 그 값은 반드시 최신 필터(울산)의 값이어야 함(영역별로 도착 시점은 다를 수 있음)
    // 수치가 하나도 없는 상태(예: 마지막 선택 직후 직전 단계 제목으로 로딩 중)는 이전 수치 노출이 아니므로 통과
    const sectionOk = (s) => (!s.sections.kpi && !s.sections.mix && !s.sections.ops) || (/울산/.test(s.title)
      && (!s.sections.kpi || JSON.stringify(s.sections.kpi) === JSON.stringify(ulsan.kpi))
      && (!s.sections.mix || JSON.stringify(s.sections.mix) === JSON.stringify(ulsan.types))
      && (!s.sections.ops || JSON.stringify(s.sections.ops) === JSON.stringify(ulsan.ops)));
    const bad = samples.filter((s) => !sectionOk(s));
    check('N-1 rapid: every number shown in any panel section is the latest filter\'s (울산), including after late 인천·대전 responses',
      bad.length === 0 && matches(samples[samples.length - 1], ulsan) && samples.some((s) => s.sections.kpi || s.sections.mix || s.sections.ops),
      { bad, last: samples[samples.length - 1], ulsan });
    // other filter kinds (type) behave the same
    await page.route(/\/api\/(overview|charger-types|charger-output|operators)\?.*charger_type=04/, delayed(1500));
    await page.selectOption(typeSelect, '04');
    await sleep(500);
    const typeWait = await panel(page);
    check('N-1 type filter: previous numbers hidden while the new type filter loads', typeWait.kpi.length === 0 && typeWait.bars.length === 0, typeWait);
    await page.waitForFunction(() => document.querySelectorAll('.geo-panel .geo-bars').length === 2, null, { timeout: 15000 });
    check('N-1 type filter: then equals the API (울산 + 04)', matches(await panel(page), await expected({ region_code: '31', charger_type: '04' })));
    await page.context().close();
  }

  // ---------- N-2 ----------
  {
    const page = await open('/regional-explorer');
    const reqs = [];
    page.on('request', (r) => { if (/\/api\/locations(\/grid)?\?/.test(r.url())) reqs.push(r.url()); });
    const points = [[37.5005, 127.0365], [37.5665, 126.978], [35.1586, 129.1604], [37.2636, 127.0286], [33.4996, 126.5312]];
    const levels = [9, 7, 5, 4, 3, 2]; // zoom 11, 13, 15, 16, 17, 18
    let edgeChecks = 0;
    for (const [filterName, params] of [['none', {}], ['not_deleted+02', { deletion: 'not_deleted', charger_type: '02' }]]) {
      if (params.charger_type) {
        await page.goto(`${BASE}/regional-explorer?deletion=not_deleted&type=02`);
        await page.waitForFunction(() => window.__cgMap && document.querySelector('.cg-mark-canvas'), null, { timeout: 30000 });
        await page.waitForLoadState('networkidle');
      }
      for (const [lat, lng] of points) {
        for (const level of levels) {
          reqs.length = 0;
          await page.evaluate(({ lat, lng, level }) => {
            document.querySelector('.geo-kakao').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            window.__cgMap.setLevel(level);
            window.__cgMap.setCenter(new window.kakao.maps.LatLng(lat, lng));
          }, { lat, lng, level });
          await sleep(450);
          await page.waitForLoadState('networkidle');
          await sleep(250);
          const view = await page.evaluate(() => {
            const b = window.__cgMap.getBounds(); const sw = b.getSouthWest(); const ne = b.getNorthEast();
            const marks = document.querySelector('.cg-mark-canvas').cgMarks || [];
            return { real: [sw.getLng(), sw.getLat(), ne.getLng(), ne.getLat()], status: document.querySelector('.geo-status-text')?.textContent ?? '',
              drawn: marks.flatMap((m) => (m.kind === 'station' ? [m.row.station_id] : (m.members || []).map((x) => x.station_id))) };
          });
          const zoom = 20 - level;
          const last = reqs.filter((u) => (zoom >= 16 ? /\/api\/locations\?/ : /\/api\/locations\/grid\?/).test(u)).pop();
          const qs = new URLSearchParams(params).toString();
          if (!last) { check(`N-2 ${filterName} zoom ${zoom} @${lat},${lng}: a map data request was made`, false, view); continue; }
          const asked = new URL(last).searchParams.get('bbox').split(',').map(Number);
          const covers = asked[0] <= view.real[0] && asked[1] <= view.real[1] && asked[2] >= view.real[2] && asked[3] >= view.real[3];
          const slack = Math.max(view.real[0] - asked[0], view.real[1] - asked[1], asked[2] - view.real[2], asked[3] - view.real[3]);
          edgeChecks += 1;
          check(`N-2 ${filterName} zoom ${zoom} @${lat},${lng}: requested bbox covers the whole screen (≤ 1e-5° wider)`, covers && slack <= 1e-5 + 1e-9, { asked, real: view.real });
          const inView = await api(`/api/locations?bbox=${view.real.join(',')}&limit=1000${qs ? `&${qs}` : ''}`);
          const askedRes = await api(`/api/locations?bbox=${asked.join(',')}&limit=1${qs ? `&${qs}` : ''}`);
          const statusNums = (view.status.match(/[0-9][0-9,]*/g) || []).map((s) => Number(s.replace(/,/g, '')));
          if (zoom >= 16) {
            const drawn = new Set(view.drawn);
            const missing = inView.data.filter((r) => !drawn.has(r.station_id)).map((r) => r.station_id);
            check(`N-2 ${filterName} zoom ${zoom} @${lat},${lng}: every station inside the screen is drawn`, missing.length === 0, { missing, inView: inView.meta.pagination.total_items });
            check(`N-2 ${filterName} zoom ${zoom} @${lat},${lng}: status "N / M곳" = API total for the requested bbox`, statusNums[1] === askedRes.meta.pagination.total_items && statusNums[0] === askedRes.meta.pagination.total_items, { status: view.status, api: askedRes.meta.pagination.total_items });
          } else {
            const g = await api(`/api/locations/grid?bbox=${asked.join(',')}&zoom=${zoom}${qs ? `&${qs}` : ''}`);
            check(`N-2 ${filterName} zoom ${zoom} @${lat},${lng}: grid status count = server matched = /api/locations total`, statusNums[0] === g.meta.matched.station_count && g.meta.matched.station_count === askedRes.meta.pagination.total_items,
              { status: view.status, grid: g.meta.matched.station_count, loc: askedRes.meta.pagination.total_items });
          }
        }
      }
    }
    check('N-2: edge cases exercised', edgeChecks >= 50, { edgeChecks });
    await page.context().close();
  }

  const failed = results.filter((r) => !r.ok);
  return { status: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed };
};
