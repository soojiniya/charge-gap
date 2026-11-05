/* Reusable real-browser regression for the Regional Explorer "전국 충전 인프라 구성 격차" UI:
 * await require(thisFile)(page, baseUrl). Requires a running local frontend/backend.
 * Checks: metric-named value columns, '전국 대비 차이' wording with units, left-aligned table cells,
 * selected-region summary (5 metrics) linked to the region filter/map, one keyboard stop per bar row,
 * rule-based sentences vs the API for 16 regions × 5 metrics, gap_metric/gap_type URL state (reload, back/forward,
 * invalid values), heatmap legend vs cell colors, and the info panel's calculation section. */
module.exports = async function regionalDisparityRegressions(page, baseUrl = 'http://127.0.0.1:4180') {
  const checks = [];
  const check = (name, value, detail) => {
    if (!value) throw new Error(`${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ''}`);
    checks.push(name);
  };
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/regional-explorer`);
  const card = page.locator('.disparity-card');
  await card.scrollIntoViewIfNeeded();
  await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });

  const metric = card.locator('.disparity-control select').first();
  const heads = async () => ({
    heat: await card.locator('.disparity-heat-head span').allInnerTexts(),
    bar: await card.locator('.disparity-bar-head span').allInnerTexts(),
    table: await card.locator('.disparity-table thead th').allInnerTexts(),
  });
  let h = await heads();
  check('heatmap value column is named after the metric', h.heat[1] === '100kW 이상 비중 (%)', h.heat);
  check("heatmap says '전국 대비 차이'", h.heat[2] === '전국 대비 차이', h.heat);
  check("bar header says '전국 대비 차이'", h.bar.includes('전국 대비 차이') && !h.bar.includes('차이'), h.bar);
  check('table headers carry units', h.table[2] === '100kW 이상 비중 (%)' && h.table[3] === '전국 대비 차이 (%p)', h.table);

  await metric.selectOption('chargers_per_station');
  await card.locator('.disparity-heat-head span', { hasText: '충전소당 충전기' }).waitFor();
  h = await heads();
  check('metric change renames the value column with its unit', h.heat[1] === '충전소당 충전기 (기/곳)' && h.table[3] === '전국 대비 차이 (기/곳)', h);
  await metric.selectOption('operator_hhi');
  await card.locator('.disparity-heat-head span', { hasText: 'HHI' }).waitFor();
  h = await heads();
  check('HHI shows its point unit', h.heat[1] === 'HHI (점, 0–10,000)' && h.table[3] === '전국 대비 차이 (점)', h);
  check('HHI values carry the unit', /점$/.test(await card.locator('.disparity-table tbody tr td').nth(2).innerText()));
  await metric.selectOption('high_100kw');

  const aligns = await card.locator('.disparity-table th, .disparity-table td').evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).textAlign))]);
  check('rank table cells are left-aligned', aligns.length === 1 && ['left', 'start'].includes(aligns[0]), aligns);

  check('summary panel invites a selection when no region is chosen', (await card.locator('.disparity-region-summary.is-empty').count()) === 1);
  const seoul = card.locator('.disparity-region', { hasText: '서울' });
  await seoul.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => u.searchParams.get('region') === '11');
  await card.locator('.disparity-region-summary:not(.is-empty)').waitFor();
  const summary = await card.locator('.disparity-region-summary').innerText();
  check('selected-region summary names the region and shows all 5 metrics', /서울/.test(summary) && (await card.locator('.disparity-region-metrics > div').count()) === 5, summary);
  check('selected-region summary shows rank and 전국 대비', /16개 지역 중 \d+위/.test(summary) && /전국 대비/.test(summary));
  check('each card shows value, rank line, one-line headline and a closed detail toggle',
    (await card.locator('.disparity-region-metrics > div').evaluateAll((els) => els.every((e) => e.querySelector('.disparity-region-value') && e.querySelector('.disparity-region-rank')
      && e.querySelector('.disparity-region-headline')?.textContent.trim() && e.querySelector('details.disparity-region-more:not([open]) summary')?.textContent === '상세 분석 보기'))));
  const fonts = await card.locator('.disparity-region-headline, .disparity-region-value').evaluateAll((els) => els.map((e) => [e.className, parseFloat(getComputedStyle(e).fontSize)]));
  check('headline ≥ 13px and the key value is larger than the headline', fonts.every(([c, f]) => (/headline/.test(c) ? f >= 13 : f >= 20)), fonts);
  const more = card.locator('[data-metric="high_100kw"] details.disparity-region-more');
  await more.locator('summary').click();
  check('상세 분석 보기 opens the full sentence', (await more.evaluate((e) => e.open)) && /출력값이 확인된 충전기/.test(await more.innerText()));
  await more.locator('summary').click();
  check('selected bar row is highlighted', (await card.locator('.disparity-bar-row.is-selected').count()) === 1);
  check('bar tracks are not separate tab stops', (await card.locator('.disparity-track[tabindex="-1"]').count()) === 16);
  await card.locator('.disparity-region-summary .btn', { hasText: '선택 해제' }).click();
  await page.waitForURL((u) => !u.searchParams.has('region'));
  await card.locator('.disparity-region-summary.is-empty').waitFor({ timeout: 10000 });
  check('clearing the summary clears the region filter', (await card.locator('.disparity-bar-row.is-selected').count()) === 0);

  /* ---- 분석 문장: 16개 지역 × 5개 지표를 API 값과 대조 ---- */
  const apiBase = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource').find((x) => /\/api\/regional-disparity/.test(x.name));
    return e ? new URL(e.name).origin : null;
  });
  check('page requested /api/regional-disparity', !!apiBase);
  const api = await (await fetch(`${apiBase}/api/regional-disparity`)).json();
  const pct = (n) => `${n.toFixed(2)}%`;
  const fmt = {
    high_100kw: (m) => pct(m.value_pct), chargers_per_station: (m) => `${m.value.toFixed(2)}기/곳`,
    operator_hhi: (m) => `${Math.round(m.value).toLocaleString('ko-KR')}점`, deletion_share: (m) => pct(m.value_pct),
  };
  const val = (m) => (m.value_pct ?? m.value);
  let sentenceChecks = 0;
  for (const r of api.data.regions) {
    await page.goto(`${baseUrl}/regional-explorer?region=${r.region_code}`);
    await card.locator('.disparity-region-summary:not(.is-empty)').waitFor({ timeout: 60000 });
    for (const key of ['high_100kw', 'chargers_per_station', 'type_mix', 'operator_hhi', 'deletion_share']) {
      const box = card.locator(`.disparity-region-metrics > div[data-metric="${key}"]`);
      const note = await box.locator('.disparity-region-note').textContent();
      const head = await box.locator('.disparity-region-headline').textContent();
      const rankText = await box.locator('.disparity-region-rank').textContent();
      let m = r.metrics[key], nat = api.data.national[key], f = fmt[key];
      if (key === 'type_mix') {
        m = r.metrics.type_mix.find((x) => x.charger_type_code === '04') ?? { value_pct: r.charger_count ? 0 : null, charger_count: 0 };
        nat = api.data.national.type_mix.find((x) => x.charger_type_code === '04');
        f = (x) => pct(x.value_pct);
      }
      if (val(m) == null) { check(`${r.region_code} ${key}: null value gets a state sentence`, /0기|분모 0|집계되지/.test(note) && /0기|분모 0|미집계/.test(head) && /순위 없음/.test(rankText), { note, head, rankText }); sentenceChecks++; continue; }
      const scale = key === 'operator_hhi' ? 1 : 100;
      const d = Math.round((val(m) - val(nat)) * scale) / scale;
      const dir = d > 0 ? '높습니다' : d < 0 ? '낮습니다' : '같은 수준';
      const tied = api.data.regions.filter((x) => (key === 'type_mix' ? x.metrics.type_mix.find((t) => t.charger_type_code === '04')?.rank : x.metrics[key].rank) === m.rank).length;
      check(`${r.region_code} ${key}: sentence carries API value, national, direction and rank`,
        note.includes(f(m)) && note.includes(`(${f(nat)})`) && note.includes(dir) && note.includes(`중 ${m.rank}위`) && (tied > 1) === /공동/.test(note), { note, value: f(m), dir, rank: m.rank, tied });
      check(`${r.region_code} ${key}: headline and rank line match the API`,
        head.includes(`(${f(nat)})`) && head.includes(dir) && rankText.includes(`지역 중 ${m.rank}위`) && (tied > 1) === /공동/.test(rankText) && !/(부족|위험|좋음|나쁨|좋습니다|나쁩니다)/.test(head), { head, rankText });
      if (m.numerator != null && key !== 'chargers_per_station') check(`${r.region_code} ${key}: numerator/denominator`, note.includes(`${m.numerator.toLocaleString('ko-KR')}기`) && note.includes(`${m.denominator.toLocaleString('ko-KR')}기`), note);
      check(`${r.region_code} ${key}: no good/bad or shortage wording`, !/(부족합니다|부족한|좋습니다|나쁩니다|우수|열악|취약|고장입니다)/.test(note), note);
      sentenceChecks++;
    }
  }
  check('80 region×metric sentences verified', sentenceChecks === 80, sentenceChecks);

  /* ---- 필터 변경 시 문장 갱신 ---- */
  await page.goto(`${baseUrl}/regional-explorer?region=11`);
  await card.locator('.disparity-region-summary:not(.is-empty)').waitFor({ timeout: 60000 });
  const before = await card.locator('[data-metric="high_100kw"] .disparity-region-note').textContent();
  const beforeHead = await card.locator('[data-metric="high_100kw"] .disparity-region-headline').textContent();
  await page.goto(`${baseUrl}/regional-explorer?region=11&type=02`);
  await card.locator('.disparity-region-summary:not(.is-empty)').waitFor({ timeout: 60000 });
  await page.waitForFunction((b) => document.querySelector('[data-metric="high_100kw"] .disparity-region-note')?.textContent !== b, before, { timeout: 30000 });
  check('changing the charger-type filter rewrites the sentences and headline', (await card.locator('[data-metric="high_100kw"] .disparity-region-note').textContent()) !== before
    && (await card.locator('[data-metric="high_100kw"] .disparity-region-headline').textContent()) !== beforeHead);

  /* ---- 0건 지역(필터로 충전기 0기)과 0값·공동 순위: 운영기관 PA로 좁혀 실제 응답에서 확인 ---- */
  const pa = await (await fetch(`${apiBase}/api/regional-disparity?operator_id=PA`)).json();
  const zeroRow = pa.data.regions.find((x) => x.charger_count === 0);
  const zeroValRow = pa.data.regions.find((x) => x.charger_count > 0 && x.metrics.high_100kw.numerator === 0);
  if (zeroRow && zeroValRow) {
    await page.goto(`${baseUrl}/regional-explorer?operator=PA&region=${zeroRow.region_code}`);
    await card.locator('.disparity-region-summary:not(.is-empty)').waitFor({ timeout: 60000 });
    const st = await card.locator('.disparity-region-metrics > div').evaluateAll((els) => els.map((e) => e.dataset.status));
    check('0-charger region: every metric is marked no-chargers (not 0%)', st.length === 5 && st.every((x) => x === 'no-chargers'), st);
    check('0-charger region: sentence says 0기 and excluded from ranks', /0기여서 이 지표를 계산하지 않았고 순위에서도 제외/.test(await card.locator('[data-metric="high_100kw"] .disparity-region-note').textContent()));
    const ranked = pa.data.regions.filter((x) => x.metrics.high_100kw.rank != null).length;
    await page.goto(`${baseUrl}/regional-explorer?operator=PA&region=${zeroValRow.region_code}`);
    await card.locator('.disparity-region-summary:not(.is-empty)').waitFor({ timeout: 60000 });
    const t = await card.locator('[data-metric="high_100kw"]').textContent();
    const tied = pa.data.regions.filter((x) => x.metrics.high_100kw.rank === zeroValRow.metrics.high_100kw.rank).length;
    check('0건 region (value 0.00%) is ranked, tied and counted against ranked regions only',
      /0\.00%/.test(t) && t.includes(`${ranked}개 지역 중 ${zeroValRow.metrics.high_100kw.rank}위(${tied}개 지역 공동)`) && /중 0기가 100kW 이상/.test(t), t);
    check('heatmap leaves 0-charger regions uncoloured', (await card.locator('.disparity-heat-row span[data-heat="none"]').count()) === pa.data.regions.filter((x) => x.metrics.high_100kw.value_pct == null).length);
  } else check('operator PA fixture has a 0-charger and a 0-value region', false, pa.data.regions.map((x) => x.charger_count));

  /* ---- URL 상태 ---- */
  await page.goto(`${baseUrl}/regional-explorer?region=11&cmp_a=26`);
  await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  await metric.selectOption('type_mix');
  await page.waitForURL((u) => u.searchParams.get('gap_metric') === 'type_mix');
  const typeSel = card.locator('.disparity-control select').nth(1);
  await typeSel.selectOption('02');
  await page.waitForURL((u) => u.searchParams.get('gap_type') === '02');
  let u = new URL(page.url());
  check('metric/type selection keeps other params', u.searchParams.get('region') === '11' && u.searchParams.get('cmp_a') === '26', u.search);
  await page.reload();
  await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  check('reload keeps metric and type', (await metric.inputValue()) === 'type_mix' && (await typeSel.inputValue()) === '02');
  await page.goBack();
  await page.waitForURL((x) => x.searchParams.get('gap_metric') === 'type_mix' && !x.searchParams.has('gap_type'));
  await page.waitForFunction(() => document.querySelectorAll('.disparity-control select')[1]?.value === '04');
  check('back: previous type restored', (await typeSel.inputValue()) === '04');
  await page.goBack();
  await page.waitForURL((x) => !x.searchParams.has('gap_metric'));
  await page.waitForFunction(() => document.querySelector('.disparity-control select')?.value === 'high_100kw');
  check('back again: default metric restored', (await metric.inputValue()) === 'high_100kw');
  await page.goForward();
  await page.waitForFunction(() => document.querySelector('.disparity-control select')?.value === 'type_mix');
  check('forward: metric re-applied', new URL(page.url()).searchParams.get('gap_metric') === 'type_mix');
  const navHrefs = await page.locator('nav a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('navigation links do not carry gap_* params', navHrefs.length > 0 && navHrefs.every((h) => !/gap_/.test(h)), navHrefs);

  await page.goto(`${baseUrl}/regional-explorer?gap_metric=bogus&gap_type=zz&region=11`);
  await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  await page.waitForURL((x) => !x.searchParams.has('gap_metric') && !x.searchParams.has('gap_type'));
  u = new URL(page.url());
  check('invalid gap params fall back to defaults and are removed', (await metric.inputValue()) === 'high_100kw' && u.searchParams.get('region') === '11', u.search);
  await page.goto(`${baseUrl}/regional-explorer?gap_metric=deletion_share&gap_type=02`);
  await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  await page.waitForURL((x) => x.searchParams.get('gap_metric') === 'deletion_share' && !x.searchParams.has('gap_type'));
  check('gap_type is dropped for non-type metrics', (await metric.inputValue()) === 'deletion_share');
  await page.goto(`${baseUrl}/regional-explorer?gap_metric=type_mix&gap_type=07&type=02`);
  await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  check('a valid type absent from the filtered data stays selectable (0기)', (await card.locator('.disparity-control select').nth(1).inputValue()) === '07'
    && /07.*0기/.test(await card.locator('.disparity-control select').nth(1).locator('option:checked').innerText()));

  /* ---- 범례와 히트맵 색 ---- */
  await page.goto(`${baseUrl}/regional-explorer?gap_metric=operator_hhi`);
  await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  const legend = await card.locator('.disparity-heat-legend').innerText();
  check('legend names +, −, 0 and the blank state in text', /높음 \(\+/.test(legend) && /낮음 \(−/.test(legend) && /차이 0/.test(legend) && /계산 불가/.test(legend), legend);
  const natHhi = Math.round(api.data.national.operator_hhi.value).toLocaleString('ko-KR');
  check('legend states the full-intensity threshold in the metric unit', legend.includes(`(${natHhi}점) 이상이면 가장 진합니다`), legend);
  const cells = await card.locator('.disparity-heat-row span[data-heat]').evaluateAll((els) => els.map((e) => ({ t: e.textContent, h: e.dataset.heat, bg: getComputedStyle(e).backgroundColor })));
  check('heat cell color family matches the sign of the difference', cells.length === 16 && cells.every((c) => (c.h === 'up') === c.t.startsWith('+') && (c.h === 'up' ? /129, 211, 203/ : /177, 157, 255/).test(c.bg)), cells);

  /* ---- 설명(i) 패널: 5개 지표 모두 한국어 계산 설명 + 접힌 기술 상세 ---- */
  const internal = /(output_kw|statId|chgerType|busiId|busiNm|delYn|zcode|numerator|denominator|Nationwide|nationwide|positive numeric|Descending competition)/;
  for (const key of ['high_100kw', 'chargers_per_station', 'type_mix', 'operator_hhi', 'deletion_share']) {
    await page.goto(`${baseUrl}/regional-explorer${key === 'high_100kw' ? '' : `?gap_metric=${key}`}`);
    await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
    await card.locator('[data-info-toggle]').click();
    const panel = page.locator('[role="dialog"]');
    await panel.waitFor();
    const titles = await panel.locator('.evidence-title').allInnerTexts();
    check(`${key}: info panel keeps the standard sections`, ['주요 분석 결과', '분석 목적', '계산 방법', '주의사항', '데이터 출처'].every((t) => titles.some((x) => x.includes(t))), titles);
    const labels = await panel.locator('.evidence-method-list dt').allInnerTexts();
    check(`${key}: Korean 계산식·분자·분모·전국 기준값 rows`, ['계산식', '분자', '분모', '전국 기준값'].every((x) => labels.includes(x)), labels);
    const natText = await panel.locator('.evidence-method-list > div', { hasText: '전국 기준값' }).innerText();
    check(`${key}: national basis explained in Korean with the current national value`, /평균이 아닙니다/.test(natText) && /=\s*\S+/.test(natText), natText);
    const tech = panel.locator('details.evidence-tech');
    const visible = await panel.innerText();
    check(`${key}: API 원문·내부 필드명 hidden by default`, !(await tech.evaluate((e) => e.open)) && !internal.test(visible) && !visible.includes(api.meta.metric_rules[key]), visible.match(internal));
    await tech.locator('summary').click();
    const techText = await tech.innerText();
    check(`${key}: 기술 상세 · API 원문 shows the original rule, national basis and fields`,
      techText.includes(api.meta.metric_rules[key]) && techText.includes(api.meta.national_basis) && techText.includes(api.meta.ranking_policy) && internal.test(techText)
        && (key !== 'deletion_share' || techText.includes(api.meta.deletion_warning)), techText.slice(0, 200));
    check(`${key}: info panel shows the data date`, /2026-10-15/.test(await panel.locator('.evidence-glance').innerText()));
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached' });
  }
  check('info panel interpretation is neutral', /좋고 나쁨으로 평가하지 않으며/.test(await card.locator('.insight-interp').innerText()));

  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  check('390px: no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('390px: rank table scrolls inside its own region', await card.locator('.disparity-table-wrap').evaluate((e) => e.getAttribute('role') === 'region' && e.tabIndex === 0));
  return { status: 'PASS', checks };
};
