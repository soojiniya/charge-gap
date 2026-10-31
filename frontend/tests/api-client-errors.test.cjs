/* Regression: public builds show a visitor-friendly connection message (no run.py), Render spin-up HTML
 * is treated as a transient "server not ready" error, and real API errors keep their code/parameter.
 * Single-attempt behaviour is tested on fetchApi; apiGet's wake-up waiting is in server-wake.test.cjs. */
const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('./ts-loader.cjs');

const PROD = { DEV: false, PROD: true, MODE: 'production', VITE_API_BASE_URL: 'https://api.example.com' };
const DEV = { DEV: true, PROD: false, MODE: 'development' };

function withFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return Promise.resolve().then(fn).finally(() => { global.fetch = original; });
}
const htmlResponse = (status) => new Response('<!doctype html><title>Service waking up</title>', { status, headers: { 'Content-Type': 'text/html' } });
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('production: connection failure shows a friendly message without run.py or the API address', async () => {
  const { fetchApi: apiGet, isTransientApiError, isWakeError } = loader({}, PROD)('src/api/client.ts');
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    const error = await apiGet('/api/overview').then(() => null, (e) => e);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.isNetwork, true);
    assert.doesNotMatch(error.message, /run\.py|backend 폴더|api\.example\.com/);
    assert.match(error.message, /잠시 후/);
    assert.equal(isTransientApiError(error), true);
    assert.equal(isWakeError(error), true);
  });
});

test('development: connection failure keeps the local run.py guidance', async () => {
  const { fetchApi: apiGet } = loader({}, DEV)('src/api/client.ts');
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    const error = await apiGet('/api/overview').then(() => null, (e) => e);
    assert.match(error.message, /run\.py/);
  });
});

test('non-JSON responses (spin-up page, proxy error page) are transient SERVER_UNAVAILABLE errors', async () => {
  const { fetchApi: apiGet, isTransientApiError, isWakeError } = loader({}, PROD)('src/api/client.ts');
  for (const status of [200, 502, 503]) {
    await withFetch(async () => htmlResponse(status), async () => {
      const error = await apiGet('/api/overview').then(() => null, (e) => e);
      assert.equal(error.code, 'SERVER_UNAVAILABLE', String(status));
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /run\.py/);
      assert.equal(isTransientApiError(error), true);
      assert.equal(isWakeError(error), true);
    });
  }
});

test('JSON API errors and successes are unchanged', async () => {
  const { apiGet, isTransientApiError, isWakeError } = loader({}, PROD)('src/api/client.ts');
  await withFetch(async () => jsonResponse(400, { error: { code: 'INVALID_PARAMETER', message: '허용된 값', parameter: 'region_code' }, meta: {} }), async () => {
    const error = await apiGet('/api/overview', { region_code: '99' }).then(() => null, (e) => e);
    assert.deepEqual([error.status, error.code, error.parameter], [400, 'INVALID_PARAMETER', 'region_code']);
    assert.equal(isTransientApiError(error), false);
    assert.equal(isWakeError(error), false);
  });
  await withFetch(async () => jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'x', parameter: null }, meta: {} }), async () => {
    const error = await apiGet('/api/overview').then(() => null, (e) => e);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(isTransientApiError(error), true);
    assert.equal(isWakeError(error), false, 'a JSON 500 comes from the running app, not a sleeping server');
  });
  await withFetch(async (url) => { assert.equal(url, 'https://api.example.com/api/growth?year_from=2015'); return jsonResponse(200, { data: [1], meta: {} }); }, async () => {
    assert.deepEqual((await apiGet('/api/growth', { year_from: 2015 })).data, [1]);
  });
});

test('aborted requests are rethrown, not reported as connection failures', async () => {
  const { apiGet } = loader({}, PROD)('src/api/client.ts');
  await withFetch(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }, async () => {
    const error = await apiGet('/api/overview').then(() => null, (e) => e);
    assert.equal(error.name, 'AbortError');
  });
});

test('error card: unreachable server shows guidance and a retry button, no technical code', () => {
  const load = loader({}, PROD);
  const { ApiError } = load('src/api/client.ts');
  const { ErrorState } = load('src/components/ui/QueryState.tsx');
  let retried = 0;
  const render = (error) => renderToStaticMarkup(React.createElement(ErrorState, { error, onRetry: () => { retried++; } }));
  for (const error of [new ApiError('데이터 서버에 연결하지 못했습니다. 잠시 후', null, 'NETWORK_ERROR'),
    new ApiError('데이터 서버가 아직 준비 중입니다. 잠시 후', 200, 'SERVER_UNAVAILABLE')]) {
    const html = render(error);
    assert.match(html, /API 서버에 연결하지 못했습니다/);
    assert.match(html, /다시 요청/);
    assert.doesNotMatch(html, /SERVER_UNAVAILABLE|NETWORK_ERROR|run\.py/);
  }
  const bad = render(new ApiError('허용된 값', 400, 'INVALID_PARAMETER', 'region_code'));
  assert.match(bad, /400 INVALID_PARAMETER/);
});

test('error card: wake-up timeout is a neutral, unified state with the shared retry (not a red alert)', () => {
  const load = loader({}, PROD);
  const { ApiError, WAKE_TIMEOUT_CODE } = load('src/api/client.ts');
  const { ErrorState } = load('src/components/ui/QueryState.tsx');
  const html = renderToStaticMarkup(React.createElement(ErrorState, { error: new ApiError('x', null, WAKE_TIMEOUT_CODE), onRetry() {} }));
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /role="alert"|class="state error"/);
  assert.match(html, /아직 응답하지 않습니다/);
  assert.match(html, /다시 시도/);
});
