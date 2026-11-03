/* Reusable real-browser regression for the Regional Explorer map + analysis panel:
 *   const r = await require(thisFile)(browser, baseUrl, apiUrl, outDir?)  → { status, checks, failed }
 * Needs a running production build (vite preview) and the local backend. Map tiles are aborted (not needed).
 * Checks layout (≈70/30, stacked on mobile), canvas clusters (no per-marker DOM), panel numbers against the API,
 * region/station selection, list ↔ map linkage, filter linkage, zoom/home/basemap controls, error and empty states.
 */
module.exports = async function mapExplorerRegressions(browser, BASE = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:10000', OUT = null) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); if (!ok) console.log('FAIL', name, detail ?? ''); };
  const api = async (path) => (await fetch(API + path)).json();

  async function marks(page) {
    return page.evaluate(() => {
      const c = document.querySelector('.cg-mark-canvas');
      if (!c) return null;
      const rect = c.closest('.leaflet-container').getBoundingClientRect();
      return (c.cgMarks || []).map((m) => ({ kind: m.kind, key: m.key, x: m.x + rect.left, y: m.y + rect.top, r: m.r,
        region: m.row?.region_code, name: m.row?.station_name ?? m.row?.region_name, id: m.row?.station_id, n: m.cluster?.members.length,
        colocated: m.stack }));
    });
  }
  const zoomOf = (page) => page.evaluate(() => Number(document.querySelector('.geo-legend-toggle .num')?.textContent.replace(/[^0-9.]/g, '')));
  async function settle(page, ms = 900) { await page.waitForTimeout(ms); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(300); }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_FAILED|net::/i.test(m.text())) errors.push(m.text()); });
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  const locReqs = [];
  page.on('request', (r) => { if (r.url().includes('/api/locations')) locReqs.push(r.url()); });

  await page.goto(`${BASE}/regional-explorer`);
  await page.locator('.geo-explorer').waitFor();
  await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
  await settle(page);

  // 1. layout ~70/30
  const lay = await page.evaluate(() => {
    const m = document.querySelector('.geo-map').getBoundingClientRect();
    const p = document.querySelector('.geo-panel').getBoundingClientRect();
    return { mw: m.width, pw: p.width, mh: m.height, ph: p.height, sameRow: Math.abs(m.top - p.top) < 2 };
  });
  const ratio = lay.mw / (lay.mw + lay.pw);
  check('desktop: map and panel side by side, map ≈70%', lay.sameRow && ratio > 0.66 && ratio < 0.74, lay);
  check('desktop: map height 680 (was 560)', Math.round(lay.mh) === 680, lay.mh);

  // 2. initial Korea view, 16 region clusters labelled by station count
  let ms = await marks(page);
  check('initial: 16 region clusters drawn on one canvas', ms.length === 16 && ms.every((m) => m.kind === 'region'));
  const z0 = await zoomOf(page);
  check('initial zoom fits Korea (5–8)', z0 >= 5 && z0 <= 8, z0);
  const regionsApi = await api('/api/charger-regions');
  const seoulApi = regionsApi.data.find((r) => r.region_code === '11');
  const big = ms.reduce((a, b) => (b.r > a.r ? b : a));
  const bigApi = regionsApi.data.reduce((a, b) => (b.station_count > a.station_count ? b : a));
  check('largest circle = region with most stations', big.region === bigApi.region_code, [big.region, bigApi.region_code]);
  const domCount = await page.evaluate(() => document.querySelector('.geo-map').querySelectorAll('*').length);
  check('map DOM stays small in region mode', domCount < 200, domCount);

  // 3. panel default = nationwide summary from /api/overview
  const ov = await api('/api/overview');
  const kpis = await page.locator('.geo-kpi-value').allInnerTexts();
  check('panel KPIs = /api/overview chargers, stations, avg', kpis[0].replace(/\D/g, '') === String(ov.data.chargers.charger_count)
    && kpis[1].replace(/\D/g, '') === String(ov.data.chargers.station_count)
    && kpis[2].startsWith((ov.data.chargers.charger_count / ov.data.chargers.station_count).toFixed(2)), kpis);
  const ops = await api('/api/operators?page=1&limit=5');
  const opNames = await page.locator('.geo-panel-section:has(h4:text("주요 운영기관")) .geo-bar-name').allInnerTexts();
  check('panel top operators = /api/operators top 5 in order', opNames.length === 5 && opNames.every((t, i) => t.startsWith(ops.data[i].operator_name)), opNames);
  const typesApi = await api('/api/charger-types');
  const topType = [...typesApi.data].sort((a, b) => b.charger_count - a.charger_count)[0];
  const typeFirst = await page.locator('.geo-panel .geo-bars li').first().innerText();
  check('panel type mix first row = largest type', typeFirst.includes(topType.charger_type_code) && typeFirst.replace(/\D/g, '').includes(String(topType.charger_count)), typeFirst);
  await page.locator('.geo-mini-seg button', { hasText: '출력' }).click();
  await settle(page, 400);
  const outRows = await page.locator('.geo-panel-section:has(h4:text("출력 구성")) .geo-bars li').allInnerTexts();
  const outApi = await api('/api/charger-output');
  const sumBands = outRows.reduce((n, t) => n + Number(t.split('\n')[1].split('기')[0].replace(/\D/g, '')), 0);
  check('output mix sums to all chargers in /api/charger-output', sumBands === outApi.data.reduce((n, r) => n + r.charger_count, 0), [sumBands]);
  await page.locator('.geo-mini-seg button', { hasText: '유형' }).click();
  if (OUT) await page.screenshot({ path: `${OUT}/d1440_regions.png` });

  // 4. hover tooltip + region click → region filter
  const seoul = ms.find((m) => m.region === '11');
  await page.mouse.move(seoul.x, seoul.y);
  await page.locator('.geo-tooltip').waitFor({ timeout: 3000 });
  const tip = await page.locator('.geo-tooltip').innerText();
  check('hover tooltip shows region station/charger counts', tip.includes('서울') && tip.replace(/\D/g, '').includes(String(seoulApi.station_count)), tip);
  await page.mouse.click(seoul.x, seoul.y);
  await page.waitForURL(/region=11/);
  await settle(page, 1500);
  const z1 = await zoomOf(page);
  check('region click sets ?region=11 and zooms to ≥9', z1 >= 9, z1);
  const title = await page.locator('.geo-panel-title').innerText();
  const ov11 = await api('/api/overview?region_code=11');
  const k11 = await page.locator('.geo-kpi-value').allInnerTexts();
  check('panel follows region filter (title + /api/overview?region_code=11)', title.includes('서울') && k11[0].replace(/\D/g, '') === String(ov11.data.chargers.charger_count), [title, k11[0]]);
  check('filter bar region select shows 11', (await page.locator('.filterbar select').first().inputValue()) === '11');

  // 5. zoom in to station mode → clusters (canvas), /api/locations with bbox
  const mapBox = await page.locator('.geo-map').boundingBox();
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  for (let i = 0; i < 4 && (await zoomOf(page)) < 11; i += 1) { await page.locator('.leaflet-control-zoom-in').click(); await page.waitForTimeout(450); }
  await page.waitForFunction(() => document.querySelector('.geo-map')?.dataset.mapMode === 'stations', null, { timeout: 10000 });
  await page.waitForFunction(() => /불러옴|없습니다/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
  await settle(page, 1500);
  ms = await marks(page);
  const clusters = ms.filter((m) => m.kind === 'cluster');
  check('zoom ≥11: station clusters drawn', clusters.length > 0, { clusters: clusters.length, stations: ms.filter((m) => m.kind === 'station').length });
  check('locations requested with bbox + region filter', locReqs.some((u) => /bbox=/.test(u) && /region_code=11/.test(u) && /limit=1000/.test(u)));
  const dom2 = await page.evaluate(() => document.querySelector('.geo-map').querySelectorAll('*').length);
  const loaded = await page.locator('.geo-status-text').innerText();
  check('DOM stays small with thousands of loaded stations', dom2 < 200, { dom2, loaded });
  if (OUT) await page.screenshot({ path: `${OUT}/d1440_clusters.png` });

  // 6. cluster click zooms in
  const zc = await zoomOf(page);
  const biggest = clusters.reduce((a, b) => (b.n > a.n ? b : a));
  await page.mouse.click(biggest.x, biggest.y);
  await settle(page, 1500);
  const zc2 = await zoomOf(page);
  check('cluster click zooms in', zc2 > zc, [zc, zc2]);

  // 7. zoom to individual stations and select one
  for (let i = 0; i < 8 && (await zoomOf(page)) < 16; i += 1) { await page.locator('.leaflet-control-zoom-in').click(); await page.waitForTimeout(450); }
  await page.waitForFunction(() => /불러옴|없습니다/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
  await settle(page, 1500);
  ms = await marks(page);
  let st = ms.filter((m) => m.kind === 'station');
  const colo = ms.filter((m) => m.kind === 'cluster');
  check('zoom ≥16: individual stations; only same-coordinate stacks remain grouped', st.length > 0 && colo.every((m) => m.colocated), { st: st.length, colo: colo.length, z: await zoomOf(page) });
  if (colo.length) {
    await page.mouse.click(colo[0].x, colo[0].y);
    await page.locator('.geo-group').waitFor({ timeout: 3000 });
    const items = await page.locator('.geo-group-item').count();
    await page.locator('.geo-group-item').nth(1).click();
    await page.locator('.geo-station').waitFor({ timeout: 3000 });
    check('same-coordinate stack click lists its stations in the panel; picking one shows details', items === colo[0].n);
    await page.locator('.geo-panel [aria-label="목록 닫기"]').click();
    await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    ms = await marks(page);
    st = ms.filter((m) => m.kind === 'station');
  }
  const mapBox2 = await page.locator('.geo-map').boundingBox();
  const inner = st.filter((m) => m.x > mapBox2.x + 80 && m.x < mapBox2.x + mapBox2.width - 80 && m.y > mapBox2.y + 120 && m.y < mapBox2.y + mapBox2.height - 160);
  let pick = null;
  for (const m of inner.length ? inner : st) {
    const free = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.leaflet-container') && !document.elementFromPoint(x, y)?.closest('.leaflet-control'), [m.x, m.y]);
    if (free) { pick = m; break; }
  }
  await page.mouse.click(pick.x, pick.y);
  await page.locator('.geo-station').waitFor({ timeout: 3000 });
  const stName = await page.locator('.geo-station-name').innerText();
  const stId = await page.locator('.geo-station-meta div:has(dt:text("충전소 ID")) dd').innerText();
    check('station click shows details in panel', stName === pick.name && stId === pick.id, [stName, pick.name, stId]);
  ms = await marks(page);
  if (OUT) await page.screenshot({ path: `${OUT}/d1440_station_selected.png` });

  // 8. list ↔ map: list "지도" button selects + focuses
  await page.locator('section.card:has(.card-title:text("충전소 목록"))').scrollIntoViewIfNeeded();
  const firstRow = page.locator('section.card:has(.card-title:text("충전소 목록")) tbody tr').first();
  await firstRow.waitFor();
  const rowName = await firstRow.locator('td').nth(1).innerText();
  const rowId = await firstRow.locator('td').nth(0).innerText();
  await firstRow.getByRole('button', { name: /지도에서 보기/ }).click();
  await settle(page, 2200);
  const panelName = await page.locator('.geo-station-name').innerText();
  const mapInView = await page.evaluate(() => { const r = document.querySelector('.geo-map').getBoundingClientRect(); return r.top >= -2 && r.top < window.innerHeight / 2; });
  const rowSelected = await firstRow.evaluate((tr) => tr.classList.contains('is-selected'));
  ms = await marks(page);
  const center = await page.evaluate(() => { const r = document.querySelector('.geo-map').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const selMark = ms.find((m) => m.id === rowId.trim());
  check('list "지도" button: panel shows that station, map scrolled into view, row highlighted', panelName === rowName && mapInView && rowSelected, [panelName, rowName, mapInView, rowSelected]);
  check('list "지도" button: map centred on that station at zoom ≥16', selMark && Math.hypot(selMark.x - center.x, selMark.y - center.y) < 6 && (await zoomOf(page)) >= 16, { selMark, center });

  // 9. filter change clears selection and refetches with filter (deletion + type)
  const reqBefore = locReqs.length;
  await page.locator('.filterbar .segmented button', { hasText: '삭제 표시' }).filter({ hasNotText: '비삭제' }).click();
  await page.waitForURL(/deletion=deleted/);
  await settle(page, 1500);
  check('deletion filter clears station selection', (await page.locator('.geo-station').count()) === 0);
  check('deletion filter refetches map locations with deletion=deleted', locReqs.slice(reqBefore).some((u) => /deletion=deleted/.test(u)));
  const ovDel = await api('/api/overview?region_code=11&deletion=deleted');
  const kDel = await page.locator('.geo-kpi-value').first().innerText().catch(() => '');
  const emptyDel = await page.locator('.geo-panel .geo-empty').count();
  check('panel follows deletion filter', ovDel.data.chargers.charger_count === 0 ? emptyDel > 0 : kDel.replace(/\D/g, '') === String(ovDel.data.chargers.charger_count), [kDel, ovDel.data.chargers.charger_count]);
  await page.locator('.filterbar .segmented button', { hasText: '전체' }).click();
  await page.locator('.filterbar select').nth(1).selectOption('02');
  await page.waitForURL(/type=02/);
  await settle(page, 1500);
  const typeRows = await page.locator('.geo-panel-section:has(h4:text("유형 구성")) .geo-bars li').allInnerTexts();
  const chips = await page.locator('.geo-chip').allInnerTexts();
  check('type filter: panel mix shows only type 02, chip shows type', typeRows.length === 1 && typeRows[0].includes('02') && chips[0].includes('02'), [typeRows, chips]);
  check('type filter refetches map locations with charger_type=02', locReqs.some((u) => /charger_type=02/.test(u)));

  // 10. operator filter via URL + panel chip / operators list
  const opId = ops.data[0].operator_id;
  await page.goto(`${BASE}/regional-explorer?operator=${opId}`);
  await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) > 0, null, { timeout: 60000 });
  await settle(page, 1200);
  const ovOp = await api(`/api/overview?operator_id=${opId}`);
  const kOp = await page.locator('.geo-kpi-value').allInnerTexts();
  const opChip = (await page.locator('.geo-chip').allInnerTexts())[2];
  const opRowsText = await page.locator('.geo-panel-section:has(h4:text("주요 운영기관")) .geo-bar-name').allInnerTexts();
  const opApi = await api(`/api/operators?operator_id=${opId}&page=1&limit=5`);
  check('operator filter: panel KPIs, chip (ID + name), operator rows only for that ID', kOp[0].replace(/\D/g, '') === String(ovOp.data.chargers.charger_count) && opChip.includes(opId) && opChip.includes(opApi.data[0].operator_name)
    && opRowsText.length === opApi.data.length && opRowsText.every((t) => t.trim().endsWith(opId)), [kOp[0], opChip, opRowsText]);
  const regOp = await api(`/api/charger-regions?operator_id=${opId}`);
  ms = await marks(page);
  const max = Math.max(...regOp.data.map((r) => r.station_count));
  const bigOp = ms.reduce((a, b) => (b.r > a.r ? b : a));
  check('operator filter: region clusters resized from filtered /api/charger-regions', regOp.data.find((r) => r.region_code === bigOp.region).station_count === max);

  // 11. home button + basemap selector + legend
  await page.goto(`${BASE}/regional-explorer`);
  await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
  await page.locator('.leaflet-control-zoom-in').click(); await page.waitForTimeout(400);
  await page.locator('.leaflet-control-zoom-in').click(); await page.waitForTimeout(600);
  const zz = await zoomOf(page);
  await page.locator('.leaflet-control-zoom-home').click(); await settle(page, 700);
  check('zoom in/out buttons + 전국 보기 (home) resets to Korea view', zz > z0 && Math.abs((await zoomOf(page)) - z0) < 0.01, [z0, zz, await zoomOf(page)]);
  await page.locator('.leaflet-control-zoom-out').click(); await page.waitForTimeout(600);
  check('zoom-out button works', (await zoomOf(page)) < z0);
  await page.locator('.leaflet-control-zoom-home').click(); await settle(page, 500);
  const tileClass = async () => page.evaluate(() => [...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].map((e) => e.className.replace('leaflet-layer', '').trim()).join('|'));
  const t1 = await tileClass();
  await page.locator('.geo-basemap button', { hasText: '원본' }).click(); await page.waitForTimeout(200);
  const t2 = await tileClass();
  await page.locator('.geo-basemap button', { hasText: '끄기' }).click(); await page.waitForTimeout(200);
  const t3 = await tileClass();
  await page.locator('.geo-basemap button', { hasText: '어둡게' }).click(); await page.waitForTimeout(200);
  const attr = await page.locator('.leaflet-control-attribution').innerText();
  check('basemap selector: dark → original → off → dark', t1.includes('osm-dark') && t2.includes('osm-light') && t3 === '' && (await tileClass()).includes('osm-dark'), [t1, t2, t3]);
  check('OSM attribution kept', /OpenStreetMap/.test(attr), attr);
  await page.locator('.geo-legend-toggle').click();
  check('legend collapses', (await page.locator('.geo-legend-list').count()) === 0);
  await page.locator('.geo-legend-toggle').click();

  const errorsBeforeMocks = errors.length;
  // 12. errors / empty
  await page.route(/\/api\/operators/, (r) => r.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': BASE },
    body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x', parameter: null }, meta: { api_version: '1.0' } }) }));
  await page.goto(`${BASE}/regional-explorer?type=03`);
  await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.locator('.geo-panel .state.error').waitFor({ timeout: 60000 });
  const errText = await page.locator('.geo-panel .state.error').innerText();
  check('operators API 500: error only in that panel section, others still render', errText.includes('500') && (await page.locator('.geo-kpi-value').count()) === 3, errText.slice(0, 80));
  await page.unroute(/\/api\/operators/);
  const zeroType = (await api('/api/overview')).meta.filter_options.charger_types.find((t) => t.observed_charger_count === 0);
  if (zeroType) {
    await page.goto(`${BASE}/regional-explorer?type=${zeroType.code}`);
    await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await page.locator('.geo-panel .geo-empty').first().waitFor({ timeout: 60000 });
    check(`empty result (type ${zeroType.code}, 0 chargers): panel empty message`, true);
  } else check('empty result type available', false, 'no zero type');
  await page.route(/\/api\/locations/, (r) => r.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': BASE },
    body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x', parameter: null }, meta: { api_version: '1.0' } }) }));
  await page.goto(`${BASE}/regional-explorer`);
  await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
  await page.getByRole('button', { name: '이 위치 충전소 보기' }).click();
  await page.locator('.geo-status .state.error').waitFor({ timeout: 60000 });
  check('locations API 500: error with retry shown in map status bar', (await page.locator('.geo-status').innerText()).includes('500'));
  if (OUT) await page.screenshot({ path: `${OUT}/d1440_loc_error.png` });
  await page.unroute(/\/api\/locations/);
  await page.locator('.geo-status').getByRole('button', { name: /다시/ }).click();
  await page.waitForFunction(() => /불러옴|없습니다/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
  check('retry recovers after the locations error', true);

  check('no page/console errors before the mocked-failure steps', errorsBeforeMocks === 0, errors.slice(0, 5));
  check('mocked-failure steps log only the mocked 500 responses', errors.slice(errorsBeforeMocks).every((e) => /status of 500/.test(e)), errors.slice(errorsBeforeMocks, errorsBeforeMocks + 3));
  await ctx.close();

  // 13. responsive
  for (const [w, h] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.route(/tile\.openstreetmap\.org/, (r) => r.abort());
    await p.goto(`${BASE}/regional-explorer`);
    await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
    await settle(p, 800);
    const info = await p.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const m = r('.geo-map'), pn = r('.geo-panel'), st = r('.geo-status'), bm = r('.geo-basemap'), zc = r('.leaflet-control-zoom'), lg = r('.geo-legend');
      const overlap = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const marks = document.querySelector('.cg-mark-canvas').cgMarks;
      const inside = marks.every((k) => k.x > -k.r && k.y > -k.r && k.x < m.width + k.r && k.y < m.height + k.r);
      return { docW: document.documentElement.scrollWidth, winW: innerWidth, stacked: pn.top >= m.bottom - 1, side: Math.abs(pn.top - m.top) < 2,
        mapW: m.width, mapH: m.height, panelW: pn.width, overlapZoom: overlap(st, zc) || overlap(bm, zc), overlapLegend: overlap(lg, zc), marksInside: inside };
    });
    const wantStack = w <= 1100;
    check(`${w}px: no horizontal overflow`, info.docW <= info.winW, info);
    check(`${w}px: ${wantStack ? 'map and panel stacked' : 'map and panel side by side'}`, wantStack ? info.stacked : info.side, info);
    check(`${w}px: controls do not overlap`, !info.overlapZoom && !info.overlapLegend, info);
    check(`${w}px: all 16 regions inside the map`, info.marksInside, info);
    check(`${w}px: no page errors`, errs.length === 0, errs);
    if (OUT) await p.locator('.geo-explorer').screenshot({ path: `${OUT}/r${w}_explorer.png` });
    await c.close();
  }

  const failed = results.filter((r) => !r.ok);
  return { status: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed, details: results.map((r) => r.name) };
};
