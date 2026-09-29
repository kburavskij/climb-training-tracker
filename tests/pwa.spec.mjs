import { test, expect } from '@playwright/test';
import { stubDatasetMedia } from './helpers.mjs';

test('service worker caches the app shell and reloads it offline', async ({ page, context }) => {
  await stubDatasetMedia(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('#view-today')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await page.locator('.sidebar [data-view="library"]').click();
  await expect(page.locator('#view-library')).toBeVisible();

  const expectedUrls = await page.evaluate(async () => {
    const root = new URL('./', location.href);
    const manifestUrl = new URL(document.querySelector('link[rel="manifest"]').href);
    const manifest = await fetch(manifestUrl).then(response => response.json());
    const urls = new Set([
      root.href,
      new URL('index.html', root).href,
      new URL('exercise-catalog.json', root).href,
      manifestUrl.href,
      ...manifest.icons.map(icon => new URL(icon.src, manifestUrl).href)
    ]);
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon) urls.add(appleIcon.href);
    return [...urls];
  });

  const cacheAudit = await page.evaluate(async expected => {
    const cacheNames = (await caches.keys()).filter(name => name.startsWith('crux-routine-'));
    const missing = [];
    for (const url of expected) {
      if (!await caches.match(url)) missing.push(url);
    }
    return { cacheNames, missing };
  }, expectedUrls);
  expect(cacheAudit.cacheNames).toHaveLength(1);
  expect(cacheAudit.missing).toEqual([]);

  await page.evaluate(() => localStorage.setItem('ci-offline-sentinel', 'preserved'));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-library')).toBeVisible();
  await expect(page.locator('#top-title')).not.toBeEmpty();
  expect(await page.evaluate(() => localStorage.getItem('ci-offline-sentinel'))).toBe('preserved');

  await page.locator('[data-action="open-catalog"]').click();
  await expect(page.locator('#catalog-dialog')).toBeVisible();
  await expect(page.locator('#catalog-summary')).not.toContainText('Loading');
  await expect(page.locator('.catalog-card').first()).toBeVisible();

  const offlineFetches = await page.evaluate(async expected => Promise.all(expected.map(async url => {
    try {
      const response = await fetch(url);
      return { url, ok: response.ok, status: response.status };
    } catch (error) {
      return { url, ok: false, error: error.message };
    }
  })), expectedUrls);
  expect(offlineFetches.filter(result => !result.ok)).toEqual([]);

  await context.setOffline(false);
});
