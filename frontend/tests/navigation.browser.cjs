/* Reusable real-browser regression: await require(thisFile)(playwrightPage, baseUrl).
 * Requires a running local frontend/backend. Checks that sidebar navigation keeps shared filters.
 */
module.exports = async function navigationRegressions(page, baseUrl = 'http://127.0.0.1:15173') {
  const checks = [];
  const check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  const expected = { region: '41', deletion: 'not_deleted', ev_region: '11' };
  const same = () => { const p = new URL(page.url()).searchParams; return Object.entries(expected).every(([k, v]) => p.get(k) === v); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/?region=41&deletion=not_deleted&ev_region=11`, { waitUntil: 'networkidle' });
  const go = async (name) => {
    await page.getByRole('navigation').getByRole('link', { name: new RegExp(name) }).click();
    // The page heading changes only after the lazily loaded page has rendered.
    await page.locator('h1', { hasText: name }).waitFor();
    await page.waitForLoadState('networkidle');
  };
  for (const name of ['EV Registration', 'Charging Infrastructure', 'Regional Explorer', 'Growth Trends', 'Overview']) {
    await go(name);
    check(`${name}: URL keeps shared filters`, same());
    const charger = page.locator('label.field', { hasText: '충전기 지역' }).locator('select');
    if (await charger.count()) {
      await charger.locator('option[value="41"]').waitFor({ state: 'attached' });
      check(`${name}: charger region select shows 41`, (await charger.inputValue()) === '41');
    }
    const ev = page.locator('label.field', { hasText: '2026-09 기준 16개' }).locator('select');
    if (await ev.count()) {
      await ev.locator('option[value="11"]').waitFor({ state: 'attached' });
      check(`${name}: EV region select shows 11`, (await ev.inputValue()) === '11');
    }
  }
  // Active nav item still follows the pathname, not the query string.
  check('active nav item matches current page', (await page.locator('.nav-item.active').innerText()).includes('Overview'));
  // Filter changed on one page is carried to the next.
  await go('Charging Infrastructure');
  await page.locator('label.field', { hasText: '충전기 지역' }).locator('select').selectOption('26');
  await go('Regional Explorer');
  check('filter changed on a page carries to the next page', new URL(page.url()).searchParams.get('region') === '26');
  // Reset then navigate: no stale query comes back.
  await page.getByRole('button', { name: /필터 초기화/ }).click();
  await go('Growth Trends');
  const left = new URL(page.url()).searchParams;
  check('reset filters stay cleared after navigation', !left.has('region') && !left.has('deletion'));
  // Mobile: sidebar opens from the menu button and the link still keeps filters.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/growth-trends?region=11`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await go('EV Registration');
  check('mobile sidebar link keeps filters', new URL(page.url()).pathname === '/ev-registration' && new URL(page.url()).searchParams.get('region') === '11');
  return { status: 'PASS', checks: checks.length, details: checks };
};
