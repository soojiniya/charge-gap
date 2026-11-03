/* Reusable real-browser regression for React Router direct URL access:
 *   const r = await require(thisFile)(page, baseUrl, apiUrl)  → { status, checks, details }
 * Needs a production build served the way the deployment serves it (e.g. Render static rewrites or the
 * Compose Nginx) and a running backend at apiUrl. For each page: direct URL entry, refresh, sidebar menu
 * navigation, browser back; every script/stylesheet/font/icon loads with its real type, API calls reach the API
 * and return JSON, and nothing is answered with index.html except the page documents themselves.
 */
const PAGES = [
  { path: '/', title: 'Overview' },
  { path: '/ev-registration', title: 'EV Registration' },
  { path: '/charging-infrastructure', title: 'Charging Infrastructure' },
  { path: '/regional-explorer', title: 'Regional Explorer' },
  { path: '/growth-trends', title: 'Growth Trends' },
];

module.exports = async function directUrlRegressions(page, baseUrl = 'http://127.0.0.1:4173', apiUrl = 'http://127.0.0.1:10000') {
  const checks = [];
  const check = (name, value, detail) => {
    if (!value) throw new Error(`${name}${detail ? ` ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
    checks.push(name);
  };
  const base = new URL(baseUrl).origin;
  const api = new URL(apiUrl).origin;
  const isTile = (u) => /tile\.openstreetmap\.org/.test(u);
  await page.route(isTile, (r) => r.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });

  let log = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (res) => {
    const req = res.request();
    if (isTile(req.url())) return;
    log.push({ url: req.url(), type: req.resourceType(), status: res.status(), ctype: (res.headers()['content-type'] || '').split(';')[0] });
  });
  page.on('requestfailed', (req) => { if (!isTile(req.url())) log.push({ url: req.url(), type: req.resourceType(), status: 0, ctype: '', failed: req.failure()?.errorText }); });

  const EXPECT_TYPE = { script: /javascript/, stylesheet: /css/, font: /font|woff/, image: /svg|png|image/ };
  const heading = (title) => page.locator('h1', { hasText: title });
  async function verifyLoad(label, p, docStatus) {
    await heading(p.title).waitFor({ timeout: 60000 });
    await page.waitForLoadState('networkidle');
    const doc = log.filter((e) => e.type === 'document');
    check(`${label} ${p.path}: document 200 text/html`, doc.length === 1 && doc[0].status === 200 && doc[0].ctype === 'text/html', doc);
    if (docStatus) docStatus.push(doc[0]?.status);
    const assets = log.filter((e) => e.url.startsWith(base) && e.type !== 'document');
    const badAssets = assets.filter((e) => e.status !== 200 || e.ctype === 'text/html' || (EXPECT_TYPE[e.type] && !EXPECT_TYPE[e.type].test(e.ctype)));
    check(`${label} ${p.path}: static assets 200 with real content types (never index.html)`, assets.length > 0 && badAssets.length === 0, badAssets);
    const apiCalls = log.filter((e) => e.url.startsWith(api) && /\/api\//.test(e.url));
    // Data endpoints answer JSON; the report PNG endpoint (/api/charts/<id>/image) answers an image.
    const badApi = apiCalls.filter((e) => e.status !== 200 || e.ctype !== (/\/image(\?|$)/.test(e.url) ? 'image/png' : 'application/json'));
    check(`${label} ${p.path}: API calls go to the API origin and return JSON`, apiCalls.length > 0 && badApi.length === 0, { n: apiCalls.length, badApi });
    check(`${label} ${p.path}: no failed requests`, !log.some((e) => e.failed), log.filter((e) => e.failed));
    check(`${label} ${p.path}: URL kept`, new URL(page.url()).pathname === p.path, page.url());
    check(`${label} ${p.path}: active menu item`, (await page.locator('.nav-item.active').innerText()).includes(p.title));
    check(`${label} ${p.path}: not the not-found page`, (await page.locator('text=찾는 페이지가 없습니다').count()) === 0);
  }

  for (const p of PAGES) {
    log = [];
    await page.goto(`${baseUrl}${p.path}`);
    await verifyLoad('direct URL', p);
    log = [];
    await page.reload();
    await verifyLoad('refresh', p);
  }

  // Query strings survive direct entry (shared filters live in the URL).
  log = [];
  await page.goto(`${baseUrl}/regional-explorer?region=11&deletion=not_deleted`);
  await verifyLoad('direct URL with query', PAGES[3]);
  check('direct URL with query keeps the filters', new URL(page.url()).search === '?region=11&deletion=not_deleted');
  await page.locator('label.field', { hasText: '충전기 지역' }).locator('select').locator('option[value="11"]').waitFor({ state: 'attached' });
  check('direct URL with query applies the region filter', (await page.locator('label.field', { hasText: '충전기 지역' }).locator('select').inputValue()) === '11');

  // Menu navigation through all pages from a fresh start, then back through history.
  await page.goto(`${baseUrl}/`);
  await heading('Overview').waitFor({ timeout: 60000 });
  const visited = [PAGES[0]];
  for (const p of PAGES.slice(1)) {
    log = [];
    await page.getByRole('navigation').getByRole('link', { name: new RegExp(p.title) }).click();
    await heading(p.title).waitFor({ timeout: 60000 });
    await page.waitForLoadState('networkidle');
    check(`menu → ${p.path}: client-side navigation (no document request)`, !log.some((e) => e.type === 'document'));
    check(`menu → ${p.path}: URL`, new URL(page.url()).pathname === p.path);
    visited.push(p);
  }
  for (let i = visited.length - 2; i >= 0; i -= 1) {
    await page.goBack();
    await heading(visited[i].title).waitFor({ timeout: 60000 });
    check(`back → ${visited[i].path}`, new URL(page.url()).pathname === visited[i].path);
  }
  // Refresh after history navigation, then forward.
  log = [];
  await page.reload();
  await verifyLoad('refresh after back', PAGES[0]);
  await page.goForward();
  await heading(PAGES[1].title).waitFor({ timeout: 60000 });
  check('forward after refresh', new URL(page.url()).pathname === PAGES[1].path);

  check('no page errors', pageErrors.length === 0, pageErrors);
  await page.unroute(isTile);
  return { status: 'PASS', checks: checks.length, details: checks };
};
