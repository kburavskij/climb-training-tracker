import { expect } from '@playwright/test';

const TINY_GIF = Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64');
const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');

const EXPECTED_BROWSER_DIAGNOSTICS = new Set([
  'Viewport argument key "interactive-widget" not recognized and ignored.'
]);

export async function stubDatasetMedia(page, { failGifs = false } = {}) {
  await page.route(/^https:\/\/raw\.githubusercontent\.com\/hasaneyldrm\/exercises-dataset\//, route => {
    const isGif = new URL(route.request().url()).pathname.endsWith('.gif');
    if (failGifs && isGif) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: isGif ? 'image/gif' : 'image/jpeg',
      headers: { 'cache-control': 'public, max-age=3600' },
      body: isGif ? TINY_GIF : TINY_JPEG
    });
  });
}

export function watchForBrowserProblems(page) {
  const problems = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if ((message.type() === 'error' || message.type() === 'warning')
      && !EXPECTED_BROWSER_DIAGNOSTICS.has(message.text())) {
      problems.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === 'http://127.0.0.1:4173' && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${url.pathname}`);
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    const reason = request.failure()?.errorText || 'unknown failure';
    if (url.origin === 'http://127.0.0.1:4173' && reason !== 'net::ERR_ABORTED') {
      problems.push(`request failed: ${url.pathname} (${reason})`);
    }
  });
  return () => expect(problems, problems.join('\n')).toEqual([]);
}

export async function waitForApp(page) {
  await page.goto('/');
  await expect(page.locator('#view-today')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

export function addLocalDays(value, amount) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
    .join('-');
}
