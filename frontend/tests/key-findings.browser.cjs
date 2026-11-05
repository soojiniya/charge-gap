/* Reusable real-browser regression: await require(thisFile)(playwrightPage, baseUrl, apiUrl).
 * Overview "주요 분석 발견": 화면 수치가 /api/regional-disparity(필터 없음) 응답에서 직접 계산한 값과 같은지,
 * 필터를 바꿔도 고정인지, Regional Explorer 격차 카드(#regional-gap)로 바로 이동하는 링크(새로고침·뒤로/앞으로·직접 URL 포함),
 * 1440px·390px 레이아웃, API 오류 시 다시 시도 상태를 확인합니다.
 */
module.exports = async function keyFindingsRegressions(page, baseUrl = 'http://127.0.0.1:15173', apiUrl = 'http://127.0.0.1:5000') {
  const checks = [];
  const check = (name, value, detail) => { if (!value) throw new Error(`${name}${detail ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`); checks.push(name); };
  const res = await page.request.get(`${apiUrl}/api/regional-disparity`);
  const { data } = await res.json();
  const short = (r) => (r.region_code === '12' ? '전남광주' : r.region_name);
  const pick = (key, f) => data.regions.map((r) => ({ name: short(r), code: r.region_code, v: f(r.metrics[key]) }));
  const ext = (rows) => { const s = [...rows].sort((a, b) => b.v - a.v || a.code.localeCompare(b.code)); return [s[0], s[s.length - 1]]; };
  const fast = pick('high_100kw', (m) => m.value_pct);
  const hhi = pick('operator_hhi', (m) => m.value);
  const cps = pick('chargers_per_station', (m) => m.value);
  const [fMax, fMin] = ext(fast);
  const [hMax, hMin] = ext(hhi);
  const xs = cps.map((p) => p.v); const ys = fast.map((p) => p.v);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const [mx, my] = [mean(xs), mean(ys)];
  const r = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  const rText = `${r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}`;
  const one = (n) => n.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const section = async () => {
    await page.locator('.kf-head').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.kf-card .kf-v').length >= 8, null, { timeout: 60000 });
    return page.evaluate(() => ({
      cards: [...document.querySelectorAll('.kf-card')].map((c) => c.innerText.replace(/\s+/g, ' ')),
      head: document.querySelector('.kf-head').innerText.replace(/\s+/g, ' '),
      dots: [...document.querySelectorAll('.kf-card svg')].map((s) => s.querySelectorAll('circle').length),
      order: [...document.querySelectorAll('main .grid > *')].map((e) => (e.classList.contains('kf-head') ? 'KF' : e.querySelector('.kpi') ? 'KPI' : e.classList.contains('kf-card') ? 'KFC' : 'O')).join(''),
      hscroll: document.documentElement.scrollWidth > innerWidth,
    }));
  };

  for (const [w, h] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    const s = await section();
    const [c1, c2, c3] = s.cards;
    check(`${w}: card 1 shows max/min 100kW share and difference from the API`, c1.includes(`${fMax.name} ${fMax.v.toFixed(2)}%`) && c1.includes(`${fMin.name} ${fMin.v.toFixed(2)}%`) && c1.includes(`${(fMax.v - fMin.v).toFixed(2)}%p`), { c1, fMax, fMin });
    check(`${w}: card 1 shows the national value`, c1.includes(`전국 ${data.national.high_100kw.value_pct.toFixed(2)}%`));
    check(`${w}: card 2 shows Pearson r from the 16 regions`, c2.includes(rText) && c2.includes('16개 지역'), { rText, c2 });
    check(`${w}: card 2 says correlation is not causation`, c2.includes('원인을 뜻하지 않습니다'));
    check(`${w}: card 3 shows max/national/min HHI`, c3.includes(`${hMax.name} ${one(hMax.v)}점`) && c3.includes(`${one(data.national.operator_hhi.value)}점`) && c3.includes(`${hMin.name} ${one(hMin.v)}점`), { c3 });
    check(`${w}: card 3 says HHI is not a monopoly/quality judgement`, c3.includes('독점 여부나 서비스 품질을 판정하는 지표가 아닙니다'));
    check(`${w}: basis line names source, date and filter scope`, /getChargerInfo/.test(s.head) && /2026-10-15/.test(s.head) && /필터와 무관/.test(s.head));
    check(`${w}: mini charts draw all 16 regions`, s.dots[0] === 16 && s.dots[1] === 16 && s.dots[2] === 16, s.dots);
    check(`${w}: section sits right after the KPI tiles`, /KPIKPIKPIKPIKFKFCKFCKFC/.test(s.order), s.order);
    check(`${w}: no horizontal page scroll`, !s.hscroll);
  }

  // 필터를 바꿔도 이 섹션은 전국 기준으로 고정
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/?region=11&type=04`, { waitUntil: 'networkidle' });
  const filtered = await section();
  check('filters do not change the section (fixed national basis)', filtered.cards[0].includes(`${fMax.name} ${fMax.v.toFixed(2)}%`) && filtered.cards[1].includes(rText));

  // 링크: Regional Explorer '전국 충전 인프라 구성 격차' 카드(#regional-gap)로 바로 이동
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await section();
  const hrefs = await page.locator('.kf-link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const want = [`/regional-explorer?region=${fMax.code}#regional-gap`, '/regional-explorer?gap_metric=chargers_per_station#regional-gap', `/regional-explorer?gap_metric=operator_hhi&region=${hMax.code}#regional-gap`];
  check('links go to the disparity card anchor with the matching metric/region', JSON.stringify(hrefs) === JSON.stringify(want), hrefs);
  const landed = async () => {
    await page.locator('#regional-gap .disparity-table tbody tr').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
    return page.evaluate(() => {
      const c = document.getElementById('regional-gap');
      const covered = Math.max(0, ...[...document.querySelectorAll('.filterbar, .mobile-bar')].map((b) => {
        const cs = getComputedStyle(b);
        return cs.display !== 'none' && (cs.position === 'sticky' || cs.position === 'fixed') ? b.getBoundingClientRect().bottom : 0;
      }));
      const top = c.getBoundingClientRect().top;
      return { top, covered, metric: c.querySelector('.disparity-toolbar select').value, summary: c.querySelector('.disparity-region-summary h3')?.textContent || '', visible: c.querySelector('.reveal').classList.contains('is-visible'), scrollY };
    });
  };
  const atCard = (s) => s.top >= s.covered && s.top <= s.covered + 40 && s.visible;
  for (const [w, h] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    const expect = [['high_100kw', fMax.name], ['chargers_per_station', null], ['operator_hhi', hMax.name]];
    for (let i = 0; i < 3; i++) {
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await section();
      await page.locator('.kf-link').nth(i).click();
      await page.locator('h1', { hasText: 'Regional Explorer' }).waitFor();
      const s = await landed();
      check(`${w}: link ${i + 1} lands on the disparity card below the fixed bars`, atCard(s), s);
      check(`${w}: link ${i + 1} applies gap_metric ${expect[i][0]}`, s.metric === expect[i][0], s);
      check(`${w}: link ${i + 1} keeps the region selection`, expect[i][1] ? s.summary.includes(expect[i][1]) : s.summary === '', s);
    }
    await page.reload({ waitUntil: 'networkidle' });
    check(`${w}: reload keeps the anchor position`, atCard(await landed()));
    await page.goBack();
    await page.locator('h1', { hasText: 'Overview' }).waitFor();
    await page.goForward();
    await page.locator('h1', { hasText: 'Regional Explorer' }).waitFor();
    check(`${w}: back then forward lands on the card again`, atCard(await landed()));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/regional-explorer?gap_metric=operator_hhi&region=${hMax.code}#regional-gap`, { waitUntil: 'networkidle' });
  const direct = await landed();
  check('direct URL with #regional-gap lands on the card with HHI', atCard(direct) && direct.metric === 'operator_hhi', direct);
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation').getByRole('link', { name: /Regional Explorer/ }).click();
  await page.locator('h1', { hasText: 'Regional Explorer' }).waitFor();
  await page.locator('#regional-gap .disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  check('sidebar menu still opens Regional Explorer at the top (map first)', (await page.evaluate(() => scrollY)) === 0 && !new URL(page.url()).hash);

  // API 오류: 다시 시도 버튼이 보이고 다른 카드는 영향 없음
  await page.route('**/api/regional-disparity**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'test' } }) }));
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('.kf-card [role=alert]').first().waitFor({ timeout: 60000 });
  check('API error shows an error state with retry in the section', (await page.locator('.kf-card [role=alert]').count()) >= 1 && (await page.locator('.kf-card').getByRole('button', { name: /다시/ }).count()) >= 1);
  check('KPI tiles still render when the section fails', (await page.locator('.kpi-value').count()) === 4);
  await page.unroute('**/api/regional-disparity**');
  return { status: 'PASS', checks: checks.length, details: checks };
};
