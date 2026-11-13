/* Real-browser check of the coordinate-quality notice (coordinate_flag) on the Regional Explorer map:
 *   const r = await require(thisFile)(browser, baseUrl, apiUrl, outDir?)  → { status, checks, failed }
 * Needs a running production build (vite preview, built with any non-empty VITE_KAKAO_MAP_KEY) and the local
 * backend with the real snapshot. The Kakao SDK is answered with tests/fixtures/kakao-maps-stub.js (as in
 * map-explorer.browser.cjs) plus a one-line hook exposing the map so the test can move to a known station.
 * Checks: a station the server flags shows exactly one notice in the info window and in the panel; a normal
 * station shows none; the flagged station's map mark is drawn like any other station mark; 1440px and 390px.
 */
const fs = require('fs');
const path = require('path');
const KAKAO_STUB = fs.readFileSync(path.join(__dirname, 'fixtures', 'kakao-maps-stub.js'), 'utf8')
  + '\n;(function(){var p=window.kakao.maps.Map.prototype,g=p.getBounds;p.getBounds=function(){window.__cgMap=this;return g.apply(this,arguments);};})();\n';
const NOTICES = {
  placeholder: '원본 좌표가 대략적인 값입니다. 실제 위치와 수 km 차이가 날 수 있습니다.',
  far_from_address: '원본 좌표가 주소지에서 100km 넘게 떨어져 있습니다. 위치가 잘못 표시됐을 수 있습니다.',
  placeholder_far_from_address: '원본 좌표가 주소지와 멀고 대략적인 값입니다. 위치가 잘못 표시됐을 수 있습니다.',
};
// 줌 15 격자에서도 혼자 있는 far_from_address 충전소(주소지와 다른 곳에 찍힘)
const FLAGGED = { id: 'CGC00001', lat: 37.331717, lng: 127.4637585 };

