/* Real-browser regression for the Render free-plan wake-up, with REAL timings (about 3.5 minutes; scenarios run
 * in parallel). usage: await require(thisFile)(browser, baseUrl, apiOrigin)
 * Needs a running production build (vite preview) and backend. The sleeping server is simulated per browser
 * context with route(): until `readyAt` every API request fails like a sleeping Render service
 * (connection refused, or a waking HTML page without CORS headers); afterwards requests reach the real backend.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sleepingServer(context, apiOrigin, { readyAt, mode = 'refused', override }) {
  const t0 = Date.now();
  const log = { probes: [], api: [], t0, readyAt };
  await context.route((url) => url.origin === apiOrigin && url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const isProbe = url.pathname === '/api/charts' && url.searchParams.get('chart_id') === '1';
    const t = Date.now() - t0;
    (isProbe ? log.probes : log.api).push({ t, path: url.pathname + url.search });
    if (t < log.readyAt) {
      if (mode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p>Service waking up</p>' });
      return route.abort('connectionrefused');
    }
    if (override) { const r = override(url); if (r) return route.fulfill(r); }
    return route.continue();
  });
  return log;
}

async function pageState(page) {
  return page.evaluate(() => ({
    notice: document.querySelector('[data-server-wake]')?.getAttribute('data-server-wake') ?? null,
    noticeText: document.querySelector('[data-server-wake]')?.textContent ?? '',
    redAlerts: [...document.querySelectorAll('.state.error')].length,
    alertRoles: [...document.querySelectorAll('[role=alert]')].map((e) => (e.getAttribute('data-server-wake') ? 'notice' : 'card')),
    neutralWake: [...document.querySelectorAll('.state[role=status]')].filter((e) => e.textContent.includes('아직 응답하지 않습니다')).length,
    skeletons: document.querySelectorAll('.skeleton-chart').length,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    sidebar: document.querySelector('.sidebar-foot strong')?.textContent ?? '',
  }));
}

async function settled(page, timeout = 60000) {
  await page.waitForFunction(() => !document.querySelector('.skeleton-chart') && !document.querySelector('[data-server-wake]'), null, { timeout });
  await page.waitForLoadState('networkidle');
}

async function kpis(page) {
  await page.waitForTimeout(2500);  // let the KPI count-up animation finish
  return page.$$eval('.kpi .kpi-value', (els) => els.map((e) => { const t = e.textContent.replace(/[대기곳]/g, '').trim(); return Number(t.slice(0, t.length / 2).replace(/,/g, '')); }));
}

module.exports = async function serverWakeRegressions(browser, baseUrl, apiOrigin, only = null) {
  const results = {};
  const fetchJson = async (p) => (await fetch(apiOrigin + p)).json();
  const scenario = async (name, viewport, fn) => {
    if (only && !only.includes(name)) return;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    const checks = [];
    const check = (label, ok, detail = '') => { checks.push({ label, ok: !!ok, detail }); };
    try { await fn({ context, page, check }); } catch (e) { check('scenario completed', false, String(e).slice(0, 300)); }
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    results[name] = { pass: checks.every((c) => c.ok), checks };
    await context.close();
  };

  await Promise.all([
    scenario('immediate', { width: 1440, height: 900 }, async ({ context, page, check }) => {
      const log = await sleepingServer(context, apiOrigin, { readyAt: 0 });
      let sawNotice = false;
      page.on('framenavigated', () => {});
      await page.goto(baseUrl + '/');
      const stop = Date.now() + 8000;
      while (Date.now() < stop) { if ((await pageState(page)).notice) sawNotice = true; await sleep(100); }
      await settled(page);
      check('no wake notice when the server answers at once', !sawNotice);
      check('no readiness checks sent', log.probes.length === 0, `probes=${log.probes.length}`);
      const ov = await fetchJson('/api/overview');
      check('KPIs equal API', JSON.stringify((await kpis(page)).slice(1)) === JSON.stringify([ov.data.chargers.charger_count, ov.data.chargers.station_count, ov.data.chargers.deleted_charger_count]));
    }),

    scenario('ready-30s', { width: 1440, height: 900 }, async ({ context, page, check }) => {
      const log = await sleepingServer(context, apiOrigin, { readyAt: 30000 });
      await page.goto(baseUrl + '/?region=41');
      await page.locator('[data-server-wake=waking]').waitFor({ timeout: 15000 });
      let worst = { redAlerts: 0, cardAlerts: 0, minSkeletons: 99 };
      while (Date.now() - log.t0 < 29000) {
        const s = await pageState(page);
        worst = { redAlerts: Math.max(worst.redAlerts, s.redAlerts), cardAlerts: Math.max(worst.cardAlerts, s.alertRoles.filter((r) => r === 'card').length), minSkeletons: Math.min(worst.minSkeletons, s.skeletons) };
        await sleep(500);
      }
      const during = await pageState(page);
      check('single waking notice with elapsed time, sidebar says 서버 준비 중', during.notice === 'waking' && /경과 0:2\d/.test(during.noticeText) && during.sidebar === '서버 준비 중', `${during.noticeText.slice(-12)} / ${during.sidebar}`);
      check('no per-card error cards while waking', worst.redAlerts === 0 && worst.cardAlerts === 0, JSON.stringify(worst));
      check('cards keep their loading skeletons while waking', worst.minSkeletons > 0);
      const attemptsWhileDown = log.api.filter((a) => a.t < 30000).length;
      check('each query tried once, then waited (no repeated API requests)', attemptsWhileDown <= 12, `api attempts while down=${attemptsWhileDown}`);
      check('readiness checks on the 2·4·8·10 s schedule', log.probes.filter((p) => p.t < 30000).length >= 4 && log.probes.filter((p) => p.t < 30000).length <= 6, `probes=${log.probes.map((p) => Math.round(p.t / 1000)).join(',')}`);
      await settled(page, 30000);
      const readyAfter = (Date.now() - log.t0) / 1000;
      check('data appears within ~12 s after the server is ready', readyAfter < 45, `${readyAfter.toFixed(1)} s`);
      const ov = await fetchJson('/api/overview?region_code=41');
      const k30 = await kpis(page);
      check('filter kept and KPIs equal API (region 41)', new URL(page.url()).searchParams.get('region') === '41'
        && k30[1] === ov.data.chargers.charger_count && k30[2] === ov.data.chargers.station_count, String(k30));
      const after = await pageState(page);
      check('notice gone, no errors, sidebar API 연결됨', !after.notice && after.redAlerts === 0 && after.sidebar === 'API 연결됨', JSON.stringify(after));
    }),

    scenario('ready-90s-navigate-and-filter', { width: 1024, height: 900 }, async ({ context, page, check }) => {
      const log = await sleepingServer(context, apiOrigin, { readyAt: 90000, mode: 'html' });
      await page.goto(baseUrl + '/regional-explorer?region=11');
      await page.locator('[data-server-wake=waking]').waitFor({ timeout: 15000 });
      await sleep(15000);
      const nav = page.getByRole('navigation');
      await nav.getByRole('link', { name: /Charging Infrastructure/ }).click();
      await sleep(10000);
      await nav.getByRole('link', { name: /Overview/ }).click();
      await page.locator('h1', { hasText: 'Overview' }).waitFor();
      for (const label of ['삭제 표시', '전체', '비삭제 표시', '삭제 표시', '비삭제 표시']) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await sleep(150);
      }
      const mid = await pageState(page);
      check('still one waking notice after navigation and filter changes', mid.notice === 'waking' && mid.redAlerts === 0 && mid.alertRoles.length === 0, JSON.stringify(mid));
      const apiBeforeReady = log.api.filter((a) => a.t < 90000);
      check('no API requests sent while waking except first attempts of the first page', apiBeforeReady.every((a) => a.t < 8000), apiBeforeReady.map((a) => `${Math.round(a.t / 1000)}s ${a.path}`).slice(-4).join(' | '));
      await settled(page, 110000);
      const url = new URL(page.url());
      check('filters kept through the wait', url.pathname === '/' && url.searchParams.get('region') === '11' && url.searchParams.get('deletion') === 'not_deleted', url.search);
      const ov = await fetchJson('/api/overview?region_code=11&deletion=not_deleted');
      const k = await kpis(page);
      check('final screen shows the last filter (no stale responses)', k[1] === ov.data.chargers.charger_count && k[2] === ov.data.chargers.station_count, `${k} vs ${ov.data.chargers.charger_count}/${ov.data.chargers.station_count}`);
      check('no stale filter requests reached the server after ready', !log.api.some((a) => a.t >= 90000 && /deletion=deleted/.test(a.path)), log.api.filter((a) => a.t >= 90000).map((a) => a.path).join(' '));
      const s = await pageState(page);
      check('no error cards after ready', s.redAlerts === 0 && s.alertRoles.length === 0, JSON.stringify(s));
    }),

    scenario('ready-150s-mobile', { width: 390, height: 844 }, async ({ context, page, check }) => {
      const log = await sleepingServer(context, apiOrigin, { readyAt: 150000 });
      await page.goto(baseUrl + '/charging-infrastructure');
      await page.locator('[data-server-wake=waking]').waitFor({ timeout: 15000 });
      const s = await pageState(page);
      const box = await page.locator('[data-server-wake]').boundingBox();
      check('mobile: notice fits the screen, no horizontal overflow', box && box.x >= 0 && box.x + box.width <= 391 && !s.overflow, JSON.stringify(box));
      await page.getByRole('button', { name: '메뉴 열기' }).click();
      check('mobile: sidebar shows 서버 준비 중', (await page.locator('.sidebar-foot strong').innerText()) === '서버 준비 중');
      await page.keyboard.press('Escape');
      await page.mouse.click(380, 400).catch(() => {});
      await page.waitForFunction(() => document.querySelector('[data-server-wake]') === null, null, { timeout: 175000 });
      await settled(page, 40000);
      const t = (Date.now() - log.t0) / 1000;
      check('loads after ~150 s without user action', t >= 150 && t < 175, `${t.toFixed(1)} s`);
      check('probes stayed on schedule (~17 in 150 s)', log.probes.length >= 15 && log.probes.length <= 19, `probes=${log.probes.length}`);
      const after = await pageState(page);
      check('no error cards after ready', after.redAlerts === 0 && after.alertRoles.length === 0);
    }),

    scenario('never-ready-then-manual-retry', { width: 1440, height: 900 }, async ({ context, page, check }) => {
      const log = await sleepingServer(context, apiOrigin, { readyAt: Infinity });
      await page.goto(baseUrl + '/growth-trends');
      await page.locator('[data-server-wake=waking]').waitFor({ timeout: 15000 });
      await page.locator('[data-server-wake=unavailable]').waitFor({ timeout: 200000 });
      const t = (Date.now() - log.t0) / 1000;
      const s = await pageState(page);
      check('gives up after ~3 minutes', t >= 178 && t < 195, `${t.toFixed(1)} s`);
      check('one warning notice with 다시 시도; cards neutral, not red', s.notice === 'unavailable' && s.alertRoles.filter((r) => r === 'card').length === 0 && s.redAlerts === 0 && s.neutralWake >= 1, JSON.stringify(s));
      check('about 20 readiness checks in 3 minutes, then polling stops', log.probes.length >= 17 && log.probes.length <= 22, `probes=${log.probes.length}`);
      const probes = log.probes.length;
      await sleep(12000);
      check('no background checks after giving up', log.probes.length === probes);
      log.readyAt = 0;                                  // server is up now
      await page.locator('[data-server-wake]').getByRole('button', { name: /다시 시도/ }).click();
      await settled(page, 30000);
      const after = await pageState(page);
      check('manual retry loads every card', after.redAlerts === 0 && after.neutralWake === 0 && after.alertRoles.length === 0, JSON.stringify(after));
    }),

    scenario('api-errors-are-not-wake', { width: 1440, height: 900 }, async ({ context, page, check }) => {
      const log = await sleepingServer(context, apiOrigin, {
        readyAt: 0,
        override: (url) => url.pathname === '/api/charger-types'
          ? { status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': new URL(baseUrl).origin }, body: JSON.stringify({ error: { code: 'INVALID_PARAMETER', message: '허용된 값을 확인하세요.', parameter: 'charger_type' }, meta: {} }) }
          : null,
      });
      await page.goto(baseUrl + '/charging-infrastructure');
      await page.waitForFunction(() => document.querySelectorAll('.state.error').length > 0, null, { timeout: 30000 });
      await page.waitForLoadState('networkidle');
      const s = await pageState(page);
      const card = await page.locator('.state.error').first().innerText();
      check('a JSON 400 shows the normal card error with its code, not the wake notice', !s.notice && /요청변수가 허용되지 않습니다/.test(card) && /400 INVALID_PARAMETER/.test(card), card.replace(/\s+/g, ' '));
      check('no readiness checks for API errors', log.probes.length === 0);
    }),
  ]);
  return results;
};
