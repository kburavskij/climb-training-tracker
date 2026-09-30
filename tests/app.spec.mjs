import { test, expect } from '@playwright/test';
import { stubDatasetMedia, waitForApp, watchForBrowserProblems } from './helpers.mjs';

for (const viewport of [
  { name: 'desktop', size: { width: 1280, height: 900 }, trigger: '.sidebar [data-open-settings]' },
  { name: 'mobile', size: { width: 390, height: 844 }, trigger: '.topbar [data-open-settings]', nestedTarget: true }
]) {
  test(`${viewport.name} Settings opens and preserves cancel or save intent`, async ({ page }) => {
    const assertClean = watchForBrowserProblems(page);
    await page.setViewportSize(viewport.size);
    await waitForApp(page);

    const dialog = page.locator('#settings-dialog');
    const settingsButton = page.locator(viewport.trigger);
    const initialSettings = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('crux-routine-v1')).settings
    );
    const changedTheme = initialSettings.theme === 'dark' ? 'light' : 'dark';

    if (viewport.nestedTarget) await settingsButton.locator('use').click();
    else await settingsButton.click();
    await expect(dialog).toBeVisible();

    if (viewport.name === 'mobile') {
      const title = dialog.getByRole('heading', { name: 'Settings' });
      const closeButton = dialog.getByRole('button', { name: 'Close' });
      const saveButton = dialog.getByRole('button', { name: 'Save settings' });
      await expect(title).toBeVisible();
      await expect(closeButton).toBeVisible();
      await expect(saveButton).toBeVisible();
      await expect(title).toBeInViewport();
      await expect(closeButton).toBeInViewport();
      await expect(saveButton).toBeInViewport();

      const surface = await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const formRect = element.querySelector('form')?.getBoundingClientRect();
        const bodyRect = element.querySelector('.dialog-body')?.getBoundingClientRect();
        const footerRect = element.querySelector('.dialog-foot')?.getBoundingClientRect();
        const style = getComputedStyle(element);
        const viewport = window.visualViewport;
        return {
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
          form: formRect && { width: formRect.width, height: formRect.height },
          body: bodyRect && { width: bodyRect.width, height: bodyRect.height },
          footer: footerRect && { top: footerRect.top, bottom: footerRect.bottom, width: footerRect.width, height: footerRect.height },
          viewport: {
            left: viewport?.offsetLeft || 0,
            top: viewport?.offsetTop || 0,
            width: viewport?.width || innerWidth,
            height: viewport?.height || innerHeight
          },
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          backgroundColor: style.backgroundColor
        };
      });

      expect(surface.display).not.toBe('none');
      expect(surface.visibility).toBe('visible');
      expect(surface.opacity).toBeGreaterThan(0.99);
      expect(surface.backgroundColor).not.toMatch(/^(?:transparent|rgba\([^)]*,\s*0\))$/);
      expect(surface.rect.width).toBeGreaterThanOrEqual(320);
      expect(surface.rect.height).toBeGreaterThanOrEqual(400);
      expect(surface.form?.width).toBeGreaterThanOrEqual(300);
      expect(surface.form?.height).toBeGreaterThanOrEqual(390);
      expect(surface.body?.width).toBeGreaterThanOrEqual(300);
      expect(surface.body?.height).toBeGreaterThan(100);
      expect(surface.footer?.width).toBeGreaterThanOrEqual(300);
      expect(surface.footer?.height).toBeGreaterThanOrEqual(44);
      expect(surface.rect.left).toBeGreaterThanOrEqual(surface.viewport.left - 1);
      expect(surface.rect.top).toBeGreaterThanOrEqual(surface.viewport.top - 1);
      expect(surface.rect.right).toBeLessThanOrEqual(surface.viewport.left + surface.viewport.width + 1);
      expect(surface.rect.bottom).toBeLessThanOrEqual(surface.viewport.top + surface.viewport.height + 1);
      expect(surface.footer?.top).toBeGreaterThanOrEqual(surface.rect.top);
      expect(surface.footer?.bottom).toBeLessThanOrEqual(surface.rect.bottom + 1);
      const surfaceCenter = surface.rect.left + surface.rect.width / 2;
      const viewportCenter = surface.viewport.left + surface.viewport.width / 2;
      expect(Math.abs(surfaceCenter - viewportCenter)).toBeLessThanOrEqual(1);

      await closeButton.click();
      await expect(dialog).toBeHidden();
      await settingsButton.click();
      await expect(dialog).toBeVisible();
    }

    await dialog.locator('[name="weight"]').fill('81.5');
    await dialog.locator('[name="theme"]').selectOption(changedTheme);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const settingsAfterCancel = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('crux-routine-v1')).settings
    );
    expect(settingsAfterCancel.weightKg).toBe(initialSettings.weightKg);
    expect(settingsAfterCancel.theme).toBe(initialSettings.theme);

    await settingsButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[name="weight"]')).toHaveValue(String(initialSettings.weightKg || ''));
    await expect(dialog.locator('[name="theme"]')).toHaveValue(initialSettings.theme);
    await dialog.locator('[name="weight"]').fill('81.5');
    await dialog.locator('[name="theme"]').selectOption(changedTheme);
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(dialog).toBeHidden();

    const settingsAfterSave = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('crux-routine-v1')).settings
    );
    expect(settingsAfterSave.weightKg).toBe(81.5);
    expect(settingsAfterSave.theme).toBe(changedTheme);

    await settingsButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[name="weight"]')).toHaveValue('81.5');
    await expect(dialog.locator('[name="theme"]')).toHaveValue(changedTheme);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    assertClean();
  });
}

