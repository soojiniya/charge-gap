/* Reusable real-browser regression: await require(thisFile)(playwrightPage, baseUrl).
 * Requires a running production build (vite preview) and backend. Errors returned by the running API
 * (JSON 500/400) stay per-card errors with their code and retry button; they never start the server
 * wake-up wait. (Connection failures and the Render waking page are covered by server-wake.browser.cjs.)
 */
module.exports = async function apiErrorRegressions(page, baseUrl = 'http://127.0.0.1:15173') {
  const checks = [];
  const check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  const isApi = (url) => /\/api\//.test(new URL(url).pathname);
  const cors = { 'Access-Control-Allow-Origin': new URL(baseUrl).origin };
  await page.setViewportSize({ width: 1440, height: 1000 });

  let growthCalls = 0;
  let failGrowth = true;
  await page.route(isApi, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/growth') {
      growthCalls += 1;
      if (failGrowth) {
        return route.fulfill({ status: 500, contentType: 'application/json', headers: cors,
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.', parameter: null }, meta: { api_version: '1.0' } }) });
      }
    }
    return route.continue();
  });
  await page.goto(`${baseUrl}/growth-trends`);
  const alert = page.locator('.state.error').first();
  await alert.waitFor({ timeout: 60000 });
  const text = await alert.innerText();
  check('a JSON 500 from the API shows a card error with its code', text.includes('데이터를 불러오지 못했습니다') && text.includes('500 INTERNAL_ERROR'));
  check('a JSON 500 is retried automatically once', growthCalls === 2);
  check('API errors do not show the server wake notice', await page.locator('[data-server-wake]').count() === 0);
  check('sidebar still reports the API as connected', (await page.locator('.sidebar-foot strong').innerText()) === 'API 연결됨');

  failGrowth = false;
  await alert.getByRole('button', { name: /다시 요청/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.state.error').length === 0, null, { timeout: 30000 });
  check('card retry recovers after the API error is fixed', true);

  await page.unroute(isApi);
  let typeCalls = 0;
  await page.route(isApi, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/charger-types') {
      typeCalls += 1;
      return route.fulfill({ status: 400, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ error: { code: 'INVALID_PARAMETER', message: '허용된 값을 확인하세요.', parameter: 'charger_type' }, meta: {} }) });
    }
    return route.continue();
  });
  await page.goto(`${baseUrl}/charging-infrastructure`);
  await page.locator('.state.error').first().waitFor({ timeout: 60000 });
  const bad = await page.locator('.state.error').first().innerText();
  check('a JSON 400 shows the request-parameter error with code and parameter', bad.includes('요청변수가 허용되지 않습니다') && bad.includes('400 INVALID_PARAMETER (charger_type)'));
  check('a JSON 400 is not retried', typeCalls === 1);
  check('no wake notice for a 400', await page.locator('[data-server-wake]').count() === 0);
  await page.unroute(isApi);
  return { status: 'PASS', checks: checks.length, details: checks };
};
