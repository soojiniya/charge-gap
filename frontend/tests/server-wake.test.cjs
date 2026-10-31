/* Regression: Render free-plan wake-up. One shared readiness check replaces per-request errors and retries.
 * Times are scaled 1:100 (1 s of the real schedule = 10 ms here); the real schedule is 2·4·8 s then every
 * 10 s, for at most 180 s. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loader } = require('./ts-loader.cjs');

const PROD = { DEV: false, PROD: true, MODE: 'production', VITE_API_BASE_URL: 'https://api.example.com' };
const SCALE = 100;
const scaled = (t) => ({ delays: t.delays.map((d) => d / SCALE), interval: t.interval / SCALE, maxWait: t.maxWait / SCALE, probeTimeout: t.probeTimeout / SCALE });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function load() {
  const mod = loader({}, PROD);
  const readiness = mod('src/api/readiness.ts');
  return { readiness, client: mod('src/api/client.ts') };
}

/* Fake server: down (connection refused or a non-JSON waking page) until `readyAt` ms, then the app answers. */
function fakeServer({ readyAt = 0, waking = 'refused', api = () => ({ status: 200, body: { data: [1], meta: {} } }) } = {}) {
  const t0 = Date.now();
  const calls = { probe: 0, api: 0, apiUrls: [] };
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const isProbe = u.pathname === '/api/charts' && u.searchParams.get('chart_id') === '1';
    if (isProbe) calls.probe += 1; else { calls.api += 1; calls.apiUrls.push(u.pathname + u.search); }
    if (init.signal?.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    if (Date.now() - t0 < readyAt) {
      if (waking === 'refused') throw new TypeError('Failed to fetch');
      return new Response('<!doctype html><p>Service waking up</p>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    const r = isProbe ? { status: 200, body: { data: [], meta: {} } } : api(u);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls, t0 };
}

async function withServer(server, fn) {
  const original = global.fetch;
  global.fetch = server.fetch;
  try { return await fn(); } finally { global.fetch = original; }
}

function setup() {
  const { readiness, client } = load();
  client.serverReadiness.configure(scaled(readiness.DEFAULT_TIMING));
  return { readiness, client };
}

test('default schedule: 2·4·8 s then every 10 s for at most 3 minutes', () => {
  const { readiness } = load();
  assert.deepEqual(readiness.DEFAULT_TIMING, { delays: [2000, 4000, 8000], interval: 10000, maxWait: 180000, probeTimeout: 15000 });
});

test('server answers immediately: no readiness checks, no waiting, data returned', async () => {
  const { client } = setup();
  const server = fakeServer({ readyAt: 0 });
  await withServer(server, async () => {
    const res = await client.apiGet('/api/overview');
    assert.deepEqual(res.data, [1]);
  });
  assert.equal(server.calls.probe, 0);
  assert.equal(server.calls.api, 1);
  assert.equal(client.serverReadiness.getSnapshot().phase, 'ready');
});

for (const [seconds, waking] of [[30, 'refused'], [90, 'html'], [150, 'refused']]) {
  test(`server ready after ${seconds} s (${waking}): requests wait, then each retries exactly once`, async () => {
    const { client } = setup();
    const server = fakeServer({ readyAt: seconds * 1000 / SCALE, waking });
    const phases = [];
    client.serverReadiness.subscribe(() => phases.push(client.serverReadiness.getSnapshot().phase));
    const urls = ['/api/overview', '/api/charger-types', '/api/charger-regions', '/api/growth'];
    const results = await withServer(server, () => Promise.all(urls.map((u) => client.apiGet(u))));
    assert.ok(results.every((r) => r.data[0] === 1));
    // one failed attempt + one retry per request; no per-request polling
    assert.equal(server.calls.api, urls.length * 2);
    // a single shared check loop: 2,6,14,24,34... s -> checks needed to see readiness after `seconds`
    const expected = seconds <= 2 ? 1 : seconds <= 6 ? 2 : seconds <= 14 ? 3 : 3 + Math.ceil((seconds - 14) / 10);
    assert.ok(Math.abs(server.calls.probe - expected) <= 1, `checks ${server.calls.probe} vs ~${expected}`);
    assert.equal(phases[0], 'waking');
    assert.equal(client.serverReadiness.getSnapshot().phase, 'ready');
  });
}

test('server not ready within 3 minutes: requests end with SERVER_WAKE_TIMEOUT (no auto-retry), manual retry recovers', async () => {
  const { client } = setup();
  const server = fakeServer({ readyAt: 10 ** 9 });
  let refetches = 0;
  client.serverReadiness.onReady(() => { refetches += 1; });
  await withServer(server, async () => {
    const started = Date.now();
    const error = await client.apiGet('/api/overview').then(() => null, (e) => e);
    assert.equal(error.code, client.WAKE_TIMEOUT_CODE);
    assert.equal(client.isTransientApiError(error), false, 'react-query must not start another wait on its own');
    assert.ok(Date.now() - started >= 1800 - 50, 'waited the full (scaled) 3 minutes');
    assert.ok(server.calls.probe >= 15 && server.calls.probe <= 21, `about 20 checks in 3 minutes, got ${server.calls.probe}`);
    assert.equal(client.serverReadiness.getSnapshot().phase, 'unavailable');
    // no background polling after giving up
    const probes = server.calls.probe;
    await sleep(300);
    assert.equal(server.calls.probe, probes);
  });
  // server comes up; the visitor presses "다시 시도"
  const up = fakeServer({ readyAt: 0 });
  await withServer(up, async () => {
    client.serverReadiness.checkNow();
    await sleep(30);
    assert.equal(client.serverReadiness.getSnapshot().phase, 'ready');
    assert.equal(up.calls.probe, 1, 'manual retry checks immediately');
    assert.equal(refetches, 1, 'errored screens are refetched once the server is ready');
    assert.deepEqual((await client.apiGet('/api/overview')).data, [1]);
  });
});

test('requests made while waking do not hit the API until the server is ready; aborted waits are released', async () => {
  const { client } = setup();
  const server = fakeServer({ readyAt: 300 });
  await withServer(server, async () => {
    const first = client.apiGet('/api/overview');            // starts the wait (1 failed attempt)
    await sleep(5);
    assert.equal(client.serverReadiness.getSnapshot().phase, 'waking');
    const apiBefore = server.calls.api;
    // page navigation / filter changes during the wait: old request aborted, new ones queue up
    const abort = new AbortController();
    const stale = client.apiGet('/api/charger-types?deletion=deleted', {}, abort.signal);
    const fresh = [client.apiGet('/api/overview', { region_code: '41' }), client.apiGet('/api/locations', { limit: 20 })];
    await sleep(20);
    assert.equal(server.calls.api, apiBefore, 'no extra API requests while waking');
    abort.abort();
    assert.equal((await stale.then(() => null, (e) => e)).name, 'AbortError');
    const results = await Promise.all([first, ...fresh]);
    assert.ok(results.every((r) => r.data[0] === 1));
    assert.ok(!server.calls.apiUrls.some((u) => u.includes('deletion=deleted')), 'aborted request was never sent');
    assert.equal(client.serverReadiness.waiting, 0);
  });
});

test('"지금 다시 확인" during the wait checks immediately instead of waiting for the next interval', async () => {
  const { client } = setup();
  client.serverReadiness.configure({ delays: [20, 400], interval: 400 });  // first check 20 ms, next 400 ms later
  const server = fakeServer({ readyAt: 60 });
  await withServer(server, async () => {
    const pending = client.apiGet('/api/overview');
    await sleep(120);                      // first check failed; server is ready now; next check is far away
    assert.equal(client.serverReadiness.getSnapshot().phase, 'waking');
    const probes = server.calls.probe;
    client.serverReadiness.checkNow();
    await pending;
    assert.equal(server.calls.probe, probes + 1);
  });
});

test('JSON API errors (400·404·500) never trigger the wake-up wait', async () => {
  const { client } = setup();
  for (const status of [400, 404, 500]) {
    const server = fakeServer({ api: () => ({ status, body: { error: { code: `E${status}`, message: 'm', parameter: null }, meta: {} } }) });
    await withServer(server, async () => {
      const error = await client.apiGet('/api/overview').then(() => null, (e) => e);
      assert.equal(error.status, status);
      assert.equal(server.calls.probe, 0);
      assert.equal(server.calls.api, 1);
      assert.equal(client.serverReadiness.getSnapshot().phase, 'ready');
    });
  }
});

test('a server that falls asleep again later starts a new wait (session longer than 15 minutes)', async () => {
  const { client } = setup();
  await withServer(fakeServer({ readyAt: 0 }), () => client.apiGet('/api/overview'));
  const asleep = fakeServer({ readyAt: 100 });
  await withServer(asleep, async () => {
    assert.deepEqual((await client.apiGet('/api/growth')).data, [1]);
    assert.ok(asleep.calls.probe >= 1);
  });
});
