/* Regression: sidebar page links keep the shared charger/EV filters (README: 페이지를 옮겨도 유지). */
const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter, Route, Routes } = require('react-router-dom');
const { loader } = require('./ts-loader.cjs');

const { filterSearch } = loader()('src/state/filters.ts');

test('filterSearch keeps every shared filter key and drops page-only parameters (Growth Trends from/to)', () => {
  assert.equal(
    filterSearch('?from=2015&region=41&type=02&deletion=not_deleted&operator=PI&ev_region=12&to=2020'),
    '?region=41&type=02&deletion=not_deleted&operator=PI&ev_region=12',
  );
  assert.equal(filterSearch('?from=2015&to=2020'), '');
  assert.equal(filterSearch(''), '');
  assert.equal(filterSearch('?region='), '');
});

function sidebarHrefs(url) {
  const { AppShell } = loader({
    '../../api/hooks': { useBaseOverview: () => ({ data: undefined, isLoading: true, error: null, refetch() {} }) },
    '../../api/client': { API_BASE_URL: 'https://api.test' },
    '../api/hooks': { useOperatorIds: () => undefined },
  })('src/components/layout/AppShell.tsx');
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [url] },
    React.createElement(Routes, null, React.createElement(Route, { path: '*', element: React.createElement(AppShell) }))));
  const nav = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
  return [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

test('every sidebar link carries the active filters', () => {
  const hrefs = sidebarHrefs('/growth-trends?from=2015&region=41&deletion=not_deleted&operator=PI');
  const pages = ['/', '/ev-registration', '/charging-infrastructure', '/regional-explorer', '/growth-trends'];
  for (const page of pages) assert.ok(hrefs.includes(`${page}?region=41&deletion=not_deleted&operator=PI`), `${page}: ${hrefs}`);
  assert.ok(hrefs.every((h) => !/[?&](from|to)=/.test(h)), 'Growth Trends year range must not leak to other pages');
});

test('sidebar links stay clean when no filter is active', () => {
  const hrefs = sidebarHrefs('/growth-trends?from=2015&to=2020');
  assert.ok(hrefs.length >= 6);
  assert.ok(hrefs.every((h) => !h.includes('?')), String(hrefs));
});
