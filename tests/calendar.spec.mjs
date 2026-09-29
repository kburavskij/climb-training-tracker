import { test, expect } from '@playwright/test';
import { addLocalDays, waitForApp, watchForBrowserProblems } from './helpers.mjs';

test('mobile calendar navigates dates and cannot move sideways', async ({ page, context }) => {
  const assertClean = watchForBrowserProblems(page);
  await page.setViewportSize({ width: 320, height: 760 });
  await waitForApp(page);

  const selectedWeekDate = () => page.locator('.week-strip .calendar-day.selected').getAttribute('data-date');
  const initialDate = await selectedWeekDate();
  expect(initialDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await expect(page.locator('.calendar-toolbar')).toHaveCount(1);
  await expect(page.locator('.calendar-modes [aria-pressed="true"]')).toHaveText('Week');
  await expect(page.locator('.calendar-period-label strong')).not.toBeEmpty();

  const initialIndex = await page.locator('.week-strip .calendar-day').evaluateAll((days, selected) =>
    days.findIndex(day => day.dataset.date === selected), initialDate);
  const nearbyIndex = initialIndex === 6 ? 5 : initialIndex + 1;
  const nearbyDate = await page.locator('.week-strip .calendar-day').nth(nearbyIndex).getAttribute('data-date');
  await page.locator(`.week-strip [data-date="${nearbyDate}"]`).click();
  await expect(page.locator(`.week-strip [data-date="${nearbyDate}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`.week-strip [data-date="${nearbyDate}"]`).press(initialIndex === 6 ? 'ArrowRight' : 'ArrowLeft');
  await expect(page.locator(`.week-strip [data-date="${initialDate}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`.week-strip [data-date="${initialDate}"]`)).toBeFocused();

  await page.locator('[data-action="calendar-week-next"]').click();
  await expect(page.locator(`.week-strip [data-date="${addLocalDays(initialDate, 7)}"]`)).toHaveClass(/selected/);
  await page.locator('[data-action="calendar-week-prev"]').click();
  await expect(page.locator(`.week-strip [data-date="${initialDate}"]`)).toHaveClass(/selected/);

  await page.locator('[data-action="calendar-toggle-month"]').click();
  await expect(page.locator('.month-calendar')).toBeVisible();
  await expect(page.locator('.week-strip')).toHaveCount(0);
  await expect(page.locator('.calendar-modes [aria-pressed="true"]')).toHaveText('Month');
  const originalMonthLabel = await page.locator('.calendar-period-label strong').textContent();
  await page.locator('[data-action="calendar-month-next"]').click();
  await expect(page.locator('.calendar-period-label strong')).not.toHaveText(originalMonthLabel);
  await page.locator('[data-action="calendar-month-prev"]').click();
  await expect(page.locator('.calendar-period-label strong')).toHaveText(originalMonthLabel);

  const widths = await page.evaluate(() => {
    const selectors = ['html', 'body', '.shell', '.main', '.content', '.today-calendar', '.week-strip', '.month-calendar', '.month-grid'];
    return selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(element => ({
      selector,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft
    })));
  });
  for (const measurement of widths) {
    expect(measurement.scrollWidth - measurement.clientWidth, `${measurement.selector} overflows horizontally`).toBeLessThanOrEqual(1);
    expect(measurement.scrollLeft, `${measurement.selector} starts horizontally shifted`).toBe(0);
  }

  const calendar = page.locator('.today-calendar');
  const box = await calendar.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(100, box.height / 2));
  await page.mouse.wheel(500, 0);

  const cdp = await context.newCDPSession(page);
  const y = box.y + Math.min(120, box.height / 2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width - 20, y }]
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: box.x + 20, y }]
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);

  const horizontalOffsets = await page.evaluate(() => ({
    window: window.scrollX,
    html: document.documentElement.scrollLeft,
    body: document.body.scrollLeft,
    calendar: document.querySelector('.today-calendar').scrollLeft,
    week: document.querySelector('.week-strip')?.scrollLeft ?? 0,
    month: document.querySelector('.month-calendar')?.scrollLeft ?? 0
  }));
  expect(horizontalOffsets).toEqual({ window: 0, html: 0, body: 0, calendar: 0, week: 0, month: 0 });

  const selectableDate = await page
    .locator('.month-calendar .calendar-day:not(.selected):not(.outside-month)')
    .first()
    .getAttribute('data-date');
  await page.locator(`.month-calendar [data-date="${selectableDate}"]`).click();
  await expect(page.locator('.month-calendar')).toHaveCount(0);
  await expect(page.locator('.week-strip')).toBeVisible();
  await expect(page.locator(`.week-strip [data-date="${selectableDate}"]`)).toHaveClass(/selected/);
  await page.locator('[data-action="date-today"]').click();
  await expect(page.locator(`.week-strip [data-date="${initialDate}"]`)).toHaveClass(/selected/);

  const touchTargets = await page.locator('.calendar-toolbar button').evaluateAll(buttons =>
    buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  for (const target of touchTargets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  assertClean();
});
