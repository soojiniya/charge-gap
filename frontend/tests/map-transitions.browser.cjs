/* Real-browser regression for map data transitions (M-7):
 *   const r = await require(thisFile)(browser, baseUrl, apiUrl, outDir?)  → { status, checks, failed, metrics }
 * Needs a production build and the local backend (same setup as map-explorer.browser.cjs; Kakao SDK = test stub).
 * Every animation frame records how many marks the canvas drew, so "clusters disappeared while the next view was loading"
 * is measured directly. API latency, response-order inversion and errors are injected with page.route.
 * Checks:
 *   - fast consecutive pans / zoom in-out / grid↔station zoom crossing: no frame without marks while data loads;
 *   - superseded bbox requests are cancelled (or at least ignored) and an older response arriving last never replaces the newer view;
 *   - after things settle, what is drawn equals the server grid for the latest view (M-1 accuracy kept);
 *   - filter change: the previous filter's clusters are never shown as the new filter's result;
 *   - API error: the error is shown and stale clusters are not presented as the current view; retry recovers;
 *   - a slow same-location-stack lookup cannot overwrite a newer station selection.
 */
const fs = require('fs');
const path = require('path');
const KAKAO_STUB = fs.readFileSync(path.join(__dirname, 'fixtures', 'kakao-maps-stub.js'), 'utf8');

