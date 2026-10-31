/* Regression: a production build must never silently ship the localhost API fallback. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loader, root } = require('./ts-loader.cjs');

const { apiBaseUrlProblem, isLocalHostname } = loader()('src/config/apiBaseUrl.ts');

test('missing or blank API base URL is rejected', () => {
  for (const value of [undefined, '', '   ']) assert.match(apiBaseUrlProblem(value), /비어 있습니다/);
});

test('localhost-style API base URLs are rejected', () => {
  for (const value of ['http://127.0.0.1:5000', 'http://localhost:5000', 'https://LOCALHOST/', 'http://127.1.2.3',
    'http://0.0.0.0:5000', 'http://[::1]:5000', 'http://api.localhost', 'http://localhost.:5000']) {
    assert.match(apiBaseUrlProblem(value), /localhost/, value);
  }
});

test('malformed or non-http API base URLs are rejected', () => {
  for (const value of ['charge-gap-api.onrender.com', 'ftp://example.com', '//example.com']) {
    assert.ok(apiBaseUrlProblem(value), value);
  }
});

test('deployment values stay allowed (Render HTTPS origin, Compose same-origin prefix)', () => {
  for (const value of ['https://charge-gap-api.onrender.com', 'https://api.example.com/', '/backend', 'http://192.168.0.10:5000']) {
    assert.equal(apiBaseUrlProblem(value), null, value);
  }
  assert.equal(isLocalHostname('127.example.com'), false);
});

const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
function build(env, outDir) {
  const clean = { ...process.env };
  delete clean.VITE_API_BASE_URL;
  delete clean.CHARGE_GAP_ALLOW_LOCAL_API_BUILD;
  return spawnSync(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
    { cwd: root, env: { ...clean, ...env }, encoding: 'utf8', timeout: 180000 });
}
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `chargegap-${name}-`));

test('vite production build fails without VITE_API_BASE_URL', () => {
  const r = build({}, tmp('missing'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /\[CHARGE GAP\].*VITE_API_BASE_URL/);
});

test('vite production build fails with a localhost VITE_API_BASE_URL', () => {
  const r = build({ VITE_API_BASE_URL: 'http://127.0.0.1:5000' }, tmp('local'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /localhost/);
});

test('vite production build succeeds with a deployment HTTPS origin and embeds it', () => {
  const out = tmp('https');
  const r = build({ VITE_API_BASE_URL: 'https://charge-gap-api.example.com' }, out);
  assert.equal(r.status, 0, r.stderr);
  const js = fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
  assert.ok(js.includes('https://charge-gap-api.example.com'));
  fs.rmSync(out, { recursive: true, force: true });
});
