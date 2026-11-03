/* Regression: security headers for the Render static site (render.yaml) and the local Compose Nginx.
 * CSP allows only what the app loads (own files, data: fonts/images in CSS, OSM tiles, the API) with no
 * 'unsafe-inline'/'unsafe-eval'; clickjacking is blocked; Referrer-Policy keeps the origin for OSM tiles;
 * X-Content-Type-Options stays; HSTS only on the HTTPS Render site. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./ts-loader.cjs');

const repo = path.resolve(root, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

function renderHeaders() {
  const yaml = read('render.yaml');
  const stat = yaml.slice(yaml.indexOf('runtime: static'));
  return Object.fromEntries([...stat.matchAll(/- path: \/\*\s+name: (\S+)\s+value: (".*"|\S+)/g)].map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
}
function nginxHeaders() {
  return Object.fromEntries([...read('frontend/nginx.conf').matchAll(/add_header (\S+) "([^"]*)" always;/g)].map((m) => [m[1], m[2]]));
}
const directives = (csp) => Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));

test('Render static site sends CSP, clickjacking, referrer, nosniff and HSTS headers', () => {
  const h = renderHeaders();
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(h['Strict-Transport-Security'], /^max-age=\d{7,}$/);
  const d = directives(h['Content-Security-Policy']);
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.deepEqual(d['script-src'], ["'self'"]);
  assert.deepEqual(d['style-src'], ["'self'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.ok(d['img-src'].includes('https://tile.openstreetmap.org'), 'OSM tiles allowed');
  assert.ok(d['img-src'].includes('data:') && d['font-src'].includes('data:'), 'CSS data: fonts/images allowed');
  const api = d['connect-src'].filter((s) => s.startsWith('https://'));
  assert.equal(api.length, 1, 'exactly one API origin');
  assert.ok(d['img-src'].includes(api[0]), 'report PNGs from the API origin allowed');
});

test('no unsafe-inline / unsafe-eval / wildcard sources in either CSP', () => {
  for (const csp of [renderHeaders()['Content-Security-Policy'], nginxHeaders()['Content-Security-Policy']]) {
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\s\*(\s|;|$)|https:(\s|;|$)/);
  }
});

test('local Nginx sends the same policy with a same-origin API and no HSTS (plain HTTP)', () => {
  const n = nginxHeaders();
  const r = renderHeaders();
  assert.equal(n['X-Content-Type-Options'], 'nosniff');
  assert.equal(n['X-Frame-Options'], r['X-Frame-Options']);
  assert.equal(n['Referrer-Policy'], r['Referrer-Policy']);
  assert.equal(n['Strict-Transport-Security'], undefined);
  const api = directives(r['Content-Security-Policy'])['connect-src'].find((s) => s.startsWith('https://'));
  assert.equal(n['Content-Security-Policy'], r['Content-Security-Policy'].replaceAll(` ${api}`, ''));
  const conf = read('frontend/nginx.conf');
  const locations = conf.slice(conf.indexOf('location'));
  assert.doesNotMatch(locations, /add_header/, 'location blocks must not reset the inherited headers');
});

test('index.html has no inline script, so script-src \'self\' is enough', () => {
  const html = read('frontend/index.html');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    assert.match(m[1], /\bsrc=/);
    assert.equal(m[2].trim(), '');
  }
});
