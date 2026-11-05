/* Reusable real-browser regression for the Regional Explorer "두 지역 비교" section:
 * await require(thisFile)(playwrightPage, baseUrl, apiUrl). Requires a running local frontend/backend.
 * Checks: empty default, URL clean-up (invalid / same region), keyboard selection with replace history, disabled duplicate option,
 * swap/clear, A lavender / B teal, same-row card alignment, no horizontal overflow on mobile, evidence panel reuse,
 * filter basis note, top region filter not applied, cmp_* not carried to other pages, and the API request count. */
module.exports = async function regionCompareRegressions(page, baseUrl = 'http://127.0.0.1:4180', apiUrl = 'http://127.0.0.1:10000') {
  const checks = [];
  const metrics = {};
  const check = (name, value) => {
    if (!value) throw new Error(name);
    checks.push(name);
  };
  const path = `${baseUrl}/regional-explorer`;
  const selA = () => page.locator('.cmp-pick-card select').nth(0);
  const selB = () => page.locator('.cmp-pick-card select').nth(1);
  const params = () => new URL(page.url()).searchParams;
  const ready = async () => {
    await page.locator('.cmp-card').first().waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll('.cmp-card table').length >= 5 && !document.querySelector('.cmp-card .skeleton-chart') && document.querySelectorAll('.cmp-ops-col').length === 2,
      null,
      { timeout: 60000 },
    );
  };
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1) 기본값: 선택 없음
  await page.goto(path);
  await page.locator('.cmp-pick-card').waitFor();
  await page.waitForFunction(() => !document.querySelector('.cmp-pick-card select:disabled'));
  check('default: both selects empty', (await selA().inputValue()) === '' && (await selB().inputValue()) === '');
  check('default: no comparison cards rendered', (await page.locator('.cmp-card').count()) === 0);
  check('default: hint shown', (await page.locator('.cmp-hint').innerText()).includes('모두 선택'));
  check('default: no cmp params in URL', !params().has('cmp_a') && !params().has('cmp_b'));

  // 2) 잘못된 값 정리 (옛 광주 29, 잘못된 문자열)
  await page.goto(`${path}?cmp_a=29&cmp_b=41&type=bogus`);
  await page.waitForURL((u) => !u.searchParams.has('cmp_a') && !u.searchParams.has('type'));
  await page.waitForFunction(() => !document.querySelector('.cmp-pick-card select:disabled'));
  check('invalid cmp_a removed, valid cmp_b kept', params().get('cmp_b') === '41' && (await selB().inputValue()) === '41');
  check('one region only: hint asks for A', (await page.locator('.cmp-hint').innerText()).includes('지역 A'));

  // 3) 같은 지역: B를 비우고 안내 유지
  await page.goto(`${path}?cmp_a=11&cmp_b=11`);
  await page.waitForURL((u) => !u.searchParams.has('cmp_b'));
  await page.locator('.cmp-status .notice.warn').waitFor();
  await page.waitForFunction(() => !document.querySelector('.cmp-pick-card select:disabled'));
  check('same region: B removed and A kept', params().get('cmp_a') === '11' && (await selB().inputValue()) === '');
  check('same region: warning notice shown', (await page.locator('.cmp-status .notice.warn').innerText()).includes('같은 지역은 비교할 수 없습니다'));
  check('duplicate option disabled in B', await selB().locator('option[value="11"]').evaluate((o) => o.disabled));

  const reqs = new Map();
  const onReq = (r) => r.url().startsWith(apiUrl) && reqs.set(r, { url: r.url().slice(apiUrl.length), t0: Date.now() });
  const onRes = (res) => {
    const e = reqs.get(res.request());
    if (e) e.ms = Date.now() - e.t0;
  };
  page.on('request', onReq);
  page.on('response', onRes);
  // 4) 키보드로 B 선택 (Tab 이동 + 화살표) · replace 기록
  const histBefore = await page.evaluate(() => history.length);
  await selA().focus();
  await page.keyboard.press('Tab'); // 바꾸기 버튼
  await page.keyboard.press('Tab'); // 지역 B
  check('Tab order: A → swap → B', await selB().evaluate((e) => e === document.activeElement));
  await selB().selectOption('41'); // 네이티브 select: 키보드 선택과 같은 change 이벤트
  await page.waitForURL((u) => u.searchParams.get('cmp_b') === '41');
  const tFirst = Date.now();
  await ready();
  metrics.firstPairMs = Date.now() - tFirst;
  await page.waitForLoadState('networkidle');
  metrics.firstPairRequests = [...reqs.values()].map((e) => `${e.url} ${e.ms ?? '?'}ms`);
  reqs.clear();
  check('selection does not add history entries', (await page.evaluate(() => history.length)) === histBefore);
  check('notice cleared after a new selection', (await page.locator('.cmp-status .notice.warn').count()) === 0);

  // 5) 요청 수·응답 시간 (A·B 선택 후 비교 영역에 필요한 요청)
  const t0 = Date.now();
  await selA().selectOption('12');
  await page.waitForFunction(() => document.querySelector('.cmp-card thead .cmp-tag.cmp-a')?.textContent.includes('전남광주'), null, { timeout: 60000 });
  await ready();
  metrics.changeOneSideMs = Date.now() - t0;
  await page.waitForLoadState('networkidle');
  metrics.changeOneSideRequests = [...reqs.values()].map((e) => `${e.url} ${e.ms ?? '?'}ms`);
  reqs.clear();
  const t1 = Date.now();
  await selA().selectOption('11');
  await page.waitForFunction(() => document.querySelector('.cmp-card thead .cmp-tag.cmp-a')?.textContent.includes('서울'), null, { timeout: 60000 });
  await ready();
  metrics.backToCachedMs = Date.now() - t1;
  await page.waitForLoadState('networkidle');
  metrics.backToCachedRequests = [...reqs.values()].map((e) => `${e.url} ${e.ms ?? '?'}ms`);
  page.off('request', onReq);
  page.off('response', onRes);
  check('first pair needs at most 5 new API requests (charger-regions/output reuse the page cache)', metrics.firstPairRequests.length <= 5);
  check('changing one side needs at most 2 requests', metrics.changeOneSideRequests.length <= 2);
  check(`returning to a cached pair needs no compare requests (${metrics.backToCachedRequests.join('; ')})`, metrics.backToCachedRequests.filter((u) => /ev-registration|charger-types|charger-output|charger-regions|operators\?limit=3/.test(u)).length === 0);

  // 6) 색상: A 라벤더, B 청록
  const dot = (side) => page.locator(`.cmp-card .cmp-tag.cmp-${side} .cmp-dot`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  check('A is lavender', (await dot('a')) === 'rgb(164, 155, 200)');
  check('B is teal', (await dot('b')) === 'rgb(129, 173, 168)');
  const bar = (side) => page.locator(`.cmp-duo-row.cmp-${side} .cmp-duo-track i`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  check('bars use the same colours', (await bar('a')) === 'rgb(164, 155, 200)' && (await bar('b')) === 'rgb(129, 173, 168)');

  // 7) 같은 행 카드 정렬 (1440px: EV·충전 카드 나란히)
  const boxes = await page.locator('.cmp-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) })));
  check('EV and charger cards share a row with equal height', boxes[0].top === boxes[1].top && Math.abs(boxes[0].h - boxes[1].h) <= 1);
  check('composition card spans the full row', boxes[2].w > boxes[0].w * 1.8);
  check('1440px: tables fit, no scroll hint', (await page.locator('.cmp-scroll.is-overflow').count()) === 0 && (await page.locator('.cmp-table-wrap[tabindex]').count()) === 0);

  // 8) 분석 근거 패널 재사용 + 키보드로 닫기
  const ev = page.locator('.cmp-card [data-evidence-toggle]').first();
  await ev.focus();
  await page.keyboard.press('Enter');
  const dlg = page.locator('[role=dialog]');
  await dlg.waitFor();
  const dlgText = await dlg.innerText();
  check('evidence panel opens with the card title', dlgText.includes('전기차 등록 비교'));
  check('evidence panel shows the cross-date caution', /서로 나눈 지표/.test(dlgText));
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  check('focus returns to the evidence button', await ev.evaluate((e) => e === document.activeElement));

  // 9) 바꾸기 · 지역 필터 무시 · 유형 필터 적용 표시
  await page.locator('.cmp-swap').click();
  await page.waitForURL((u) => u.searchParams.get('cmp_a') === '41' && u.searchParams.get('cmp_b') === '11');
  await ready();
  await page.waitForFunction(() => document.querySelector('.cmp-card thead .cmp-tag.cmp-a')?.textContent.includes('경기'));
  check('swap exchanges A and B', (await selA().inputValue()) === '41' && (await selB().inputValue()) === '11');
  const firstCell = async () => page.locator('.cmp-card').nth(1).locator('tbody tr').first().locator('td').first().innerText();
  const before = await firstCell();
  await page.locator('.filterbar label.field', { hasText: '충전기 지역' }).locator('select').selectOption('26');
  await page.waitForURL((u) => u.searchParams.get('region') === '26');
  await ready();
  const afterRegion = await firstCell();
  check(`top region filter does not change the comparison (${before} → ${afterRegion})`, afterRegion === before);
  const evFindingsBeforeType = await page.locator('.cmp-card').first().locator('.insight-key').innerText();
  await page.locator('.filterbar label.field', { hasText: '충전기 유형' }).locator('select').selectOption('04');
  await page.waitForURL((u) => u.searchParams.get('type') === '04');
  await ready();
  check('type filter changes charger numbers', (await firstCell()) !== before);
  check('basis note lists the applied filter', (await page.locator('.cmp-basis').innerText()).includes('유형 04'));
  check('EV findings stay filter-independent', (await page.locator('.cmp-card').first().locator('.insight-key').innerText()) === evFindingsBeforeType);
  check('findings headers contain no auxiliary status', (await page.locator('.cmp-card .insight-key-head > :not(h3)').count()) === 0);

  // 10) 다른 페이지 링크에는 cmp_* 를 넘기지 않음
  const hrefs = await page.locator('nav a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('nav links do not carry cmp params', hrefs.length > 0 && hrefs.every((h) => !/cmp_/.test(h)));
  check('nav links carry the common filters', hrefs.some((h) => /type=04/.test(h)));

  // 11) 선택 해제
  await page.locator('.cmp-clear').click();
  await page.waitForURL((u) => !u.searchParams.has('cmp_a') && !u.searchParams.has('cmp_b'));
  await page.locator('.cmp-card').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  const left = await page.locator('.cmp-card').count();
  check(`clear removes both and the comparison cards (left ${left}, type=${params().get('type')})`, left === 0 && params().get('type') === '04');

  // 12) 모바일: 가로 넘침 없음, 카드 세로 배치
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${path}?cmp_a=12&cmp_b=50`);
  await ready();
  const m = await page.evaluate(() => ({
    over: document.documentElement.scrollWidth > innerWidth,
    tops: [...document.querySelectorAll('.cmp-card')].map((c) => Math.round(c.getBoundingClientRect().top)),
  }));
  check('390px: no horizontal page overflow', !m.over);
  check('390px: cards stack vertically', m.tops[0] < m.tops[1] && m.tops[1] < m.tops[2]);
  check('code 12 shown as 전남광주 (광주+전남 통합) in the select', (await selA().locator('option:checked').innerText()).includes('광주+전남 통합'));
  check('no error states', (await page.locator('.cmp-card .state.error').count()) === 0);
  // 390px 표 가로 스크롤: 넘치는 표에만 안내 문구·가장자리 그림자, 키보드 포커스 가능, 끝까지 밀면 오른쪽 그림자 해제
  // (카드는 처음 보일 때 다시 그려지므로 먼저 화면에 들인 뒤, 요소 핸들 대신 매번 선택자로 다시 찾습니다)
  for (let i = 0; i < 3; i++) {
    await page.locator('.cmp-card').nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await page.locator('.cmp-card .cmp-scroll.is-overflow').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await ready();
  const SC = '.cmp-card .cmp-scroll.is-overflow';
  check('390px: overflowing tables show a scroll hint', (await page.locator(`${SC} .cmp-scroll-hint`).count()) >= 1);
  check('390px: right-edge shadow marks hidden columns', await page.locator(SC).first().evaluate((e) => e.classList.contains('fade-end')));
  const wrap = page.locator(`${SC} .cmp-table-wrap`).first();
  check('390px: scrollable table is a labelled, focusable region', (await wrap.getAttribute('tabindex')) === '0' && (await wrap.getAttribute('role')) === 'region' && /가로 스크롤/.test(await wrap.getAttribute('aria-label')));
  await wrap.focus();
  await wrap.evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
  await page.waitForFunction((sel) => { const e = document.querySelector(sel); return e && !e.classList.contains('fade-end') && e.classList.contains('fade-start'); }, SC, { timeout: 10000 });
  check('390px: scrolled to the end removes the right shadow and adds the left one', true);
  return { checks, metrics };
};
