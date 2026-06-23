// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Smoke — 頁面載入', () => {
  test('載入首頁、標題正確、6 個摺疊區塊可見', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');

    await expect(page).toHaveTitle(/信用評分/);
    await expect(page.locator('h1')).toContainText('信用評分與核貸試算系統');

    const sections = page.locator('.card.collapsible .section-title');
    await expect(sections).toHaveCount(6);

    // 過濾已知可忽略錯誤（例如 404 favicon）
    const real = errors.filter((e) => !/favicon/i.test(e));
    expect(real, real.join('\n')).toEqual([]);
  });

  test('申請日期預設為今天', async ({ page }) => {
    await page.goto('/');
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    await expect(page.locator('#appDate')).toHaveValue(today);
  });
});
