/* Reusable real-browser regression for card layout:
 *   const r = await require(thisFile)(page, baseUrl)  → { status, checks, details }
 * Needs a running production build and backend. At 1440px on every page: cards sharing a grid row have the same
 * top and bottom edges; opening "분석 근거 보기" opens the side panel (role=dialog) without changing any card height;
 * Tab stays in the panel, Esc closes it and focus returns to the button. The chart detail modal shows the evidence
 * inline (no nested panel button). The Overview "자료 해석 기준" keeps its three blocks.
 */
const PAGES = ['/', '/ev-registration', '/charging-infrastructure', '/regional-explorer', '/growth-trends', '/python-visualization'];

module.exports = async function cardLayoutRegressions(page, baseUrl = 'http://127.0.0.1:4173') {
  const checks = [];
  const check = (name, value, detail) => {
    if (!value) throw new Error(`${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
    checks.push(name);
  };
  await page.route(/dapi\.kakao\.com|kakaocdn\.net|daumcdn\.net/, (r) => r.abort());
  await page.setViewportSize({ width: 1440, height: 900 });

  const rows = () => page.evaluate(() => {
    const grid = document.querySelector('.main .grid');
    const items = [...grid.children].filter((el) => el.getBoundingClientRect().height > 0).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) };
    });
    const out = [];
    for (const it of items) {
      const row = out.find((x) => Math.abs(x.top - it.top) <= 2);
      if (row) row.items.push(it); else out.push({ top: it.top, items: [it] });
    }
    return out.filter((r) => r.items.length > 1).map((r) => Math.max(...r.items.map((x) => x.bottom)) - Math.min(...r.items.map((x) => x.bottom)));
  });
  const heights = () => page.evaluate(() => [...document.querySelectorAll('.main .card')].map((c) => Math.round(c.getBoundingClientRect().height)));

  for (const p of PAGES) {
    await page.goto(`${baseUrl}${p}`);
    await page.locator('h1').first().waitFor();
    await page.waitForLoadState('networkidle');
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(40); }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const spreads = await rows();
    check(`${p}: cards in the same row share top and bottom edges`, spreads.every((s) => s <= 1), spreads);
    check(`${p}: no <details> evidence left inside cards`, (await page.locator('.card details.insight-more').count()) === 0);

    const btn = page.locator('[data-evidence-toggle]').first();
    if (await btn.count()) {
      await btn.scrollIntoViewIfNeeded();
      const before = await heights();
      await btn.focus();
      await page.keyboard.press('Enter');
      const panel = page.locator('[role="dialog"][data-variant="panel"]');
      await panel.waitFor();
      const dts = await panel.locator('.evidence-title').allInnerTexts();
      check(`${p}: evidence panel has findings, purpose, method, reason, caution, source, variables`,
        ['주요 분석 결과', '분석 목적', '계산 방법', '그래프 선택 이유', '주의사항', '데이터 출처', '사용 변수'].every((t) => dts.some((d) => d.trim() === t)), dts);
      const glance = await panel.locator('.evidence-glance dt').allInnerTexts();
      check(`${p}: evidence panel summary shows source, basis date and calculation basis`, ['데이터 출처', '데이터 기준일', '계산 기준'].every((t) => glance.includes(t)), glance);
      check(`${p}: opening evidence does not change any card height`, JSON.stringify(await heights()) === JSON.stringify(before));
      check(`${p}: button reports expanded`, (await btn.getAttribute('aria-expanded')) === 'true');
      for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
      check(`${p}: focus stays inside the panel`, await panel.evaluate((el) => el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      check(`${p}: Esc closes the panel and focus returns to the button`, await btn.evaluate((el) => el === document.activeElement));
      // 카드 머리글의 그래프 설명(i) 버튼도 같은 패널을 열고, 닫으면 그 버튼으로 포커스가 돌아갑니다.
      const card = btn.locator('xpath=ancestor::section[contains(concat(" ", normalize-space(@class), " "), " card ")][1]');
      const info = card.locator('[data-info-toggle]');
      check(`${p}: card header has a graph info button`, (await info.count()) === 1);
      await info.focus();
      await page.keyboard.press('Enter');
      await panel.waitFor();
      // aria-expanded는 패널이 열린 직후 effect로 갱신되므로 잠깐 기다립니다(검사 시점 경쟁 방지).
      await info.evaluate((el) => new Promise((resolve) => {
        const t0 = Date.now();
        (function poll() { if (el.getAttribute('aria-expanded') === 'true' || Date.now() - t0 > 3000) resolve(); else setTimeout(poll, 25); })();
      }));
      check(`${p}: info button opens the same panel and reports expanded`, (await info.getAttribute('aria-expanded')) === 'true' && (await panel.locator('.evidence-glance').count()) === 1);
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      check(`${p}: Esc returns focus to the info button`, await info.evaluate((el) => el === document.activeElement));
    }

    const expand = page.locator('.main .card .icon-btn[aria-label$="상세 보기"]').first();
    if (await expand.count()) {
      await expand.scrollIntoViewIfNeeded();
      await expand.click();
      const modal = page.locator('[role="dialog"][data-variant="dialog"]');
      await modal.waitFor();
      if (await modal.locator('.insight').count()) {
        check(`${p}: chart modal shows evidence inline, without a nested panel button`,
          (await modal.locator('.insight-more.is-inline .evidence-title').count()) === 6 && (await modal.locator('[data-evidence-toggle]').count()) === 0);
      }
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'detached' });
      check(`${p}: chart modal closes with Esc`, true);
    }
  }

  await page.goto(`${baseUrl}/`);
  const notes = page.locator('section.card', { has: page.locator('.card-title', { hasText: '자료 해석 기준' }) });
  await notes.scrollIntoViewIfNeeded();
  await notes.locator('.note-list li').first().waitFor();
  const titles = await notes.locator('.notes-block-title').allInnerTexts();
  check('Overview 자료 해석 기준: three blocks (기준 시점, 지역 체계, 주의사항)', titles.length === 3 && /기준 시점/.test(titles[0]) && /지역 체계/.test(titles[1]) && /주의사항/.test(titles[2]), titles);
  const text = await notes.innerText();
  check('Overview 자료 해석 기준: dates, no-ratio rule and region mapping kept',
    ['2026-09', '2026-10-15', '서로 나누지 않습니다', '12 전남광주 (원본 명칭)', '12 전남광주통합특별시'].every((t) => text.includes(t)));
  await page.unroute(/dapi\.kakao\.com|kakaocdn\.net|daumcdn\.net/);
  return { status: 'PASS', checks: checks.length, details: checks };
};
