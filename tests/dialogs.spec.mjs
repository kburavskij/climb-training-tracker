import { test, expect } from '@playwright/test';
import { stubDatasetMedia, waitForApp, watchForBrowserProblems } from './helpers.mjs';

async function expectUsableMobileDialog(page, selector) {
  const dialog = page.locator(selector);
  const frame = dialog.locator(':scope > .dialog-frame');
  const header = dialog.locator('.dialog-head');
  const body = dialog.locator('.dialog-body');
  const footer = dialog.locator('.dialog-foot');
  const headerClose = header.getByRole('button', { name: 'Close' });

  await expect(dialog).toBeVisible();
  await expect(frame).toBeVisible();
  await expect(header).toBeVisible();
  await expect(body).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(headerClose).toBeVisible();
  await expect(headerClose).toBeEnabled();
  await expect(headerClose).toBeInViewport();
  await expect(footer).toBeInViewport();

  const footerButtons = footer.getByRole('button');
  expect(await footerButtons.count()).toBeGreaterThan(0);
  for (const button of await footerButtons.all()) {
    if (!await button.isVisible()) continue;
    await expect(button).toBeEnabled();
    await expect(button).toBeInViewport();
    const box = await button.boundingBox();
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  }

  const layout = await dialog.evaluate(element => {
    const box = node => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    };
    const style = getComputedStyle(element);
    const viewport = window.visualViewport;
    const frame = element.querySelector(':scope > .dialog-frame');
    const regions = [
      document.documentElement,
      document.body,
      element,
      frame,
      ...element.querySelectorAll([
        ':scope > form',
        '.dialog-frame',
        '.dialog-head',
        '.dialog-body',
        '.dialog-foot',
        '.form-grid',
        '.field',
        '.stack',
        '.catalog-filters',
        '.catalog-results',
        '.catalog-card',
        '.schedule-actions',
        '.demo-stage',
        'input:not([type="hidden"])',
        'select',
        'textarea'
      ].join(','))
    ].filter((node, index, all) => all.indexOf(node) === index)
      .filter(node => {
        const nodeStyle = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return nodeStyle.display !== 'none' && nodeStyle.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
    const describe = node => {
      if (node === document.documentElement) return 'html';
      if (node === document.body) return 'body';
      if (node === element) return `#${element.id}`;
      return node.id ? `#${node.id}` : node.className || node.tagName.toLowerCase();
    };
    return {
      rect: box(element),
      frame: box(frame),
      header: box(element.querySelector('.dialog-head')),
      body: box(element.querySelector('.dialog-body')),
      footer: box(element.querySelector('.dialog-foot')),
      viewport: {
        left: viewport?.offsetLeft || 0,
        top: viewport?.offsetTop || 0,
        width: viewport?.width || innerWidth,
        height: viewport?.height || innerHeight
      },
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      backgroundColor: style.backgroundColor,
      overflow: regions.map(node => ({
        region: String(describe(node)),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth
      }))
    };
  });

  expect(layout.display).not.toBe('none');
  expect(layout.visibility).toBe('visible');
  expect(layout.opacity).toBeGreaterThan(0.99);
  expect(layout.backgroundColor).not.toMatch(/^(?:transparent|rgba\([^)]*,\s*0\))$/);
  expect(layout.rect.width).toBeGreaterThanOrEqual(280);
  expect(layout.rect.height).toBeGreaterThanOrEqual(140);
  expect(layout.frame.width).toBeGreaterThanOrEqual(280);
  expect(layout.frame.height).toBeGreaterThanOrEqual(140);
  expect(layout.header.height).toBeGreaterThan(40);
  expect(layout.body.height).toBeGreaterThan(0);
  expect(layout.footer.height).toBeGreaterThanOrEqual(44);
  expect(layout.rect.left).toBeGreaterThanOrEqual(layout.viewport.left - 1);
  expect(layout.rect.top).toBeGreaterThanOrEqual(layout.viewport.top - 1);
  expect(layout.rect.right).toBeLessThanOrEqual(layout.viewport.left + layout.viewport.width + 1);
  expect(layout.rect.bottom).toBeLessThanOrEqual(layout.viewport.top + layout.viewport.height + 1);
  expect(layout.header.top).toBeGreaterThanOrEqual(layout.rect.top - 1);
  expect(layout.footer.bottom).toBeLessThanOrEqual(layout.rect.bottom + 1);
  for (const region of layout.overflow) {
    expect(
      region.scrollWidth - region.clientWidth,
      `${selector} ${region.region} overflows horizontally`
    ).toBeLessThanOrEqual(1);
  }

  return { dialog, headerClose };
}

test('mobile dialog matrix keeps every modal visible, reachable, and contained', async ({ page }) => {
  const assertClean = watchForBrowserProblems(page);
  await stubDatasetMedia(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await waitForApp(page);

  const openView = async view => {
    await page.locator(`.bottom-nav [data-view="${view}"]`).click();
    await expect(page.locator(`#view-${view}`)).toBeVisible();
  };
  const checks = [
    {
      selector: '#settings-dialog',
      open: () => page.locator('.topbar [data-open-settings]').click(),
      footerClose: 'Cancel'
    },
    {
      selector: '#exercise-dialog',
      prepare: () => openView('library'),
      open: () => page.locator('#view-library [data-action="add-exercise"]').click(),
      footerClose: 'Cancel'
    },
    {
      selector: '#catalog-dialog',
      prepare: () => openView('library'),
      open: () => page.locator('#view-library [data-action="open-catalog"]').click(),
      footerClose: 'Done'
    },
    {
      selector: '#routine-dialog',
      prepare: () => openView('today'),
      open: () => page.locator('#view-today [data-action="add-routine"]').first().click(),
      footerClose: 'Cancel'
    },
    {
      selector: '#plan-dialog',
      prepare: () => openView('today'),
      open: () => page.getByRole('button', { name: 'Edit day' }).click(),
      footerClose: 'Cancel'
    },
    {
      selector: '#schedule-dialog',
      prepare: () => openView('today'),
      open: () => page.locator('#view-today [data-action="open-day-schedule"]').click(),
      footerClose: 'Done'
    },
    {
      selector: '#demo-dialog',
      prepare: () => openView('library'),
      open: () => page.locator('#view-library [data-action="preview-exercise"]').first().click(),
      footerClose: 'Back'
    },
    {
      selector: '#confirm-dialog',
      prepare: () => openView('library'),
      open: () => page.locator('#view-library [data-action="delete-exercise"]').first().click(),
      footerClose: 'Cancel'
    }
  ];

  for (const check of checks) {
    await check.prepare?.();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await check.open();
      const { dialog, headerClose } = await expectUsableMobileDialog(page, check.selector);
      if (check.selector === '#plan-dialog') {
        await expect(dialog.getByRole('heading')).toContainText('Edit');
      }
      if (check.selector === '#confirm-dialog') {
        const box = await dialog.boundingBox();
        expect(box?.height || Infinity).toBeLessThan(500);
      }
      const closeControl = cycle === 0
        ? headerClose
        : dialog.locator('.dialog-foot').getByRole('button', { name: check.footerClose });
      await closeControl.click();
      await expect(dialog).toBeHidden();
    }
  }

  assertClean();
});
