import { test, expect } from '@playwright/test';
import { stubDatasetMedia } from './helpers.mjs';

const LEGACY_WORKER_SOURCE = String.raw`
'use strict';
const APP_CACHE = 'crux-routine-v7-fixture';
const MEDIA_CACHE = 'crux-exercise-media-v7-fixture';
const ROOT = new URL('./', self.location.href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.put(new URL('index.html', ROOT), new Response(
      '<!doctype html><html><body><main id="legacy-shell">Legacy cached shell</main></body></html>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    ));
    await caches.open(MEDIA_CACHE);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(async () => (
    await caches.match(new URL('index.html', ROOT)) || Response.error()
  )));
});
`;

test('legacy controlled shell upgrades to v8, preserves data, and keeps the current shell offline', async ({ page, context }) => {
  let legacyWorkerRequests = 0;
  await context.route(/\/service-worker\.js\?legacy-upgrade-fixture=1$/, async route => {
    legacyWorkerRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'service-worker-allowed': '/' },
      body: LEGACY_WORKER_SOURCE
    });
  });
  await page.addInitScript(() => {
    if (location.pathname === '/' || location.pathname.endsWith('/index.html')) {
      const key = 'ci-current-shell-loads';
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || 0) + 1));
    }
  });

  await page.goto('/manifest.webmanifest');
  await page.evaluate(async () => {
    localStorage.setItem('ci-upgrade-sentinel', 'preserved');
    const registration = await navigator.serviceWorker.register('./service-worker.js?legacy-upgrade-fixture=1', {
      scope: './',
      updateViaCache: 'none'
    });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    if (!registration.active) throw new Error('Legacy fixture worker did not activate');
  });
  expect(legacyWorkerRequests).toBeGreaterThan(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('legacy-upgrade-fixture=1');
  expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
    'crux-routine-v7-fixture',
    'crux-exercise-media-v7-fixture'
  ]));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    navigator.serviceWorker.controller?.scriptURL.endsWith('/service-worker.js')
    && Number(sessionStorage.getItem('ci-current-shell-loads') || 0) >= 2
  ));
  await expect(page.locator('#view-today')).toBeVisible();
  await expect(page.locator('#pwa-update-status')).toContainText('Version 4.4');
  expect(await page.evaluate(() => localStorage.getItem('ci-upgrade-sentinel'))).toBe('preserved');

  const upgradedCaches = await page.evaluate(() => caches.keys());
  expect(upgradedCaches).toContain('crux-routine-v8');
  expect(upgradedCaches).not.toContain('crux-routine-v7-fixture');
  expect(upgradedCaches).not.toContain('crux-exercise-media-v7-fixture');

  await page.evaluate(async () => {
    const cache = await caches.open('crux-routine-v8');
    const stale = new Response('<!doctype html><main id="stale-shell">Stale cached shell</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
    const root = new URL('./', location.href);
    await Promise.all([
      cache.put(new URL('index.html', root), stale.clone()),
      cache.put(root, stale.clone())
    ]);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-today')).toBeVisible();
  await expect(page.locator('#stale-shell')).toHaveCount(0);
  const refreshedShell = await page.evaluate(async () => (
    await (await caches.match(new URL('index.html', location.href))).text()
  ));
  expect(refreshedShell).toContain("const APP_VERSION = '4.4'");

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-today')).toBeVisible();
  await expect(page.locator('#pwa-update-status')).toContainText('Version 4.4');
  expect(await page.evaluate(() => localStorage.getItem('ci-upgrade-sentinel'))).toBe('preserved');
  await context.setOffline(false);
});

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
    const favicon = document.querySelector('link[rel~="icon"]');
    if (favicon) urls.add(favicon.href);
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
