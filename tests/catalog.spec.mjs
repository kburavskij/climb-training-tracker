import { test, expect } from '@playwright/test';
import { stubDatasetMedia, waitForApp, watchForBrowserProblems } from './helpers.mjs';

const MEDIA_PLAYBACK_CONTROLS = [
  '.demo-play-badge',
  '.demo-motion-toggle',
  '[data-action="toggle-demo-motion"]',
  '[aria-label^="Play " i]',
  '[aria-label^="Pause " i]'
].join(', ');

async function expectAutomaticGif(scope, sourceId = '\\d{4}') {
  const animation = scope.locator('img[data-demo-animation]').first();
  await expect(animation).toHaveAttribute(
    'src',
    new RegExp(`/videos/${sourceId}-[^/]+\\.gif$`)
  );
  await expect(animation).toHaveAttribute('data-demo-state', 'animation');
  await expect(animation).toHaveAttribute('alt', /^Animated demonstration of /);
  await expect(scope.locator(MEDIA_PLAYBACK_CONTROLS)).toHaveCount(0);
}

async function expectSuspendedPoster(scope, sourceId, state = 'poster') {
  const animation = scope.locator('img[data-demo-animation]').first();
  await expect(animation).toHaveAttribute('src', new RegExp(`/images/${sourceId}-[^/]+\\.jpg$`));
  await expect(animation).toHaveAttribute('data-demo-state', state);
  await expect(animation).toHaveAttribute('alt', /^Still demonstration of /);
}

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
  await expectAutomaticGif(page.locator('.catalog-card').first());
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

test('exercise media stays animated without Play or Pause controls', async ({ page }) => {
  const assertClean = watchForBrowserProblems(page);
  await stubDatasetMedia(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForApp(page);
  await page.locator('.bottom-nav [data-view="library"]').click();

  const warmup = page.locator('.exercise-card').filter({ hasText: /world greatest stretch/i }).first();
  await expectAutomaticGif(warmup, '1604');

  await warmup.locator('[data-action="preview-exercise"]').click();
  const dialog = page.locator('#demo-dialog');

  await expect(dialog).toBeVisible();
  await expectAutomaticGif(dialog, '1604');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expectSuspendedPoster(dialog, '1604');

  await page.locator('.bottom-nav [data-view="timer"]').click();
  await expectSuspendedPoster(warmup, '1604');
  const firstQueueItem = page.locator('.queue-item').first();
  await expect(firstQueueItem).toBeVisible();
  await expectAutomaticGif(firstQueueItem, '1604');

  await page.locator('[data-action="timer-start"]').click();
  await expect(dialog).toBeVisible();
  await dialog.locator('#demo-dialog-start').click();
  const activeDemo = page.locator('.active-demo');
  await expect(activeDemo).toBeVisible();
  await expectAutomaticGif(activeDemo, '1604');
  await expect(page.locator(MEDIA_PLAYBACK_CONTROLS)).toHaveCount(0);
  assertClean();
});

test.describe('exercise media network fallback', () => {
  test.use({ serviceWorkers: 'block' });

  test('failed exercise GIF falls back to a decoded poster with an accurate still label', async ({ page }) => {
    await stubDatasetMedia(page, { failGifs: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForApp(page);
    await page.locator('.bottom-nav [data-view="library"]').click();

    const warmup = page.locator('.exercise-card').filter({ hasText: /world greatest stretch/i }).first();
    const media = warmup.locator('img[data-demo-animation]');
    await media.scrollIntoViewIfNeeded();
    await expect(media).toBeVisible();
    await expectSuspendedPoster(warmup, '1604', 'failed');
    await expect(media).toHaveAttribute('data-gif-failed', 'true');
    await expect(media).toHaveAttribute('alt', 'Still demonstration of World greatest stretch');
    await expect.poll(() => media.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  });
});