module.exports = async function mapTransitionRegressions(browser, BASE = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:10000', OUT = null) {
  const results = [];
  const metrics = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); if (!ok) console.log('FAIL', name, JSON.stringify(detail ?? '')); };
  const api = async (p) => (await fetch(API + p)).json();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/kakaocdn|daumcdn|ERR_FAILED|net::|status of 500/i.test(m.text())) errors.push(m.text()); });
  await page.route(/dapi\.kakao\.com\/v2\/maps\/sdk\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB }));
  await page.route(/kakaocdn\.net|daumcdn\.net/, (r) => r.abort());

  // ---- request bookkeeping + controllable latency / errors for map data requests ----
  const log = []; // { id, url, kind, t0, t1, outcome }
  let seq = 0;
  const ctl = { delays: [], defaultDelay: 0, fail: 0, stackDelay: 0 };
  const isStack = (u) => { const b = new URL(u).searchParams.get('bbox'); if (!b) return false; const [w, , e] = b.split(',').map(Number); return e - w < 0.002; };
  await page.route(/\/api\/locations(\/grid)?\?/, async (route) => {
    const url = route.request().url();
    const entry = { id: ++seq, url, kind: url.includes('/grid?') ? 'grid' : isStack(url) ? 'stack' : 'locations', t0: Date.now(), outcome: 'pending' };
    log.push(entry);
    const delay = entry.kind === 'stack' ? ctl.stackDelay : entry.kind === 'grid' && ctl.delays.length ? ctl.delays.shift() : ctl.defaultDelay;
    try {
      if (entry.kind === 'grid' && ctl.fail > 0) {
        ctl.fail -= 1;
        await sleep(delay);
        await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': BASE, Vary: 'Origin' }, body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '서버 내부 오류가 발생했습니다.', parameter: null } }) });
        if (entry.outcome === 'pending') entry.outcome = 'error500';
      } else {
        const resp = await route.fetch();
        await sleep(delay);
        await route.fulfill({ response: resp });
        if (entry.outcome === 'pending') entry.outcome = 'delivered';
      }
    } catch {
      entry.outcome = 'aborted';
    }
    // 페이지가 이미 요청을 취소했으면 fulfill이 조용히 끝나도 'aborted'로 남깁니다(requestfailed가 먼저 기록).
    entry.t1 = Date.now();
  });
  page.on('requestfailed', (r) => { const e = [...log].reverse().find((x) => x.url === r.url() && x.outcome === 'pending'); if (e && /ABORT|cancel/i.test(r.failure()?.errorText || '')) e.outcome = 'aborted'; });

  // ---- per-frame sampler (canvas mark count + mode) ----
  const startSampler = () => page.evaluate(() => {
    window.__cgSamples = [];
    const tick = () => {
      const c = document.querySelector('.cg-mark-canvas');
      window.__cgSamples.push({ t: performance.now(), n: Number(c?.dataset.markCount ?? -1), mode: document.querySelector('.geo-map')?.dataset.mapMode, z: document.querySelector('.geo-legend-toggle .num')?.textContent });
      window.__cgRaf = requestAnimationFrame(tick);
    };
    window.__cgRaf = requestAnimationFrame(tick);
  });
  const stopSampler = () => page.evaluate(() => { cancelAnimationFrame(window.__cgRaf); return window.__cgSamples; });
  const blankFrames = (samples) => samples.filter((s) => s.n === 0).length;
  const status = () => page.evaluate(() => document.querySelector('.geo-status')?.innerText.replace(/\s+/g, ' ') || '');
  const zoomOf = () => page.evaluate(() => Number(document.querySelector('.geo-legend-toggle .num')?.textContent.replace(/[^0-9.]/g, '')));
  const drawnTotal = () => page.evaluate(() => (document.querySelector('.cg-mark-canvas').cgMarks || []).reduce((n, m) => n + (m.kind === 'cluster' ? m.count : m.kind === 'station' ? 1 : 0), 0));
  const quiet = async (ms = 700) => { for (let i = 0; i < 100 && log.some((e) => e.outcome === 'pending'); i += 1) await sleep(100); await sleep(ms); };
  const mapBox = async () => page.locator('.geo-map').boundingBox();
  async function drag(dx, dy) {
    const b = await mapBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2 + 40;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 4 }); await page.mouse.up();
  }
  // The latest grid view = last grid request the page made; compare drawn numbers with the server for that exact request.
  async function latestMatches(label) {
    const last = [...log].reverse().find((e) => e.kind === 'grid');
    const u = new URL(last.url);
    const g = await api(`/api/locations/grid?${u.searchParams.toString()}`);
    const st = await status();
    const statusNum = Number((st.match(/화면 영역 ([\d,]+)곳 전체 집계/) || [])[1]?.replace(/,/g, ''));
    const drawn = await drawnTotal();
    check(`${label}: status = server matched count for the latest view`, statusNum === g.meta.matched.station_count, [statusNum, g.meta.matched.station_count, st.slice(0, 80)]);
    check(`${label}: drawn cluster counts come from the latest view's grid (≤ grid total, > 0)`, drawn > 0 && drawn <= g.meta.grid.station_count, [drawn, g.meta.grid.station_count]);
    return { last, g };
  }

  // ---- setup: 서울 줌 11 (grid mode) ----
  await page.goto(`${BASE}/regional-explorer?region=11`);
  await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
  await page.getByRole('button', { name: '이 위치 충전소 보기' }).click();
  await page.waitForFunction(() => /전체 집계/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
  await quiet();
  check('setup: zoom 11 grid view with clusters', (await zoomOf()) === 11 && (await drawnTotal()) > 0);

  // 1. fast consecutive pans with slow responses (600ms): clusters stay, superseded requests cancelled, latest wins
  {
    ctl.defaultDelay = 600;
    const before = log.length;
    await startSampler();
    for (const [dx, dy] of [[-120, 0], [-120, 40], [100, -60], [-80, 80], [140, 0], [-60, -60]]) { await drag(dx, dy); await sleep(260); }
    await quiet(900);
    const s = await stopSampler();
    ctl.defaultDelay = 0;
    const reqs = log.slice(before).filter((e) => e.kind === 'grid');
    metrics.fastPan = { frames: s.length, blankFrames: blankFrames(s), gridRequests: reqs.length, aborted: reqs.filter((e) => e.outcome === 'aborted').length, delivered: reqs.filter((e) => e.outcome === 'delivered').length };
    check('fast pans: no frame without clusters while the next view loads', blankFrames(s) === 0, metrics.fastPan);
    check('fast pans: superseded grid requests are cancelled (only the latest is delivered)', metrics.fastPan.delivered === 1 && metrics.fastPan.aborted === reqs.length - 1, metrics.fastPan);
    await latestMatches('fast pans');
  }

  // 2. response-order inversion: older request slow (1800ms), newer fast (100ms) → newer stays after the old one would arrive
  {
    const before = log.length;
    ctl.delays = [1800, 100];
    await drag(-150, 0); await sleep(320);
    await drag(150, 30);
    await sleep(700);
    const mid = await latestMatches('order inversion (newer arrives first)');
    await sleep(1800);
    await quiet(500);
    const after = await latestMatches('order inversion (after the older response time)');
    const reqs = log.slice(before).filter((e) => e.kind === 'grid');
    metrics.inversion = reqs.map((e) => ({ outcome: e.outcome, ms: e.t1 - e.t0 }));
    check('order inversion: the older (slow) request is cancelled or ignored, never shown', mid.last.id === after.last.id && reqs.length === 2, metrics.inversion);
    const st = await status();
    check('order inversion: final status is the newer view', /전체 집계/.test(st) && !/집계 중/.test(st), st);
    ctl.delays = [];
  }

  // 3. zoom in/out quickly (11→14→12) and across grid↔station (15↔16) with 500ms latency: no blank frames
  {
    ctl.defaultDelay = 500;
    await startSampler();
    for (let i = 0; i < 3; i += 1) { await page.locator('.geo-zoom-in').click(); await sleep(120); }
    await sleep(400);
    for (let i = 0; i < 2; i += 1) { await page.locator('.geo-zoom-out').click(); await sleep(120); }
    await quiet(900);
    let s = await stopSampler();
    metrics.zoomGrid = { blankFrames: blankFrames(s), zoom: await zoomOf() };
    check('zoom in/out within 11–15: no frame without clusters', blankFrames(s) === 0, metrics.zoomGrid);
    await latestMatches('zoom in/out');
    // 12 → 16 (grid → individual stations) and back to 15
    await startSampler();
    for (let i = 0; i < 4; i += 1) { await page.locator('.geo-zoom-in').click(); await sleep(150); }
    await quiet(900);
    const z16 = await zoomOf();
    const st16 = await status();
    await page.locator('.geo-zoom-out').click();
    await quiet(900);
    s = await stopSampler();
    ctl.defaultDelay = 0;
    metrics.zoomCross = { blankFrames: blankFrames(s), z16, st16: st16.slice(0, 60), zEnd: await zoomOf() };
    check('grid ↔ station zoom crossing (12→16→15): no frame without marks', blankFrames(s) === 0 && z16 === 16 && /개별 충전소/.test(st16), metrics.zoomCross);
    await latestMatches('back to zoom 15');
  }

  // 4. filter change: previous filter's clusters are never presented as the new filter's result
  {
    // 지역 필터를 풀고(지도는 사용자가 움직였으므로 그대로) 줌 11로 돌아가 유형 필터를 바꿉니다
    await page.locator('.filterbar select').first().selectOption('');
    await quiet();
    for (let i = 0; i < 4; i += 1) { await page.locator('.geo-zoom-out').click(); await sleep(200); }
    await quiet();
    ctl.defaultDelay = 900;
    const beforeKeys = await page.evaluate(() => (document.querySelector('.cg-mark-canvas').cgMarks || []).map((m) => m.key).join('|'));
    await page.locator('.filterbar select').nth(1).selectOption('04');
    await sleep(350);
    const during = await page.evaluate(() => ({ keys: (document.querySelector('.cg-mark-canvas').cgMarks || []).map((m) => m.key).join('|'), n: Number(document.querySelector('.cg-mark-canvas').dataset.markCount), st: document.querySelector('.geo-status')?.innerText.replace(/\s+/g, ' ') }));
    await quiet(900);
    ctl.defaultDelay = 0;
    check('filter change: old-filter clusters are not shown while the new filter loads', during.keys !== beforeKeys && (during.n === 0 || !beforeKeys.includes(during.keys)) && /집계 중|불러오는 중/.test(during.st), { n: during.n, st: during.st });
    const { last } = await latestMatches('filter change (type 04)');
    check('filter change: latest grid request carries the new filter', /charger_type=04/.test(last.url), last.url);
    await page.locator('.filterbar select').nth(1).selectOption('');
    await quiet();
  }

  // 5. API error on the next view: error shown, stale clusters not presented as current; retry recovers
  {
    ctl.fail = 2; // 앱은 5xx를 한 번 자동 재시도하므로 두 번 연속 실패시킵니다
    await drag(-130, 20);
    await page.waitForFunction(() => /다시 요청/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
    await sleep(300);
    const st = await status();
    const n = await page.evaluate(() => Number(document.querySelector('.cg-mark-canvas').dataset.markCount));
    check('API error: error message + retry shown for the current view', /불러오지 못했습니다/.test(st) && /다시 요청/.test(st), st.slice(0, 90));
    check('API error: previous view clusters are not presented as the current result', n === 0, n);
    await page.locator('.geo-status button', { hasText: '다시 요청' }).click();
    await quiet();
    await latestMatches('after retry');
  }

  // 6. slow same-location stack lookup must not overwrite a newer selection (map click, then list "지도에서 보기")
  {
    const findStack = () => page.evaluate(() => { const c = document.querySelector('.cg-mark-canvas'); const r = c.getBoundingClientRect(); const m = (c.cgMarks || []).find((k) => k.kind === 'cluster' && k.stack && k.x > 80 && k.y > 120 && k.x < r.width - 80 && k.y < r.height - 80); return m && { x: m.x + r.left, y: m.y + r.top, n: m.count }; });
    const findStation = async () => {
      for (let i = 0; i < 30; i += 1) {
        const p = await page.evaluate(() => { const c = document.querySelector('.cg-mark-canvas'); const r = c.getBoundingClientRect(); const hit = (k) => { const el = document.elementFromPoint(k.x + r.left, k.y + r.top); return el && (el === c || el.closest('.geo-kakao')) && !el.closest('.geo-legend, .geo-topbar, .geo-status, .geo-zoom'); }; const m = (c.cgMarks || []).find((k) => k.kind === 'station' && k.x > 12 && k.y > 12 && k.x < r.width - 12 && k.y < r.height - 12 && hit(k)); return m && { x: m.x + r.left, y: m.y + r.top, id: m.row.station_id, name: m.row.station_name }; });
        if (p) return p;
        await sleep(100);
      }
      return null;
    };
    const panel = () => page.evaluate(() => ({ name: document.querySelector('.geo-station-name')?.innerText ?? null, group: document.querySelectorAll('.geo-group-item').length }));
    const toGrid = async () => { for (let i = 0; i < 4 && (await zoomOf()) > 13; i += 1) { await page.locator('.geo-zoom-out').click(); await quiet(300); } };
    const stackAt = async () => { let st = await findStack(); for (let i = 0; i < 4 && !st; i += 1) { await page.locator('.geo-zoom-in').click(); await quiet(); st = await findStack(); } return st; };

    // 6a. stack click → (lookup pending) → zoom out → click another station
    let stack = await stackAt();
    if (!stack) check('stack race: found a same-location stack to test', false, 'none in view');
    else {
      ctl.stackDelay = 6000;
      await page.mouse.click(stack.x, stack.y);
      await sleep(400);
      await page.locator('.geo-zoom-out').click();
      await sleep(500);
      const pick = await findStation();
      const pending = log.filter((e) => e.kind === 'stack' && e.outcome === 'pending').length;
      check('stack race (map): the stack lookup is still in flight when a newer station is clicked', pending === 1 && !!pick, { pending, pick: pick?.name });
      if (pick) {
        await page.mouse.click(pick.x, pick.y);
        await sleep(6200); // the slow lookup would have arrived by now
        const p = await panel();
        const lk = [...log].reverse().find((e) => e.kind === 'stack');
        check('stack race (map): the newer station selection is kept (lookup cancelled/ignored)', p.name === pick.name && p.group === 0, { p, pick: pick.name, lookup: lk?.outcome });
      }
      ctl.stackDelay = 0;
    }
    // 6c. (no delay) a grid same-location stack lists exactly its stations (bounds are rounded to 7 decimals in the grid response)
    await toGrid(); await quiet();
    {
      const st = await stackAt();
      if (st) {
        await page.mouse.click(st.x, st.y);
        await page.locator('.geo-group-item').first().waitFor({ timeout: 8000 }).catch(() => {});
        await quiet(300);
        const p = await panel();
        check('grid stack click lists exactly the stack\'s stations in the panel', p.group === st.n, { group: p.group, n: st.n });
      }
    }
    // 6b. stack click → (lookup pending) → station list "지도에서 보기"
    await toGrid(); await quiet();
    stack = await stackAt();
    if (stack) {
      ctl.stackDelay = 6000;
      await page.mouse.click(stack.x, stack.y);
      await sleep(400);
      const card = page.locator('section.card', { has: page.locator('.card-title', { hasText: '충전소 목록' }) });
      const row = card.locator('tbody tr').first();
      const listName = (await row.locator('td').nth(1).innerText()).trim();
      await row.getByRole('button', { name: /지도/ }).click();
      await sleep(6200);
      const p = await panel();
      check('stack race (list): "지도에서 보기" selection is kept after the slow lookup time', p.name === listName && p.group === 0, { p, listName });
      ctl.stackDelay = 0;
    }
  }

  check('no page/console errors', errors.length === 0, errors.slice(0, 3));
  if (OUT) await page.locator('.geo-map').screenshot({ path: `${OUT}/m7_final.png` });
  await ctx.close();
  const failed = results.filter((r) => !r.ok);
  return { status: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed, metrics };
};
