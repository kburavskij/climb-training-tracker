import { test, expect } from '@playwright/test';
import { stubDatasetMedia, waitForApp, watchForBrowserProblems } from './helpers.mjs';

test('catalog stays modular and supports filters, search, library add, and timer add', async ({ page }) => {
  const assertClean = watchForBrowserProblems(page);
  await stubDatasetMedia(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForApp(page);

  await page.locator('.bottom-nav [data-view="library"]').click();
  await expect(page.locator('#view-library')).toBeVisible();
  await expect(page.locator('.exercise-card')).toHaveCount(8);

  await page.locator('[data-action="open-catalog"]').click();
  const dialog = page.locator('#catalog-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#catalog-summary')).not.toContainText('Loading');

  const initialResultCount = await page.locator('.catalog-card').count();
  expect(initialResultCount).toBeGreaterThan(0);
  expect(initialResultCount).toBeLessThan(50);
  await expect(page.locator('[data-action="catalog-more"]')).toBeVisible();

  await page.locator('#catalog-focus').selectOption('all');
  await page.locator('#catalog-equipment').selectOption('roller');
  await expect(page.locator('.catalog-card').first()).toBeVisible();
  const rollerMetadata = await page.locator('.catalog-card .catalog-meta').allTextContents();
  expect(rollerMetadata.length).toBeGreaterThan(0);
  expect(rollerMetadata.every(value => /roller/i.test(value))).toBe(true);

  await page.locator('#catalog-equipment').selectOption('all');
  await page.locator('#catalog-search').fill('archer push up');
  const result = page.locator('.catalog-card').filter({ hasText: /archer push up/i }).first();
  await expect(result).toBeVisible();
  await result.getByRole('button', { name: /add/i }).click();

  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Done' }).click();
  const libraryCard = page.locator('.exercise-card').filter({ hasText: /archer push up/i }).first();
  await expect(libraryCard).toBeVisible();
  await expect(page.locator('.exercise-card')).toHaveCount(9);

  const storedExercise = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('crux-routine-v1'));
    return saved.exercises.find(exercise => exercise.sourceId === '3294');
  });
  expect(storedExercise).toMatchObject({
    sourceId: '3294',
    demo: 'dataset'
  });
  expect(storedExercise.name).toMatch(/archer push up/i);
  expect(storedExercise.imageUrl).toMatch(/\/images\/3294-[^/]+\.jpg$/);
  expect(storedExercise.gifUrl).toMatch(/\/videos\/3294-[^/]+\.gif$/);

  await libraryCard.locator('[data-action="library-add-timer"]').click();
  await expect(page.locator('#view-timer')).toBeVisible();
  await expect(page.locator('.queue-item').filter({ hasText: /archer push up/i })).toBeVisible();
  assertClean();
});

test('exercise preview is static for reduced motion and can explicitly animate', async ({ page }) => {
  const assertClean = watchForBrowserProblems(page);
  await stubDatasetMedia(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForApp(page);
  await page.locator('.bottom-nav [data-view="library"]').click();

  const warmup = page.locator('.exercise-card').filter({ hasText: /world greatest stretch/i }).first();
  await warmup.locator('button.demo-visual').click();
  const dialog = page.locator('#demo-dialog');
  const animation = dialog.locator('[data-demo-animation]');
  const toggle = dialog.locator('[data-action="toggle-demo-motion"]');

  await expect(dialog).toBeVisible();
  await expect(animation).toHaveAttribute('data-playing', 'false');
  await expect(animation).toHaveAttribute('src', /\/images\/1604-[^/]+\.jpg$/);
  await expect(toggle).toHaveAccessibleName(/play/i);

  await toggle.click();
  await expect(animation).toHaveAttribute('data-playing', 'true');
  await expect(animation).toHaveAttribute('src', /\/videos\/1604-[^/]+\.gif$/);
  await expect(toggle).toHaveAccessibleName(/pause/i);

  await toggle.click();
  await expect(animation).toHaveAttribute('data-playing', 'false');
  await expect(animation).toHaveAttribute('src', /\/images\/1604-[^/]+\.jpg$/);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await warmup.locator('button.demo-visual').click();
  await expect(animation).toHaveAttribute('data-playing', 'true');
  await expect(animation).toHaveAttribute('src', /\/videos\/1604-[^/]+\.gif$/);
  assertClean();
});
