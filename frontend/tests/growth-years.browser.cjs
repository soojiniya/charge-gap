/* Reusable real-browser regression: await require(thisFile)(playwrightPage, baseUrl).
 * Growth Trends 연도 구간 선택: 시작 연도 목록은 종료 연도 이하, 종료 연도 목록은 시작 연도 이상만 표시하고,
 * 한쪽을 바꿔도 다른 쪽이 자동으로 초기화되지 않습니다. 빠른 선택 3개, 잘못된 주소 정리(API 400 없음),
 * 요약 KPI·그래프·표·제목이 같은 구간을 보여 주는지 확인합니다. 실행 중인 로컬 프런트엔드·백엔드가 필요합니다.
 */
module.exports = async function growthYearRegressions(page, baseUrl = 'http://127.0.0.1:15173') {
  const checks = [];
  const check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const bad = [];
  page.on('response', (r) => { if (r.url().includes('/api/growth') && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  const fromSel = () => page.locator('label.field', { hasText: '시작 연도' }).locator('select');
  const toSel = () => page.locator('label.field', { hasText: '종료 연도' }).locator('select');
  const options = async (sel) => (await sel.locator('option').evaluateAll((os) => os.map((o) => Number(o.value))));
  // 주소 갱신 직후 다시 그려지기 전에 읽지 않도록, 기대한 목록이 될 때까지 잠시 기다린 뒤 비교
  const listIs = async (sel, want) => {
    for (let i = 0; i < 50; i++) { if (same(await options(sel), want)) return true; await page.waitForTimeout(100); }
    return false;
  };
  const valueIs = async (sel, want) => {
    for (let i = 0; i < 50; i++) { if ((await sel.inputValue()) === want) return true; await page.waitForTimeout(100); }
    return false;
  };
  const settled = async () => {
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.querySelector('.skeleton-chart') && !document.querySelector('.card .refetching'), null, { timeout: 120000 });
  };
  // 요약 제목·KPI 포함 연도·표 첫/끝 연도·두 그래프의 x축 첫/끝 연도가 모두 같은 구간인지
  const shows = async (a, b) => {
    await page.locator('.card .card-title', { hasText: `${a}–${b}년 요약` }).first().waitFor({ timeout: 60000 });
    await settled();
    await page.waitForFunction(([x, y]) => {
      const t = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('연도별 통계 표'));
      const rows = t ? [...t.querySelectorAll('tbody tr')].map((r) => parseInt(r.cells[0].textContent, 10)) : [];
      return rows.length === y - x + 1 && rows[0] === x && rows[rows.length - 1] === y;
    }, [a, b], { timeout: 60000 });
    const info = await page.evaluate(() => {
      const kpi = [...document.querySelectorAll('.stat')].find((s) => s.textContent.includes('포함 연도'));
      const ticks = [...document.querySelectorAll('.card')]
        .filter((c) => /연간 충전기 설치 수|누적/.test(c.querySelector('.card-title')?.textContent || ''))
        .map((c) => [...c.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')].map((t) => parseInt(t.textContent, 10)).filter(Number.isFinite));
      const partial = [...document.querySelectorAll('.stat')].find((s) => s.textContent.includes('부분 연도 설치'));
      return { kpi: parseInt(kpi?.querySelector('.stat-value')?.textContent || '', 10), ticks, partialExcluded: !!partial?.querySelector('.is-excluded') };
    });
    return info.kpi === b - a + 1 && info.ticks.length === 2 && info.ticks.every((t) => t.length > 0 && t.every((y) => y >= a && y <= b))
      && info.partialExcluded === (b < 2026);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1) 종료 2020 → 시작 목록 2011–2020, 시작 연도 유지
  await page.goto(`${baseUrl}/growth-trends`);
  await settled();
  check('default lists: both 2011–2026', (await listIs(fromSel(), range(2011, 2026))) && (await listIs(toSel(), range(2011, 2026))));
  await fromSel().selectOption('2015');
  await page.waitForURL((u) => u.searchParams.get('from') === '2015');
  await toSel().selectOption('2020');
  await page.waitForURL((u) => u.searchParams.get('to') === '2020');
  check('end 2020 → start list is 2011–2020', await listIs(fromSel(), range(2011, 2020)));
  check('changing the end year keeps the start year', await valueIs(fromSel(), '2015'));
  check('2015–2020 is shown in title, KPI, charts and table', await shows(2015, 2020));

  // 2) 시작 2024 → 종료 목록 2024–2026. 종료가 시작보다 이르면 시작 목록에 없으므로 먼저 종료를 넓힘
  await toSel().selectOption('2026');
  await page.waitForURL((u) => !u.searchParams.has('to'));
  await fromSel().selectOption('2024');
  await page.waitForURL((u) => u.searchParams.get('from') === '2024');
  check('start 2024 → end list is 2024–2026', await listIs(toSel(), range(2024, 2026)));
  check('changing the start year keeps the end year (not reset)', (await valueIs(toSel(), '2026')) && !new URL(page.url()).searchParams.has('to'));
  await toSel().selectOption('2025');
  await page.waitForURL((u) => u.searchParams.get('to') === '2025');
  check('start list follows the new end year (2011–2025)', await listIs(fromSel(), range(2011, 2025)));
  check('2024–2025 is shown everywhere', await shows(2024, 2025));

  // 3) 시작 = 종료
  await toSel().selectOption('2024');
  await page.waitForURL((u) => u.searchParams.get('to') === '2024');
  check('start = end: both lists contain the shared year', (await listIs(toSel(), range(2024, 2026))) && (await listIs(fromSel(), range(2011, 2024))));
  check('single-year range 2024–2024 is shown everywhere', await shows(2024, 2024));

  // 4) 빠른 선택 3개
  const quick = (name) => page.getByRole('group', { name: '연도 구간 빠른 선택' }).getByRole('button', { name, exact: true });
  await quick('2020 이후').click();
  await page.waitForURL((u) => u.searchParams.get('from') === '2020' && !u.searchParams.has('to'));
  check('quick "2020 이후" → 2020–2026, pressed', (await shows(2020, 2026)) && (await quick('2020 이후').getAttribute('aria-pressed')) === 'true');
  await quick('완료 연도만').click();
  await page.waitForURL((u) => !u.searchParams.has('from') && u.searchParams.get('to') === '2025');
  check('quick "완료 연도만" → 2011–2025, pressed', (await shows(2011, 2025)) && (await quick('완료 연도만').getAttribute('aria-pressed')) === 'true');
  check('after a quick button the lists follow the range', (await listIs(fromSel(), range(2011, 2025))) && (await listIs(toSel(), range(2011, 2026))));
  await quick('전체').click();
  await page.waitForURL((u) => !u.searchParams.has('from') && !u.searchParams.has('to'));
  check('quick "전체" → 2011–2026, pressed', (await shows(2011, 2026)) && (await quick('전체').getAttribute('aria-pressed')) === 'true');

  // 5) 잘못된 주소 → 유효한 구간으로 정리, API 400 없음
  for (const [q, a, b, expect] of [
    ['from=2024&to=2020', 2024, 2026, '?from=2024'],
    ['from=1999&to=2020', 2011, 2020, '?to=2020'],
    ['from=2018&to=abc', 2018, 2026, '?from=2018'],
  ]) {
    await page.goto(`${baseUrl}/growth-trends?${q}`);
    await page.waitForURL((u) => u.search === expect, { timeout: 60000 });
    check(`invalid URL ?${q} is cleaned to ${expect} and shown as ${a}–${b}`, await shows(a, b));
  }
  check('no /api/growth request failed (no 400)', bad.length === 0);
  check('no error cards', (await page.locator('[role=alert]').count()) === 0);

  // 키보드: 선택 상자에 포커스 후 화살표로 바꿔도 같은 규칙
  await page.goto(`${baseUrl}/growth-trends?to=2020`);
  await settled();
  await fromSel().focus();
  check('keyboard focus reaches the start-year select', await fromSel().evaluate((el) => el === document.activeElement));
  // 누적값 설명: 2015–2021을 골라도 누적은 2011년부터의 전체 누적임을 제목·부제·KPI·표·툴팁·분석 문구가 같은 뜻으로 말함
  await page.goto(`${baseUrl}/growth-trends?from=2015&to=2021`);
  check('2015–2021 shown everywhere', await shows(2015, 2021));
  const cum = page.locator('.card', { has: page.locator('.card-title', { hasText: '연도별 누적 충전기 설치 추이' }) });
  check('cumulative card sub says the total counts from 2011 (not restarted)', /2011년부터의 전체 누적/.test(await cum.locator('.card-sub').innerText()) && /다시 세지 않음/.test(await cum.locator('.card-sub').innerText()));
  check('KPI label says 2011년부터', (await page.locator('.stat-label', { hasText: '구간 마지막 연도 누적' }).innerText()).includes('2011년부터'));
  check('table header says 2011년부터', (await page.locator('th', { hasText: '누적' }).first().innerText()).includes('2011년부터'));
  const firstRow = await page.evaluate(() => { const t = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('연도별 통계 표')); return [...t.querySelectorAll('tbody tr')][0].innerText; });
  check('2015 row shows the 2011-based cumulative (larger than its annual value)', (() => { const n = firstRow.match(/[\d,]+/g).map((x) => Number(x.replace(/,/g, ''))); return n[0] === 2015 && Math.max(...n.slice(1)) > Math.min(...n.slice(1)); })());
  const insight = await cum.innerText();
  check('insight text says 누적(2011년부터) and the range note says the cumulative is the full total', /누적\(2011년부터\)/.test(insight) && /누적값은 2011년부터의 전체 누적/.test(insight));
  const plot = cum.locator('.recharts-surface').first();
  const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(400);
  check('tooltip label says 누적 설치 (2011년부터)', (await page.locator('body').innerText()).includes('누적 설치 (2011년부터)'));
  return { status: 'PASS', checks: checks.length, details: checks, failedGrowthRequests: bad };
};