module.exports = async function coordinateQualityRegressions(browser, BASE = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:10000', OUT = null) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); if (!ok) console.log('FAIL', name, detail ?? ''); };
  const api = async (p) => (await fetch(API + p)).json();

  const near = await api(`/api/locations?limit=1000&bbox=${FLAGGED.lng - 0.01},${FLAGGED.lat - 0.008},${FLAGGED.lng + 0.01},${FLAGGED.lat + 0.008}`);
  const flaggedRow = near.data.find((r) => r.station_id === FLAGGED.id);
  check('API: flagged station row carries coordinate_flag', flaggedRow?.coordinate_flag === 'far_from_address', flaggedRow);
  check('API: rows without a flag have no coordinate_flag key', near.data.filter((r) => r.station_id !== FLAGGED.id).every((r) => !('coordinate_flag' in r)));
  // 비교용 정상 충전소: 서울 도심 bbox에서 플래그 없는 첫 행(정상 행에는 키 자체가 없음)
  const seoul = await api('/api/locations?limit=1000&bbox=126.97,37.55,127.0,37.57');
  // 점 크기는 충전기 수로 정해지므로 의심 충전소와 충전기 수가 같은 정상 충전소를 고릅니다.
  const normalRow = seoul.data.find((r) => !('coordinate_flag' in r) && r.charger_count === flaggedRow?.charger_count)
    || seoul.data.find((r) => !('coordinate_flag' in r));
  check('API: city view has normal rows without the key; any flag present is a known value', normalRow && seoul.data.every((r) => !('coordinate_flag' in r) || r.coordinate_flag in NOTICES), seoul.data.length);

  async function open(width, height) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/kakaocdn|daumcdn|ERR_FAILED|net::/i.test(m.text())) errors.push(m.text()); });
    await page.route(/dapi\.kakao\.com\/v2\/maps\/sdk\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB }));
    await page.route(/kakaocdn\.net|daumcdn\.net/, (r) => r.abort());
    await page.goto(`${BASE}/regional-explorer`);
    await page.locator('.geo-explorer').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !!window.__cgMap && !!document.querySelector('.cg-mark-canvas'), null, { timeout: 15000 });
    return { ctx, page, errors };
  }
  async function settle(page) { await page.waitForTimeout(700); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(400); }
  async function goTo(page, lat, lng, level) {
    // 사용자가 지도를 움직인 것으로 알려 자동 '전국 보기' 맞춤을 멈춘 뒤(StationMap userMoved) 이동합니다.
    await page.evaluate(([la, ln, lv]) => { document.querySelector('.geo-kakao').dispatchEvent(new Event('wheel')); window.__cgMap.setLevel(lv); window.__cgMap.setCenter(new window.kakao.maps.LatLng(la, ln)); }, [lat, lng, level]);
    await settle(page);
  }
  const marks = (page) => page.evaluate(() => {
    const c = document.querySelector('.cg-mark-canvas');
    const rect = c.getBoundingClientRect();
    return (c.cgMarks || []).map((m) => ({ kind: m.kind, x: m.x + rect.left, y: m.y + rect.top, r: m.r, id: m.row?.station_id, stack: !!m.stack,
      flag: m.row?.coordinate_flag ?? null, chargers: m.row?.charger_count }));
  });
  const pixel = (page, m) => page.evaluate(([x, y]) => {
    const c = document.querySelector('.cg-mark-canvas');
    const rect = c.getBoundingClientRect(), k = c.width / rect.width;
    return Array.from(c.getContext('2d').getImageData(Math.round((x - rect.left) * k), Math.round((y - rect.top) * k), 1, 1).data);
  }, [m.x, m.y]);
  async function notes(page) {
    return page.evaluate(() => ({
      info: Array.from(document.querySelectorAll('.geo-infowin .geo-coord-note')).map((n) => n.textContent),
      panel: Array.from(document.querySelectorAll('.geo-station .geo-coord-note')).map((n) => n.textContent),
      all: document.querySelectorAll('.geo-coord-note').length,
    }));
  }
  async function clickStation(page, m) {
    await page.mouse.click(m.x, m.y);
    await page.locator('.geo-infowin').waitFor({ timeout: 4000 });
    await page.locator('.geo-station').waitFor({ timeout: 4000 });
    await page.waitForTimeout(200);
  }

  for (const [label, width, height] of [['1440px', 1440, 1000], ['390px', 390, 844]]) {
    const { ctx, page, errors } = await open(width, height);
    check(`${label}: no notice before any station is selected`, (await notes(page)).all === 0);
    const seen = {};
    for (const [kind, row] of [['flagged', { station_id: FLAGGED.id, latitude: FLAGGED.lat, longitude: FLAGGED.lng }], ['normal', normalRow]]) {
      if (!row) continue;
      await goTo(page, row.latitude, row.longitude, 2);
      await page.locator('.geo-map').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const m = (await marks(page)).find((x) => x.kind === 'station' && x.id === row.station_id);
      check(`${label}: ${kind} station drawn as a station mark at its original coordinate`, m, row.station_id);
      if (!m) continue;
      seen[kind] = { m, px: await pixel(page, m) };
      await clickStation(page, m);
      const n = await notes(page);
      if (kind === 'flagged') {
        check(`${label}: flagged station → one notice in the info window`, n.info.length === 1 && n.info[0] === NOTICES.far_from_address, n);
        check(`${label}: flagged station → one notice in the selected-station panel`, n.panel.length === 1 && n.panel[0] === NOTICES.far_from_address, n);
        const box = await page.evaluate(() => {
          const iw = document.querySelector('.geo-infowin').getBoundingClientRect();
          const map = document.querySelector('.geo-map').getBoundingClientRect();
          const note = document.querySelector('.geo-infowin .geo-coord-note').getBoundingClientRect();
          return { inside: iw.left >= map.left - 1 && iw.right <= map.right + 1 && iw.top >= map.top - 1 && iw.bottom <= map.bottom + 1,
            noteInside: note.left >= iw.left && note.right <= iw.right + 0.5 && note.bottom <= iw.bottom,
            docW: document.documentElement.scrollWidth, winW: window.innerWidth, iwH: Math.round(iw.height) };
        });
        check(`${label}: info window with notice stays inside the map, notice inside the window, no horizontal scroll`, box.inside && box.noteInside && box.docW <= box.winW, box);
      } else {
        check(`${label}: normal station → no notice in info window or panel`, n.all === 0, n);
      }
      if (OUT) {
        await page.locator('.geo-map').screenshot({ path: `${OUT}/coord_${width}_${kind}_infowin.png` });
        await page.locator('.geo-station').screenshot({ path: `${OUT}/coord_${width}_${kind}_panel.png` });
      }
      await page.locator('.geo-infowin-close').click();
    }
    if (seen.flagged && seen.normal) {
      const { m: a, px: pa } = seen.flagged, { m: b, px: pb } = seen.normal;
      check(`${label}: flagged and normal station marks drawn with the same colour and size`,
        pa.every((v, k) => Math.abs(v - pb[k]) <= 6) && (a.chargers !== b.chargers || a.r === b.r), { pa, pb, r: [a.r, b.r], chargers: [a.chargers, b.chargers] });
    }
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  const failed = results.filter((r) => !r.ok);
  return { status: failed.length ? 'FAIL' : 'PASS', checks: `${results.length - failed.length}/${results.length}`, failed, results };
};
