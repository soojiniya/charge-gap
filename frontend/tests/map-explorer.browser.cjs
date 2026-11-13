/* Reusable real-browser regression for the Regional Explorer map + analysis panel:
 *   const r = await require(thisFile)(browser, baseUrl, apiUrl, outDir?)  → { status, checks, failed }
 * Needs a running production build (vite preview, built with any non-empty VITE_KAKAO_MAP_KEY) and the local backend.
 * The Kakao Maps SDK request is answered with tests/fixtures/kakao-maps-stub.js (same API, Web Mercator, no tiles),
 * because the real SDK only works on the registered domain; Kakao tile/image requests are aborted.
 * Checks layout (≈70/30, stacked on mobile), canvas clusters (no per-marker DOM), panel numbers against the API,
 * region/station selection, list ↔ map linkage, filter linkage, zoom/home/basemap controls, info window, SDK load failure + retry, error and empty states.
 */
const fs = require('fs');
const path = require('path');
const KAKAO_STUB = fs.readFileSync(path.join(__dirname, 'fixtures', 'kakao-maps-stub.js'), 'utf8');
const SDK_RE = /dapi\.kakao\.com\/v2\/maps\/sdk\.js/;
async function routeKakao(p) {
  await p.route(SDK_RE, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB }));
  await p.route(/kakaocdn\.net|daumcdn\.net/, (r) => r.abort());
}