test('all primary views render without browser or network errors', async ({ page }) => {
  const assertClean = watchForBrowserProblems(page);
  await stubDatasetMedia(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForApp(page);

  for (const view of ['today', 'plan', 'timer', 'library', 'history', 'guide']) {
    await page.locator(`.sidebar [data-view="${view}"]`).click();
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    await expect(page.locator(`#view-${view} h2`).first()).toBeVisible();
  }

  await page.waitForTimeout(200);
  assertClean();
});

test('mobile timer keeps End visible, advances, ends, and deletes its saved workout', async ({ page }) => {
  const assertClean = watchForBrowserProblems(page);
  const timestamp = '2026-01-05T10:00:00.000Z';
  const seededState = {
    meta: {
      schemaVersion: 3,
      installationId: 'ci-installation',
      createdAt: timestamp,
      updatedAt: timestamp
    },
    settings: {
      theme: 'light',
      units: 'metric',
      weightKg: '',
      weekAnchor: '2026-01-05',
      sound: false,
      vibration: false,
      reminderLeadMinutes: 10,
      dayReminderTime: '08:00'
    },
    routines: [],
    exercises: [
      {
        id: 'ci-first',
        name: 'CI first movement',
        category: 'Custom',
        demo: 'none',
        sets: 1,
        workSec: 5,
        restSec: 5,
        instructions: 'Move smoothly.'
      },
      {
        id: 'ci-second',
        name: 'CI second movement',
        category: 'Custom',
        demo: 'none',
        sets: 1,
        workSec: 5,
        restSec: 0,
        instructions: 'Keep breathing.'
      }
    ],
    builderQueue: ['ci-first', 'ci-second'],
    activeTimer: null,
    completions: {},
    daySnapshots: {},
    sessions: [],
    reminders: [],
    daily: {},
    overrides: {},
    currentView: 'timer',
    selectedPlanWeek: 'A'
  };

  await page.addInitScript(state => {
    localStorage.setItem('crux-routine-v1', JSON.stringify(state));
  }, seededState);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#timer');
  await expect(page.locator('#view-timer')).toBeVisible();

  await page.locator('[data-action="timer-start"]').click();
  await expect(page.locator('#demo-dialog')).toBeVisible();
  await expect(page.locator('#demo-dialog-title')).toContainText('CI first movement');
  await expect(page.locator('#demo-dialog-start')).toBeVisible();
  await page.locator('#demo-dialog-start').click();

  await expect(page.locator('#timer-phase')).toHaveText('prep');
  await expect(page.locator('#timer-clock')).toHaveText(/0:0[67]/);
  await expect(page.locator('#timer-exercise')).toHaveText('CI first movement');
  await expect(page.locator('body')).toHaveClass(/workout-focus/);

  const endButton = page.locator('[data-action="timer-end"]');
  await expect(endButton).toBeVisible();
  await expect(endButton).toBeInViewport();
  const endBox = await endButton.boundingBox();
  expect(endBox).not.toBeNull();
  expect(endBox.height).toBeGreaterThanOrEqual(44);
  expect(endBox.y + endBox.height).toBeLessThanOrEqual(700);

  await page.locator('[data-action="timer-skip"]').click();
  await expect(page.locator('#timer-phase')).toHaveText('work');
  await page.locator('[data-action="timer-skip"]').click();
  await expect(page.locator('#timer-phase')).toHaveText('rest');
  await expect(page.locator('#timer-exercise')).toHaveText('CI second movement');
  await expect(page.locator('#timer-meta')).toContainText('up next exercise 2/2');

  await page.locator('[data-action="timer-skip"]').click();
  await expect(page.locator('#timer-phase')).toHaveText('prep');
  await expect(page.locator('#timer-exercise')).toHaveText('CI second movement');

  await endButton.click();
  await expect(page.locator('#confirm-dialog-title')).toHaveText('End this session?');
  await page.locator('[data-confirm-accept]').click();
  await expect(page.locator('.active-timer')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/workout-focus/);

  await page.locator('.bottom-nav [data-view="history"]').click();
  const savedWorkout = page.locator('.saved-session-list .log-row');
  await expect(savedWorkout).toHaveCount(1);
  await expect(savedWorkout).toContainText('ended early');
  await savedWorkout.locator('[data-action="delete-session"]').click();
  await expect(page.locator('#confirm-dialog-title')).toHaveText('Delete saved workout?');
  await page.locator('[data-confirm-accept]').click();
  await expect(page.locator('.saved-session-list .log-row')).toHaveCount(0);

  const sessionCount = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('crux-routine-v1'));
    return saved.sessions.length;
  });
  expect(sessionCount).toBe(0);
  assertClean();
});
