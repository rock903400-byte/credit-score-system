// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Collapse — 摺疊功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('點擊 section-title 切換 collapsed 狀態', async ({ page }) => {
    const title = page.locator('.card.collapsible .section-title').first();
    const card = title.locator('xpath=..');

    await expect(card).not.toHaveClass(/collapsed/);
    await title.click();
    await expect(card).toHaveClass(/collapsed/);
    await title.click();
    await expect(card).not.toHaveClass(/collapsed/);
  });

  test('aria-expanded 與視覺狀態同步', async ({ page }) => {
    const title = page.locator('.card.collapsible .section-title').first();
    await expect(title).toHaveAttribute('aria-expanded', 'true');
    await title.click();
    await expect(title).toHaveAttribute('aria-expanded', 'false');
  });

  test('鍵盤 Enter 觸發摺疊', async ({ page }) => {
    const title = page.locator('.card.collapsible .section-title').first();
    await title.focus();
    await page.keyboard.press('Enter');
    await expect(title.locator('xpath=..')).toHaveClass(/collapsed/);
  });

  test('鍵盤 Space 觸發摺疊', async ({ page }) => {
    const title = page.locator('.card.collapsible .section-title').first();
    await title.focus();
    await page.keyboard.press('Space');
    await expect(title.locator('xpath=..')).toHaveClass(/collapsed/);
  });
});
