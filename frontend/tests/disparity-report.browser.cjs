/* Real-browser regression for the "PDF 보고서" export of the regional-disparity card:
 * await require(thisFile)(page, baseUrl). Requires a running local frontend (with the production CSP headers) and backend.
 * Note: do not use page.route() in this test — Playwright's request interception also captures the report popup's
 * stylesheet request opened via window.open('') and stalls it, which looks like a CSP failure but is a test artifact.
 * Checks, for 5 metrics with and without a selected region:
 *  - the popup applies the same-origin report stylesheet under the site CSP (no unstyled Times New Roman page),
 *  - print() is called only after the stylesheet is applied,
 *  - Chromium's print engine lays the report out in exactly 3 A4 pages (01 요약 · 02 비교 · 03 계산/04 출처, 02·03은 새 페이지),
 *  - table cells do not clip text and numeric cells are right-aligned,
 *  - the national/region values in the report equal the values shown on the web table. */
module.exports = async function disparityReportRegressions(page, baseUrl = 'http://127.0.0.1:4180') {
  const checks = [];
  const check = (name, value, detail) => {
    if (!value) throw new Error(`${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ''}`);
    checks.push(name);
  };
  const ctx = page.context();
  await ctx.addInitScript(() => {
    window.print = () => {
      window.__printedSheets = document.styleSheets.length;
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  /* 상단 설명: 의미별 3줄(동적 필터 문구 유지), 클릭 안내 2줄, 내보내기 안내는 버튼을 누른 뒤에만 */
  await page.goto(`${baseUrl}/regional-explorer?type=04`);
  const top = page.locator('.disparity-card');
  await top.scrollIntoViewIfNeeded();
  await top.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  const basis = await top.locator('.disparity-basis > div').evaluateAll((els) => els.map((e) => [e.querySelector('dt').textContent, e.querySelector('dd').textContent]));
  check('conditions are split into 현재 적용 / 지역 필터 / 전국 기준 lines', basis.map((x) => x[0]).join() === '현재 적용,지역 필터,전국 기준', basis);
  check('현재 적용 line follows the filters (dynamic)', /유형 04/.test(basis[0][1]), basis[0]);
  check('selection hint is two lines', (await top.locator('.disparity-region-summary.is-empty .disparity-hint > span').count()) === 2);
  check('no export guide before a button is pressed', (await top.locator('.disparity-export-status').count()) === 0);
  const [guidePop] = await Promise.all([page.context().waitForEvent('page'), top.getByRole('button', { name: /PDF 보고서/ }).click()]);
  await top.locator('.disparity-export-status').waitFor();
  check('PDF guide appears after pressing PDF 보고서', /PDF로 저장/.test(await top.locator('.disparity-export-status').textContent()));
  await guidePop.close();
  await top.locator('.disparity-control select').first().selectOption('operator_hhi');
  await top.locator('.disparity-export-status').waitFor({ state: 'detached' });
  check('changing the metric clears the PDF guide', (await top.locator('.disparity-export-status').count()) === 0);
  await page.goto(`${baseUrl}/regional-explorer`);
  await top.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
  check('현재 적용 says no filters when none are set', (await top.locator('.disparity-basis dd').first().textContent()) === '유형·운영기관 필터 없음');

  const cases = [
    ['high_100kw', '27'], ['high_100kw', ''], ['chargers_per_station', '27'], ['type_mix', '27'],
    ['chargers_per_station', ''], ['type_mix', ''], ['operator_hhi', '27'], ['operator_hhi', ''], ['deletion_share', '27'], ['deletion_share', ''],
  ];
  for (const [metric, region] of cases) {
    const q = new URLSearchParams();
    if (region) q.set('region', region);
    if (metric !== 'high_100kw') q.set('gap_metric', metric);
    await page.goto(`${baseUrl}/regional-explorer?${q}`);
    const card = page.locator('.disparity-card');
    await card.scrollIntoViewIfNeeded();
    await card.locator('.disparity-table tbody tr').first().waitFor({ timeout: 60000 });
    if (region) await card.locator('.disparity-region-summary:not(.is-empty)').waitFor({ timeout: 60000 });
    const webRows = await card.locator('.disparity-table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].slice(0, 5).map((td) => td.textContent.trim())));
    const webNational = (await card.locator('.disparity-stat.is-key dd').textContent()).trim();
    const [pop] = await Promise.all([ctx.waitForEvent('page'), card.getByRole('button', { name: /PDF 보고서/ }).click()]);
    await pop.waitForFunction(() => window.__printedSheets !== undefined, null, { timeout: 15000 });
    const tag = `${metric}${region ? ' +region' : ''}`;
    const info = await pop.evaluate(() => ({
      printedSheets: window.__printedSheets,
      font: getComputedStyle(document.body).fontFamily,
      bg: getComputedStyle(document.body).backgroundColor,
      inlineStyle: document.querySelectorAll('style, [style]').length,
    }));
    check(`${tag}: print() runs after the report stylesheet is applied (site CSP kept)`, info.printedSheets === 1 && /IBM Plex Sans KR/.test(info.font) && info.inlineStyle === 0, info);
    await pop.evaluate(() => document.fonts.ready);
    await pop.emulateMedia({ media: 'print' });
    const layout = await pop.evaluate(() => {
      const cells = [...document.querySelectorAll('td, th')];
      return {
        clipped: cells.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent).slice(0, 3),
        numericAlign: [...new Set([...document.querySelectorAll('td.n')].map((c) => getComputedStyle(c).textAlign))],
        overlapX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        rows: [...document.querySelectorAll('.rpt-compare tbody tr:not(.is-national)')].map((tr) => [...tr.cells].map((td) => td.textContent.trim())),
        national: document.querySelector('.rpt-compare tr.is-national td.n')?.textContent.trim(),
        methodNational: [...document.querySelectorAll('.rpt-defs > div')].find((d) => d.querySelector('dt')?.textContent === '전국 기준값')?.querySelector('.num')?.textContent.trim(),
        breaks: ['.rpt-page-compare', '.rpt-page-method'].map((sel) => getComputedStyle(document.querySelector(sel)).breakBefore),
        hasSelected: !!document.querySelector('.rpt-selected'),
      };
    });
    check(`${tag}: no clipped table cells, numbers right-aligned, no horizontal overflow`, !layout.clipped.length && layout.numericAlign.join() === 'right' && !layout.overlapX, layout);
    check(`${tag}: national value in the table and in the formula section matches the web card`, layout.national === webNational && layout.methodNational === webNational, [layout.national, layout.methodNational, webNational]);
    check(`${tag}: 02 and 03 each start on a new page`, layout.breaks.join() === 'page,page', layout.breaks);
    // web table: 순위, 지역, 값, 전국 대비 차이, 분모 / report: 순위(+공동), 지역(+선택), 값, 막대, 차이, 분모
    const same = webRows.length === 16 && webRows.every((w, i) => {
      const r = layout.rows[i];
      return r && r[0].startsWith(w[0]) && r[1].replace(/선택$/, '') === w[1] && r[2] === w[2] && r[4] === w[3] && r[5] === w[4];
    });
    check(`${tag}: all 16 report rows equal the web table (rank, region, value, difference, denominator)`, same, { web: webRows.slice(0, 2), report: layout.rows.slice(0, 2) });
    check(`${tag}: selected-region block only when a region is selected`, layout.hasSelected === !!region);
    const pdf = await pop.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    check(`${tag}: report prints on exactly 3 A4 pages (01 · 02 · 03+04)`, pages === 3, pages);
    await pop.close();
  }
  return { status: 'PASS', checks };
};
