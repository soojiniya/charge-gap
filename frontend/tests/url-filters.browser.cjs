/* Reusable real-browser regression: await require(thisFile)(playwrightPage, baseUrl).
 * Requires a running local frontend/backend. Invalid URL filters are dropped; valid deep links and Back keep working.
 */
module.exports = async function urlFilterRegressions(page, baseUrl = 'http://127.0.0.1:15173') {
  const checks = [];
  const check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  const regionSelect = () => page.locator('label.field', { hasText: '충전기 지역' }).locator('select');
  const typeSelect = () => page.locator('label.field', { hasText: '충전기 유형' }).locator('select');
  const settled = async () => {
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.querySelector('.skeleton-chart'), null, { timeout: 120000 });
  };
  const alerts = () => page.locator('[role=alert]').count();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${baseUrl}/?region=99&type=02&deletion=bogus&ev_region=29`);
  await page.waitForURL((u) => !u.searchParams.has('region'));
  await settled();
  const url = new URL(page.url());
  check('invalid region/deletion/EV region are removed from the URL', url.search === '?type=02');
  check('valid filter in the same link is kept', (await typeSelect().inputValue()) === '02');
  check('invalid region shows 전국', (await regionSelect().inputValue()) === '');
  check('no error cards for an invalid shared link', (await alerts()) === 0);

  await page.goto(`${baseUrl}/growth-trends`);
  await page.goto(`${baseUrl}/?region=99`);
  await page.waitForURL((u) => !u.searchParams.has('region'));
  await page.goBack();
  check('URL clean-up replaces the entry, so Back returns to the previous page', new URL(page.url()).pathname === '/growth-trends');

  await page.goto(`${baseUrl}/charging-infrastructure?region=26&operator=PI&deletion=not_deleted`);
  await settled();
  const kept = new URL(page.url()).searchParams;
  check('valid deep link (with operator) stays unchanged', kept.get('region') === '26' && kept.get('operator') === 'PI' && kept.get('deletion') === 'not_deleted');
  check('valid deep link selects 26', (await regionSelect().inputValue()) === '26');
  check('valid deep link has no error cards', (await alerts()) === 0);

  await page.goto(`${baseUrl}/?operator=ZZ&region=41`);
  await page.waitForURL((u) => !u.searchParams.has('operator'), { timeout: 60000 });
  await settled();
  await page.waitForFunction(() => document.querySelectorAll('[role=alert]').length === 0, null, { timeout: 60000 });
  check('unknown operator is dropped once the operator list is known; region kept', new URL(page.url()).searchParams.get('region') === '41');

  await page.goto(`${baseUrl}/`);
  await settled();
  await regionSelect().selectOption('41');
  await page.getByRole('navigation').getByRole('link', { name: /EV Registration/ }).click();
  await page.locator('h1', { hasText: 'EV Registration' }).waitFor();
  await page.goBack();
  await page.locator('h1', { hasText: 'Overview' }).waitFor();
  check('Back after navigation restores the filtered page', new URL(page.url()).searchParams.get('region') === '41');
  await settled();
  check('Back shows the restored filter in the select', (await regionSelect().inputValue()) === '41');
  return { status: 'PASS', checks: checks.length, details: checks };
};
