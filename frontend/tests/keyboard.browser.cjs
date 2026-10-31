/* Reusable real-browser regression: await require(thisFile)(playwrightPage, baseUrl).
 * Requires a running local frontend/backend; no production requests or dependencies added.
 */
module.exports = async function keyboardRegressions(page, baseUrl = 'http://127.0.0.1:15173') {
  const checks = [];
  const check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const input = page.getByRole('combobox', { name: '운영기관 검색 및 선택' });
  await input.click();
  const list = page.getByRole('listbox', { name: '운영기관', exact: true });
  await list.waitFor();
  const options = list.getByRole('option');
  const count = await options.count();
  check('operator results keep the existing 120-item display limit', count === 121);
  const expectedId = (await options.last().locator('span small').last().innerText()).trim();
  for (let i = 0; i < 125; i++) await input.press('ArrowDown');
  const active = await input.evaluate(el => {
    const node = document.getElementById(el.getAttribute('aria-activedescendant'));
    const list = node?.closest('[role=listbox]');
    const a = node?.getBoundingClientRect(), b = list?.getBoundingClientRect();
    return { exists: !!node,
      visible: !!a && !!b && a.top >= b.top - 1 && a.bottom <= b.bottom + 1 };
  });
  check('ArrowDown cannot point outside rendered options', active.exists);
  check('ArrowDown stops at the last rendered option', await input.getAttribute('aria-activedescendant') === await options.last().getAttribute('id'));
  check('keyboard-highlighted option is scrolled into view', active.visible);
  await input.press('Enter');
  await page.waitForURL(url => url.searchParams.get('operator') === expectedId);
  check('Enter selects exactly the visible highlighted operator', new URL(page.url()).searchParams.get('operator') === expectedId);
  await page.getByRole('button', { name: /필터 초기화/ }).click();
  await input.fill('no-matching-operator-zzzz');
  for (let i = 0; i < 5; i++) await input.press('ArrowDown');
  check('zero search results retain only the visible all-operators option', await list.getByRole('option').count() === 1);
  await input.press('Enter');
  check('zero-result Enter does not select a hidden operator', !new URL(page.url()).searchParams.has('operator'));
  await input.fill(expectedId);
  await input.press('ArrowDown');
  await input.press('Enter');
  await page.waitForURL(url => url.searchParams.get('operator') === expectedId);
  check('search then keyboard selection still works', true);
  await page.getByRole('button', { name: /필터 초기화/ }).click();
  await input.click();
  await input.press('Escape');
  check('Escape closes the operator list', await list.count() === 0);

  const opener = page.getByRole('button', { name: '지역별 전기차 등록 대수 상세 보기', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
  check('modal initially focuses its close button', await dialog.getByRole('button', { name: '닫기', exact: true }).evaluate(el => document.activeElement === el));
  check('background is inert while modal is open', await page.locator('#root').evaluate(el => el.inert));
  await page.keyboard.press('Shift+Tab');
  check('initial Shift+Tab stays inside modal', await inside());
  await page.keyboard.press('Tab');
  check('Tab wraps back to the first modal control', await dialog.getByRole('button', { name: '닫기', exact: true }).evaluate(el => document.activeElement === el));
  await page.evaluate(() => {
    const body = document.querySelector('[role=dialog] .modal-body');
    const disabled = document.createElement('button'); disabled.id = 'regression-disabled'; disabled.disabled = true; disabled.textContent = 'disabled fixture';
    const hidden = document.createElement('button'); hidden.id = 'regression-hidden'; hidden.hidden = true;
    body.append(disabled, hidden);
  });
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    check(`forward modal tab ${i + 1} remains inside`, await inside());
    check(`forward modal tab ${i + 1} skips disabled/hidden`, await page.evaluate(() => !document.activeElement.id.startsWith('regression-')));
  }
  await opener.evaluate(el => el.focus());
  check('programmatic background focus is blocked', await inside());
  await page.evaluate(() => { document.getElementById('regression-disabled').remove(); document.getElementById('regression-hidden').remove(); });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  check('Escape restores opener focus', await opener.evaluate(el => document.activeElement === el));
  check('modal cleanup restores background interactivity', await page.locator('#root').evaluate(el => !el.inert));

  // Also exercise a narrow viewport; no chart geometry or styling is changed.
  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click();
  await dialog.waitFor();
  await page.keyboard.press('Shift+Tab');
  check('narrow-viewport reverse tab remains inside modal', await inside());
  check('narrow modal remains within viewport', await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fonts = await page.evaluate(async () => {
    await Promise.all([400, 500, 600].map(w => document.fonts.load(`${w} 14px "IBM Plex Sans KR"`, '전기차 충전소')));
    await document.fonts.ready;
    return { family: getComputedStyle(document.body).fontFamily,
      weights: [400, 500, 600].map(w => document.fonts.check(`${w} 14px "IBM Plex Sans KR"`, '전기차 충전소')) };
  });
  check('Korean font weights load in the actual browser', fonts.weights.every(Boolean));
  return { status: 'PASS', checks: checks.length, details: checks, fonts };
};
