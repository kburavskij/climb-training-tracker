import { test, expect } from '@playwright/test';
import { stubDatasetMedia, waitForApp, watchForBrowserProblems } from './helpers.mjs';

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
