/* Regression: React Router direct URL access / refresh.
 * - Render Static Site (render.yaml): every page path in App.tsx has a rewrite to /index.html, and nothing else
 *   (no catch-all that would turn missing /assets files or stray /api requests into index.html).
 * - Local Compose Nginx: SPA fallback for pages, real 404 for missing /assets, /backend proxy before the fallback.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./ts-loader.cjs');

const repo = path.resolve(root, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

/** Page paths from <Route path="..."> in App.tsx (index route = "/", "*" = not-found page). */
function appPagePaths() {
  const app = read('frontend/src/App.tsx');
  const paths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*');
  assert.ok(/<Route\s+index\s/.test(app), 'App.tsx keeps an index route for /');
  return paths.map((p) => `/${p}`).sort();
}

/** routes: block of the static site in render.yaml (small, fixed format; no YAML dependency). */
function renderStaticRoutes() {
  const yaml = read('render.yaml');
  const start = yaml.indexOf('runtime: static');
  assert.ok(start > 0, 'render.yaml defines a static site');
  const after = yaml.slice(start);
  const block = after.slice(after.indexOf('\n    routes:'), after.indexOf('\n    headers:'));
  const routes = [];
  for (const m of block.matchAll(/- type: (\S+)\s+source: (\S+)\s+destination: (\S+)/g)) routes.push({ type: m[1], source: m[2], destination: m[3] });
  return routes;
}

test('App.tsx page paths: index / plus the four page paths', () => {
  assert.deepEqual(appPagePaths(), ['/charging-infrastructure', '/ev-registration', '/growth-trends', '/python-visualization', '/regional-explorer']);
});

test('render.yaml rewrites exactly the App.tsx page paths to /index.html', () => {
  const routes = renderStaticRoutes();
  assert.ok(routes.length > 0, 'static site has routes');
  for (const r of routes) {
    assert.equal(r.type, 'rewrite', `${r.source} is a rewrite (URL stays as typed), not a redirect`);
    assert.equal(r.destination, '/index.html');
  }
  assert.deepEqual(routes.map((r) => r.source).sort(), appPagePaths());
});

test('render.yaml has no catch-all that would swallow missing assets or /api requests', () => {
  for (const r of renderStaticRoutes()) {
    assert.ok(!r.source.includes('*'), `no wildcard rewrite (${r.source})`);
    assert.ok(!/^\/(assets|api)(\/|$)/.test(r.source), `assets/api are never rewritten (${r.source})`);
  }
});

test('the static site build publishes dist with absolute /assets URLs (deep paths can load index.html assets)', () => {
  const yaml = read('render.yaml');
  assert.match(yaml, /rootDir: frontend[\s\S]*staticPublishPath: dist/);
  const vite = read('frontend/vite.config.ts');
  assert.ok(!/\bbase\s*:\s*['"]\.\/?['"]/.test(vite), 'Vite base is not relative ("./" would break /regional-explorer refresh)');
});

test('local Nginx: SPA fallback for pages, 404 for missing assets, /backend proxied before the fallback', () => {
  const conf = read('frontend/nginx.conf');
  assert.match(conf, /location \/ \{\s*try_files \$uri \$uri\/ \/index\.html;\s*\}/);
  assert.match(conf, /location \/assets\/ \{\s*try_files \$uri =404;\s*\}/);
  assert.match(conf, /location \^~ \/backend\/ \{[^}]*proxy_pass http:\/\/backend:5000\/;/);
});