module.exports = async function mapExplorerRegressions(browser, BASE = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:10000', OUT = null) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); if (!ok) console.log('FAIL', name, detail ?? ''); };
  const api = async (path) => (await fetch(API + path)).json();

  async function marks(page) {
    return page.evaluate(() => {
      const c = document.querySelector('.cg-mark-canvas');
      if (!c) return null;
      const rect = c.getBoundingClientRect();
      return (c.cgMarks || []).map((m) => ({ kind: m.kind, key: m.key, x: m.x + rect.left, y: m.y + rect.top, r: m.r,
        region: m.row?.region_code, name: m.row?.station_name ?? m.row?.region_name, id: m.row?.station_id, n: m.count,
        colocated: m.stack }));
    });
  }
  const zoomOf = (page) => page.evaluate(() => Number(document.querySelector('.geo-legend-toggle .num')?.textContent.replace(/[^0-9.]/g, '')));
  async function settle(page, ms = 900) { await page.waitForTimeout(ms); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(300); }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/kakaocdn|daumcdn|ERR_FAILED|net::/i.test(m.text())) errors.push(m.text()); });
  await routeKakao(page);
  const locReqs = [];
  const gridRes = [];
  page.on('request', (r) => { if (r.url().includes('/api/locations')) locReqs.push(r.url()); });
  page.on('response', async (r) => { if (r.url().includes('/api/locations/grid') && r.status() === 200) gridRes.push({ url: r.url(), body: await r.json().catch(() => null) }); });

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
  check('initial view: zoom 8 (Kakao level 12) on desktop', z0 === 8, z0);
  {
    // 지도 폭 ≈750px(1440 화면)에서는 줌 8로 시도 원 남북 범위(≈650px)가 상단 안내 줄 아래(≈625px)에 다 들어가지 않아 끝 원이 조금 잘릴 수 있음.
    // 여기서는 원 중심이 지도 안(±24px)인지만 보고, 원 전체·가림 여부는 넓은 PC 화면(15번)에서 확인
    const mapB = await page.locator('.geo-map').boundingBox();
    const main = ms.filter((m) => m.region !== '50');
    check('initial view: 15 mainland region centres inside the map (±24px; Jeju lies below at zoom 8)',
      main.length === 15 && main.every((m) => m.x >= mapB.x - 24 && m.x <= mapB.x + mapB.width + 24 && m.y >= mapB.y - 24 && m.y <= mapB.y + mapB.height + 24), main.map((m) => [m.region, Math.round(m.x - mapB.x), Math.round(m.y - mapB.y)]));
  }
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
  for (let i = 0; i < 4 && (await zoomOf(page)) < 11; i += 1) { await page.locator('.geo-zoom-in').click(); await page.waitForTimeout(450); }
  await page.waitForFunction(() => document.querySelector('.geo-map')?.dataset.mapMode === 'stations', null, { timeout: 10000 });
  await page.waitForFunction(() => /불러옴|전체 집계|없습니다/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
  await settle(page, 1500);
  ms = await marks(page);
  const clusters = ms.filter((m) => m.kind === 'cluster');
  check('zoom ≥11: station clusters drawn', clusters.length > 0, { clusters: clusters.length, stations: ms.filter((m) => m.kind === 'station').length });
  check('zoom 11–15: server grid requested with bbox + zoom + region filter (not ID-ordered pages)', locReqs.some((u) => /\/api\/locations\/grid\?/.test(u) && /bbox=/.test(u) && /zoom=1[1-5]/.test(u) && /region_code=11/.test(u))
    && !locReqs.some((u) => /\/api\/locations\?/.test(u) && /limit=1000/.test(u)), locReqs.slice(-3));
  const dom2 = await page.evaluate(() => document.querySelector('.geo-map').querySelectorAll('*').length);
  const loaded = await page.locator('.geo-status-text').innerText();
  check('DOM stays small with thousands of loaded stations', dom2 < 200, { dom2, loaded });
  if (OUT) await page.screenshot({ path: `${OUT}/d1440_clusters.png` });
  {
    // 5b. M-1: 상태 줄 수치 = 같은 bbox의 /api/locations 전체 수, 묶음 수치 합 = 서버 격자 집계 (ID 순 3,000곳 제한 없음)
    const g = gridRes[gridRes.length - 1];
    const u = new URL(g.url);
    const locSame = await api(`/api/locations?bbox=${u.searchParams.get('bbox')}&region_code=11&limit=1`);
    const statusNum = Number((await page.locator('.geo-status-text b').first().innerText()).replace(/\D/g, ''));
    const cellSum = g.body.data.reduce((n, c) => n + c.station_count, 0);
    check('M-1: status count = /api/locations total for the same bbox (all stations in view)', statusNum === locSame.meta.pagination.total_items && statusNum === g.body.meta.matched.station_count,
      [statusNum, locSame.meta.pagination.total_items, g.body.meta.matched.station_count]);
    check('M-1: grid cells sum to meta.grid.station_count', cellSum === g.body.meta.grid.station_count, [cellSum, g.body.meta.grid.station_count]);
  }

  // 6. cluster click zooms in
  const zc = await zoomOf(page);
  const biggest = clusters.reduce((a, b) => (b.n > a.n ? b : a));
  await page.mouse.click(biggest.x, biggest.y);
  await settle(page, 1500);
  const zc2 = await zoomOf(page);
  check('cluster click zooms in', zc2 > zc, [zc, zc2]);

  // 7. zoom to individual stations and select one
  for (let i = 0; i < 8 && (await zoomOf(page)) < 16; i += 1) { await page.locator('.geo-zoom-in').click(); await page.waitForTimeout(450); }
  await page.waitForFunction(() => /불러옴|전체 집계|없습니다/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
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
    const free = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.geo-kakao') && !document.elementFromPoint(x, y)?.closest('.geo-zoom, .geo-topbar, .geo-legend, .geo-infowin, .geo-status'), [m.x, m.y]);
    if (free) { pick = m; break; }
  }
  await page.mouse.click(pick.x, pick.y);
  await page.locator('.geo-station').waitFor({ timeout: 3000 });
  const stName = await page.locator('.geo-station-name').innerText();
  const stId = await page.locator('.geo-station-meta div:has(dt:text("충전소 ID")) dd').innerText();
    check('station click shows details in panel', stName === pick.name && stId === pick.id, [stName, pick.name, stId]);
  await page.locator('.geo-infowin').waitFor({ timeout: 3000 });
  const iw = await page.locator('.geo-infowin').innerText();
  check('station click opens map info window (name, address, charger counts)', iw.includes(pick.name) && /충전기/.test(iw) && /주소|[가-힣]+[시도군구]/.test(iw), iw.slice(0, 160));
  if (OUT) await page.locator('.geo-map').screenshot({ path: `${OUT}/d1440_infowin.png` });
  await page.locator('.geo-infowin-close').click();
  check('info window closes', (await page.locator('.geo-infowin').count()) === 0);
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
  await page.locator('.geo-zoom-in').click(); await page.waitForTimeout(400);
  await page.locator('.geo-zoom-in').click(); await page.waitForTimeout(600);
  const zz = await zoomOf(page);
  const seoulAt = async () => { const k = (await marks(page)).find((m) => m.region === '11'); return [Math.round(k.x), Math.round(k.y)]; };
  const mb = await page.locator('.geo-map').boundingBox();
  await page.mouse.move(mb.x + 300, mb.y + 300); await page.mouse.down(); await page.mouse.move(mb.x + 420, mb.y + 380, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
  await page.locator('.geo-zoom-home').click(); await settle(page, 700);
  const seoulHome = await seoulAt();
  await page.reload(); await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 }); await settle(page, 700);
  const seoulReload = await seoulAt();
  check('전국 보기 after zoom + drag = same view as a fresh reload (zoom 8, same position)', (await zoomOf(page)) === 8 && Math.abs(seoulHome[0] - seoulReload[0]) <= 2 && Math.abs(seoulHome[1] - seoulReload[1]) <= 2, [seoulHome, seoulReload]);
  await page.locator('.geo-zoom-in').click(); await page.waitForTimeout(400);
  await page.locator('.geo-zoom-in').click(); await page.waitForTimeout(600);
  await page.locator('.geo-zoom-home').click(); await settle(page, 700);
  check('zoom in/out buttons + 전국 보기 (home) resets to Korea view', zz > z0 && Math.abs((await zoomOf(page)) - z0) < 0.01, [z0, zz, await zoomOf(page)]);
  // Kakao 지도는 레벨 14(줌 6)가 가장 먼 보기. 전국 보기가 이미 그 레벨이면 축소 버튼은 비활성이어야 함
  if (await page.locator('.geo-zoom-out').isDisabled()) {
    check('zoom-out button disabled at the farthest Kakao level (14 = zoom 6)', (await zoomOf(page)) === 6, await zoomOf(page));
    await page.locator('.geo-zoom-in').click(); await page.waitForTimeout(500);
  }
  const zBeforeOut = await zoomOf(page);
  await page.locator('.geo-zoom-out').click(); await page.waitForTimeout(600);
  check('zoom-out button works', (await zoomOf(page)) < zBeforeOut, [zBeforeOut, await zoomOf(page)]);
  await page.locator('.geo-zoom-home').click(); await settle(page, 500);
  const bm = async () => page.evaluate(() => document.querySelector('.geo-map').dataset.basemap);
  const tileFilter = async () => page.evaluate(() => [document.querySelector('.geo-kakao'), ...document.querySelectorAll('.geo-kakao *')].map((e) => getComputedStyle(e).filter).filter((f) => f && f !== 'none'));
  const b1 = await bm();
  const f1 = await tileFilter();
  const dim1 = await page.locator('.geo-dim').count();
  const pressed1 = await page.locator('.geo-basemap button[aria-pressed="true"]').innerText();
  check('basemap default = 원본 (Kakao colours, no CSS filter, no dim layer)', b1 === 'light' && pressed1 === '원본' && f1.length === 0 && dim1 === 0, [b1, pressed1, f1, dim1]);
  await page.locator('.geo-basemap button', { hasText: '어둡게' }).click(); await page.waitForTimeout(200);
  const dimBg = await page.evaluate(() => { const d = document.querySelector('.geo-dim'); return d && { bg: getComputedStyle(d).backgroundColor, pe: getComputedStyle(d).pointerEvents }; });
  const f2 = await tileFilter();
  check('어둡게 (optional): translucent dim layer over the map, still no filter on the map tiles, clicks pass through', (await bm()) === 'dark' && dimBg && /rgba\(.*0\.5\)/.test(dimBg.bg) && dimBg.pe === 'none' && f2.length === 0, [dimBg, f2]);
  await page.locator('.geo-basemap button', { hasText: '원본' }).click(); await page.waitForTimeout(200);
  check('원본 again removes the dim layer', (await bm()) === 'light' && (await page.locator('.geo-dim').count()) === 0);
  const px = await page.evaluate(() => {
    const c = document.querySelector('.cg-mark-canvas');
    const m = c.cgMarks.find((k) => k.kind === 'region' && k.row.region_code === '47'); // 경북: 왼쪽 가장자리에 다른 원이 없음
    const dpr = c.width / c.getBoundingClientRect().width;
    // 숫자 글자를 피해 원 안쪽 가장자리 근처 색을 읽음
    const d = c.getContext('2d').getImageData(Math.round((m.x - m.r * 0.78) * dpr), Math.round(m.y * dpr), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  });
  check('region clusters drawn in mint (#7fd1b4)', Math.abs(px[0] - 0x7f) < 8 && Math.abs(px[1] - 0xd1) < 8 && Math.abs(px[2] - 0xb4) < 8 && px[3] > 240, px);
  check('map built from the Kakao Maps SDK (no Leaflet DOM)', (await page.evaluate(() => document.querySelector('.geo-map').dataset.mapSdk)) === 'ready'
    && (await page.locator('.geo-kakao .kakao-stub-pane').count()) === 1 && (await page.locator('.leaflet-container').count()) === 0);
  await page.locator('.geo-legend-toggle').click();
  check('legend collapses', (await page.locator('.geo-legend-list').count()) === 0);
  await page.locator('.geo-legend-toggle').click();

  const errorsBeforeMocks = errors.length;
  // 11b. Kakao SDK load failure → in-map error + retry (panel keeps working)
  await page.unroute(SDK_RE);
  await page.route(SDK_RE, (r) => r.abort());
  await page.goto(`${BASE}/regional-explorer`);
  await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
  await page.locator('.geo-map-state.is-error').waitFor({ timeout: 30000 });
  const sdkErr = await page.locator('.geo-map-state.is-error').innerText();
  check('SDK load failure: error notice in the map with retry, panel still renders', /카카오맵을 불러오지 못했습니다/.test(sdkErr) && /다시 시도/.test(sdkErr)
    && (await page.locator('.geo-kpi-value').count()) === 3, sdkErr.slice(0, 120));
  if (OUT) await page.locator('.geo-explorer').screenshot({ path: `${OUT}/d1440_sdk_error.png` });
  await page.unroute(SDK_RE);
  await page.route(SDK_RE, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB }));
  await page.locator('.geo-map-state.is-error').getByRole('button', { name: '다시 시도' }).click();
  await page.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 30000 });
  check('SDK retry recovers the map', (await page.locator('.geo-map-state.is-error').count()) === 0);
  const errorsBeforeMocks2 = errors.filter((e) => !/kakao|sdk\.js|ERR_FAILED/i.test(e)).length;
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
  await page.waitForFunction(() => /불러옴|전체 집계|없습니다/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
  check('retry recovers after the locations error', true);

  check('no page/console errors before the mocked-failure steps', errorsBeforeMocks === 0 && errorsBeforeMocks2 === 0, errors.slice(0, 5));
  check('mocked-failure steps log only the mocked 500 responses', errors.slice(errorsBeforeMocks).every((e) => /status of 500|sdk\.js|ERR_FAILED/i.test(e)), errors.slice(errorsBeforeMocks, errorsBeforeMocks + 3));
  await ctx.close();

  // 13. responsive
  for (const [w, h] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await routeKakao(p);
    await p.goto(`${BASE}/regional-explorer`);
    await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
    await settle(p, 800);
    const info = await p.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const m = r('.geo-map'), pn = r('.geo-panel'), st = r('.geo-status'), bm = r('.geo-basemap'), zc = r('.geo-zoom'), lg = r('.geo-legend');
      const overlap = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const marks = document.querySelector('.cg-mark-canvas').cgMarks;
      const inside = marks.filter((k) => k.row.region_code !== '50').every((k) => k.x > -24 && k.y > -24 && k.x < m.width + 24 && k.y < m.height + 24);
      return { docW: document.documentElement.scrollWidth, winW: innerWidth, stacked: pn.top >= m.bottom - 1, side: Math.abs(pn.top - m.top) < 2,
        mapW: m.width, mapH: m.height, panelW: pn.width, overlapZoom: overlap(st, zc) || overlap(bm, zc), overlapLegend: overlap(lg, zc), marksInside: inside };
    });
    const wantStack = w <= 1100;
    check(`${w}px: no horizontal overflow`, info.docW <= info.winW, info);
    check(`${w}px: ${wantStack ? 'map and panel stacked' : 'map and panel side by side'}`, wantStack ? info.stacked : info.side, info);
    check(`${w}px: controls do not overlap`, !info.overlapZoom && !info.overlapLegend, info);
    check(`${w}px: 15 mainland region centres inside the map (±24px; Jeju may lie below at zoom 8)`, info.marksInside, info);
    check(`${w}px: no page errors`, errs.length === 0, errs);
    if (OUT) await p.locator('.geo-explorer').screenshot({ path: `${OUT}/r${w}_explorer.png` });
    await c.close();
  }

  // 14. 처음 보기에서 창 크기가 바뀌면(사용자 조작 전) 전국 보기를 다시 맞춤
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await routeKakao(p);
    await p.goto(`${BASE}/regional-explorer`);
    await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
    await p.setViewportSize({ width: 900, height: 1000 });
    await settle(p, 900);
    const ok = await p.evaluate(() => {
      const m = document.querySelector('.geo-map').getBoundingClientRect();
      return document.querySelector('.cg-mark-canvas').cgMarks.filter((k) => k.row.region_code !== '50').every((k) => k.x > 0 && k.y > 0 && k.x < m.width && k.y < m.height);
    });
    check('resize before any interaction re-fits Korea (all 15 mainland regions stay inside the map)', ok);
    await c.close();
  }

  // 15. 넓은 PC 화면: 줌 8에서 본토 15개 시도 원이 모두 지도 안에, 안내 줄·배경 선택·범례·확대 버튼에 가리지 않음
  for (const [w, h] of [[1920, 1080], [2560, 1440]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    await routeKakao(p);
    await p.goto(`${BASE}/regional-explorer`);
    await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
    await settle(p, 900);
    const info = await p.evaluate(() => {
      const mr = document.querySelector('.geo-map').getBoundingClientRect();
      const boxes = ['.geo-status', '.geo-basemap', '.geo-legend', '.geo-zoom'].map((sel) => document.querySelector(sel).getBoundingClientRect());
      const ms = document.querySelector('.cg-mark-canvas').cgMarks.filter((k) => k.row.region_code !== '50');
      const hit = (k, b) => k.x + k.r > b.left - mr.left && k.x - k.r < b.right - mr.left && k.y + k.r > b.top - mr.top && k.y - k.r < b.bottom - mr.top;
      return { mapW: Math.round(mr.width), zoom: document.querySelector('.geo-legend-toggle .num').textContent,
        clipped: ms.filter((k) => !(k.x - k.r >= 0 && k.y - k.r >= 0 && k.x + k.r <= mr.width && k.y + k.r <= mr.height)).map((k) => k.row.region_code),
        covered: ms.filter((k) => boxes.some((b) => hit(k, b))).map((k) => k.row.region_code) };
    });
    check(`${w}px PC: zoom 8, all 15 mainland region circles fully visible and not under the map controls`, /8/.test(info.zoom) && info.clipped.length === 0 && info.covered.length === 0, info);
    if (OUT) await p.locator('.geo-map').screenshot({ path: `${OUT}/pc${w}_initial.png` });
    await c.close();
  }

  // 16. 제주: 전국 보기(줌 8)에서 화면 아래로 벗어난 제주 원을 가장자리에 붙여 표시 → 누르면 제주로 이동,
  //     확대하면 실제 /api/locations 데이터의 충전소 묶음·개별 충전소 표시. 지역 필터가 다른 시도여도 시도 원 16개 유지
  {
    const c = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await c.newPage();
    await routeKakao(p);
    const reqs = [];
    p.on('request', (r) => { if (r.url().includes('/api/locations')) reqs.push(r.url()); });
    await p.goto(`${BASE}/regional-explorer`);
    await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
    await settle(p, 900);
    const jejuApi = (await api('/api/charger-regions')).data.find((r) => r.region_code === '50');
    const pin = await p.evaluate(() => {
      const mr = document.querySelector('.geo-map').getBoundingClientRect();
      const k = document.querySelector('.cg-mark-canvas').cgMarks.find((m) => m.kind === 'region' && m.row.region_code === '50');
      const lg = document.querySelector('.geo-legend').getBoundingClientRect();
      return k && { x: k.x + mr.left, y: k.y + mr.top, r: k.r, offscreen: !!k.offscreen, count: k.row.station_count, inside: k.x - k.r >= 0 && k.y - k.r >= 0 && k.x + k.r <= mr.width && k.y + k.r <= mr.height,
        underLegend: k.x + mr.left + k.r > lg.left && k.x + mr.left - k.r < lg.right && k.y + mr.top + k.r > lg.top && k.y + mr.top - k.r < lg.bottom };
    });
    check('Jeju: zoom-8 national view keeps the Jeju circle (pinned to the map edge, real station count)', pin && pin.offscreen && pin.inside && !pin.underLegend && pin.count === jejuApi.station_count, pin);
    await p.mouse.click(pin.x, pin.y);
    await p.waitForURL(/region=50/);
    await settle(p, 1200);
    const moved = await p.evaluate(() => { const mr = document.querySelector('.geo-map').getBoundingClientRect(); const k = document.querySelector('.cg-mark-canvas').cgMarks.find((m) => m.kind === 'region' && m.row.region_code === '50'); return { offscreen: !!k.offscreen, dx: Math.abs(k.x - mr.width / 2), dy: Math.abs(k.y - mr.height / 2), n: document.querySelector('.cg-mark-canvas').cgMarks.length }; });
    check('Jeju: clicking the pinned circle selects 제주 and centres the map on Jeju; all 16 region circles stay', !moved.offscreen && moved.dx < 4 && moved.dy < 4 && moved.n === 16, moved);
    for (let i = 0; i < 4 && (await zoomOf(p)) < 11; i += 1) { await p.locator('.geo-zoom-in').click(); await p.waitForTimeout(450); }
    await p.waitForFunction(() => /불러옴|전체 집계/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
    await settle(p, 1200);
    let jm = await marks(p);
    const lastReq = reqs[reqs.length - 1] || '';
    check('Jeju zoom ≥11: station clusters from the real /api/locations/grid (bbox + zoom + region_code=50)', jm.some((m) => m.kind === 'cluster') && /\/api\/locations\/grid\?/.test(lastReq) && /bbox=/.test(lastReq) && /region_code=50/.test(lastReq), { clusters: jm.filter((m) => m.kind === 'cluster').length, lastReq });
    if (OUT) await p.locator('.geo-map').screenshot({ path: `${OUT}/jeju_clusters.png` });
    // 한라산 쪽 대표 지점에는 충전소가 없으므로, 가장 큰 묶음을 눌러 들어가며 개별 충전소 줌(≥16)까지 확대
    for (let i = 0; i < 8 && (await zoomOf(p)) < 16; i += 1) {
      const cl = (await marks(p)).filter((m) => m.kind === 'cluster' && !m.colocated);
      if (!cl.length) break;
      const big = cl.reduce((x, y) => (y.n > x.n ? y : x));
      await p.mouse.click(big.x, big.y);
      await p.waitForFunction(() => /불러옴|전체 집계|없습니다/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
      await settle(p, 1000);
    }
    for (let i = 0; i < 6 && (await zoomOf(p)) < 16; i += 1) { await p.locator('.geo-zoom-in').click(); await p.waitForTimeout(450); }
    await p.waitForFunction(() => /불러옴|전체 집계/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
    await settle(p, 1200);
    jm = await marks(p);
    const st = jm.filter((m) => m.kind === 'station');
    check('Jeju zoom ≥16: individual Jeju station markers (real data, region 50)', st.length > 0 && st.every((m) => m.region === '50'), { stations: st.length, sample: st.slice(0, 3).map((m) => m.name) });
    if (OUT) await p.locator('.geo-map').screenshot({ path: `${OUT}/jeju_stations.png` });

    // 다른 시도(서울) 지역 필터가 걸린 채 제주로 이동: 시도 원 16개 유지, 상태 줄에 이유 + '지역 필터 해제'
    await p.goto(`${BASE}/regional-explorer?region=11`);
    await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
    await settle(p, 900);
    {
      const s11 = await p.evaluate(() => { const mr = document.querySelector('.geo-map').getBoundingClientRect(); const k = document.querySelector('.cg-mark-canvas').cgMarks.find((m) => m.kind === 'region' && m.row.region_code === '11'); return { dx: Math.abs(k.x - mr.width / 2), dy: Math.abs(k.y - mr.height / 2) }; });
      check('M-3: ?region=11 opens the map centred on 서울 at zoom 9', (await zoomOf(p)) === 9 && s11.dx < 3 && s11.dy < 3, [await zoomOf(p), s11]);
    }
    await p.locator('.geo-zoom-home').click(); await settle(p, 600);
    check('M-3: 전국 보기 still returns to the zoom-8 Korea view with a region filter set', (await zoomOf(p)) === 8 && /region=11/.test(p.url()));
    const sel = await p.evaluate(() => document.querySelector('.cg-mark-canvas').cgMarks.filter((m) => m.kind === 'region').length);
    check('region filter (서울) set: national view still draws all 16 region circles (selected one highlighted)', sel === 16, sel);
    const pin2 = await p.evaluate(() => { const mr = document.querySelector('.geo-map').getBoundingClientRect(); const k = document.querySelector('.cg-mark-canvas').cgMarks.find((m) => m.kind === 'region' && m.row.region_code === '50'); return { x: k.x + mr.left, y: k.y + mr.top }; });
    const mb = await p.locator('.geo-map').boundingBox();
    await p.mouse.move(pin2.x, pin2.y - 40); await p.mouse.down(); await p.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2 - 40, { steps: 8 }); await p.mouse.up();
    await p.waitForTimeout(400);
    for (let i = 0; i < 4 && (await zoomOf(p)) < 11; i += 1) { await p.locator('.geo-zoom-in').click(); await p.waitForTimeout(450); }
    await p.waitForFunction(() => /없습니다|불러옴|전체 집계/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
    await settle(p, 800);
    const msg = await p.locator('.geo-status').innerText();
    check('region filter (서울) + Jeju view: status explains the region filter and offers 지역 필터 해제', /지역 필터/.test(msg) && /서울/.test(msg) && (await p.locator('.geo-status').getByRole('button', { name: '지역 필터 해제' }).count()) === 1, msg);
    await p.locator('.geo-status').getByRole('button', { name: '지역 필터 해제' }).click();
    await p.waitForFunction(() => !/region=/.test(location.search), null, { timeout: 10000 });
    await p.waitForFunction(() => /불러옴|전체 집계/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
    await settle(p, 1000);
    const after = await marks(p);
    check('지역 필터 해제 → Jeju station clusters appear in the same view', after.length > 0 && after.every((m) => m.kind !== 'region'), after.length);
    await c.close();
  }

  // 17. M-3: URL 지역 필터 → 처음 보기가 그 지역. 새로고침·공유 URL 동일, 사용자가 움직인 뒤에는 되돌리지 않음
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await routeKakao(p);
    const centreOf = (code) => p.evaluate((code) => { const mr = document.querySelector('.geo-map').getBoundingClientRect(); const k = document.querySelector('.cg-mark-canvas').cgMarks.find((m) => m.kind === 'region' && m.row.region_code === code); return k && { dx: Math.round(k.x - mr.width / 2), dy: Math.round(k.y - mr.height / 2), off: !!k.offscreen }; }, code);
    const open = async (url) => { await p.goto(url); await p.locator('.geo-explorer').scrollIntoViewIfNeeded(); await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 }); await settle(p, 800); };
    await open(`${BASE}/regional-explorer?region=50`);
    let j = await centreOf('50');
    check('M-3: shared URL ?region=50 opens centred on 제주 (zoom 9, real position, not pinned)', (await zoomOf(p)) === 9 && Math.abs(j.dx) < 3 && Math.abs(j.dy) < 3 && !j.off, j);
    await p.reload(); await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 }); await settle(p, 800);
    j = await centreOf('50');
    check('M-3: reload keeps the 제주 initial view', (await zoomOf(p)) === 9 && Math.abs(j.dx) < 3 && Math.abs(j.dy) < 3, j);
    await p.setViewportSize({ width: 900, height: 1000 }); await settle(p, 800);
    j = await centreOf('50');
    check('M-3: resize before any interaction keeps the region view centred', Math.abs(j.dx) < 3 && Math.abs(j.dy) < 3, j);
    await p.setViewportSize({ width: 1440, height: 1000 }); await settle(p, 600);
    // 필터 막대에서 지역 변경(사용자가 지도를 움직이기 전) → 새 지역으로 이동
    await p.locator('.filterbar select').first().selectOption('26');
    await p.waitForURL(/region=26/); await settle(p, 800);
    j = await centreOf('26');
    check('M-3: changing the region filter before moving the map re-centres on that region (부산)', Math.abs(j.dx) < 3 && Math.abs(j.dy) < 3, j);
    // 사용자가 지도를 끈 뒤 지역 변경 → 지도 위치 유지
    const mb = await p.locator('.geo-map').boundingBox();
    await p.mouse.move(mb.x + 300, mb.y + 300); await p.mouse.down(); await p.mouse.move(mb.x + 380, mb.y + 360, { steps: 6 }); await p.mouse.up(); await settle(p, 500);
    const before = await centreOf('26');
    await p.locator('.filterbar select').first().selectOption('11');
    await p.waitForURL(/region=11/); await settle(p, 900);
    const after = await centreOf('26');
    check('M-3: after the user drags the map, a region filter change does not move the map', before && after && before.dx === after.dx && before.dy === after.dy, [before, after]);
    // 지역 필터 없음 → 전국 보기(줌 8)
    await open(`${BASE}/regional-explorer?type=02`);
    check('M-3: no region filter → Korea view at zoom 8', (await zoomOf(p)) === 8);
    await c.close();
  }

  // 18. M-1: 밀집 지역(서울 필터, 줌 11) — 묶음 수치가 화면 영역 전체 충전소를 반영 (이전: 최대 3,000곳)
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await routeKakao(p);
    const grids = [];
    const pageReqs = [];
    p.on('request', (r) => { if (/\/api\/locations\?/.test(r.url()) && /limit=1000/.test(r.url())) pageReqs.push(r.url()); });
    p.on('response', async (r) => { if (r.url().includes('/api/locations/grid') && r.status() === 200) grids.push({ url: r.url(), body: await r.json().catch(() => null) }); });
    // ?region=11 → 서울 중심(M-3). 서울 필터를 그대로 두고 줌 11로 확대 (서울 충전소 수 > 3,000)
    await p.goto(`${BASE}/regional-explorer?region=11`);
    await p.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => Number(document.querySelector('.cg-mark-canvas')?.dataset.markCount) === 16, null, { timeout: 60000 });
    await settle(p, 600);
    await p.getByRole('button', { name: '이 위치 충전소 보기' }).click();
    await p.waitForFunction(() => /전체 집계/.test(document.querySelector('.geo-status')?.innerText || ''), null, { timeout: 60000 });
    await settle(p, 1200);
    const g = grids[grids.length - 1];
    const bbox = new URL(g.url).searchParams.get('bbox');
    const loc = await api(`/api/locations?bbox=${bbox}&region_code=11&limit=1000`);
    const ms2 = await marks(p);
    const drawn = ms2.reduce((n, m) => n + (m.kind === 'cluster' ? m.n : m.kind === 'station' ? 1 : 0), 0);
    check('M-1: dense view (서울, zoom 11) counts every station in view: status = /api/locations total (> 3,000)',
      g.body.meta.matched.station_count === loc.meta.pagination.total_items && loc.meta.pagination.total_items > 3000, [g.body.meta.matched.station_count, loc.meta.pagination.total_items]);
    check('M-1: drawn cluster counts reflect the full grid (> old 3,000 cap, ≤ grid total incl. edge cells)', drawn > 3000 && drawn <= g.body.meta.grid.station_count, [drawn, g.body.meta.grid.station_count]);
    check('M-1: no ID-ordered /api/locations page requests at cluster zoom', pageReqs.length === 0, pageReqs.slice(0, 2));
    if (OUT) await p.locator('.geo-map').screenshot({ path: `${OUT}/m1_dense_grid.png` });
    // 같은 위치 묶음(격자 집계) 누르면 패널에 목록 + 줌 16
    const stack = ms2.filter((m) => m.kind === 'cluster' && m.colocated)[0];
    if (stack) {
      await p.mouse.click(stack.x, stack.y);
      await p.locator('.geo-group').waitFor({ timeout: 10000 });
      const items = await p.locator('.geo-group-item').count();
      await settle(p, 1200);
      check('M-1: same-location stack at cluster zoom lists its stations in the panel and zooms to 16', items === stack.n && (await zoomOf(p)) >= 16, [items, stack.n, await zoomOf(p)]);
    }
    await c.close();
  }

  const failed = results.filter((r) => !r.ok);
  return { status: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed, details: results.map((r) => r.name) };
};
