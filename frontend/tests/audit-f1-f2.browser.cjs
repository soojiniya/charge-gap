/* Run with Playwright against a local production preview and the real local API.
 * No external map (Kakao SDK) is required. The delayed request exercises the filter race.
 */
module.exports = async function auditMapFilters(page, BASE, API) {
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok: !!ok, detail });
    if (!ok) throw new Error(name + ': ' + JSON.stringify(detail));
  };
  await page.route(/dapi\.kakao\.com|kakaocdn\.net|daumcdn\.net/, r => r.abort());
  const panel = () => page.locator('.geo-panel-section').filter({
    has: page.getByRole('heading', { name: '주요 운영기관', exact: true }),
  });
  async function operators(query) {
    const response = await page.request.get(API + '/api/operators?limit=5' + query);
    const data = (await response.json()).data;
    await page.waitForFunction(({ expected }) => {
      const section = [...document.querySelectorAll('.geo-panel-section')]
        .find(s => s.querySelector('h4')?.textContent === '주요 운영기관');
      const rows = [...(section?.querySelectorAll('.geo-bars li') || [])];
      return rows.length === expected.length && rows.every((r, i) =>
        r.textContent.includes(expected[i].operator_name) &&
        r.textContent.includes(expected[i].charger_count.toLocaleString('en-US')));
    }, { expected: data });
    check('operator rows exactly match API ' + (query || 'nationwide'),
      await panel().locator('.geo-bars li').count() === data.length,
      await panel().innerText());
  }
  await page.goto(BASE + '/regional-explorer?operator=PI');
  await operators('&operator_id=PI');
  await page.getByRole('button', { name: /필터 초기화/ }).click();
  await operators('');
  check('reset removes old PI rows', !/^차지비 PI|포스코ICT|GS커넥트/m.test(await panel().innerText()));

  await page.goto(BASE + '/regional-explorer');
  const oldButton = page.getByRole('button', { name: '삼성HW(Test) 지도에서 보기', exact: true });
  await oldButton.waitFor();
  await oldButton.click();
  await page.locator('.geo-station').waitFor();
  check('normal station selection works', (await page.locator('.geo-station').innerText()).includes('삼성HW'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let delayed = 0;
  const pattern = '**/api/locations?**';
  const delay = async route => {
    if (new URL(route.request().url()).searchParams.get('charger_type') === '09') {
      delayed++;
      await gate;
    }
    await route.continue().catch(() => {});
  };
  await page.route(pattern, delay);
  try {
    await page.locator('.filterbar select').nth(1).selectOption('09');
    await page.getByText('현재 필터와 일치하는 충전기가 없습니다.', { exact: false }).first().waitFor();
    check('type-09 locations request was delayed', delayed > 0, delayed);
    check('old station action cannot be selected while new request is pending',
      await oldButton.count() === 0 || await oldButton.isDisabled());
    check('selection clears on filter change', await page.locator('.geo-station').count() === 0);
    const response = page.waitForResponse(r => r.url().includes('/api/locations?') &&
      new URL(r.url()).searchParams.get('charger_type') === '09' && r.status() === 200);
    release();
    await response;
    await page.waitForTimeout(500);
    check('empty filter never restores stale station', await page.locator('.geo-station').count() === 0);
    await page.getByRole('button', { name: /필터 초기화/ }).click();
    await oldButton.waitFor();
    await oldButton.click();
    await page.locator('.geo-station').waitFor();
    check('normal selection still works after reset', (await page.locator('.geo-station').innerText()).includes('삼성HW'));
  } finally {
    release();
    await page.unroute(pattern, delay);
  }
  return { status: 'PASS', checks };
};
