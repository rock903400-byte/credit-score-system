// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Draft — 草稿存讀', () => {
  test('修改欄位 → reload → 草稿還原', async ({ page }) => {
    await page.goto('/');
    await page.locator('#memberId').fill('A00777 測試員');
    await page.locator('#income').fill('77777');
    await page.locator('#age').fill('35');
    // 給 localStorage 一點時間存
    await page.waitForTimeout(100);
    await page.reload();
    await expect(page.locator('#memberId')).toHaveValue('A00777 測試員');
    // C1：金額欄位有千分位
    await expect(page.locator('#income')).toHaveValue('77,777');
    await expect(page.locator('#age')).toHaveValue('35');
  });

  test('點擊清除草稿 → 重置表單', async ({ page }) => {
    await page.goto('/');
    await page.locator('#income').fill('88888');
    await page.waitForTimeout(100);
    page.on('dialog', (d) => d.accept());
    await page.locator('#clearDraftBtn').click();
    await page.waitForLoadState('load');
    await expect(page.locator('#income')).toHaveValue('');
  });

  test('整併模式勾選 → 草稿還原後既有貸款列表仍顯示', async ({ page }) => {
    await page.goto('/');
    await page.locator('#consolidationMode').check();
    await page.locator('.ext-row').nth(0).locator('.ext-monthly').fill('5000');
    await page.waitForTimeout(150);
    await page.reload();
    await expect(page.locator('#consolidationMode')).toBeChecked();
    await expect(page.locator('#internalExtGroup')).toBeVisible();
    // C1：金額欄位有千分位
    await expect(
      page.locator('.ext-row').nth(0).locator('.ext-monthly')
    ).toHaveValue('5,000');
  });

  test('整併模式：多筆列表與新增筆數寫入草稿', async ({ page }) => {
    await page.goto('/');
    await page.locator('#consolidationMode').check();
    await page.locator('.ext-row').nth(0).locator('.ext-monthly').fill('3000');
    await page.locator('#btnAddExtLoan').click();
    await page.locator('.ext-row').nth(1).locator('.ext-monthly').fill('2000');
    await page.waitForTimeout(150);
    await page.reload();
    await expect(page.locator('.ext-row')).toHaveCount(2);
    await expect(
      page.locator('.ext-row').nth(0).locator('.ext-monthly')
    ).toHaveValue('3,000');
    await expect(
      page.locator('.ext-row').nth(1).locator('.ext-monthly')
    ).toHaveValue('2,000');
  });

  test('C1：金額欄位輸入時即時加千分位', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#loan').fill('5000000');
    await page.waitForTimeout(50);
    await expect(page.locator('#loan')).toHaveValue('5,000,000');
    // 計算結果應正確（千分位不影響數值）
    await page.locator('#income').fill('60000');
    await page.locator('#age').fill('40');
    await page.locator('#shares').fill('100000');
    await page.locator('#years').fill('5');
    await page.locator('#rate').fill('3');
    await page.locator('#btnCalc').click();
    await expect(page.locator('#resLimit')).toBeVisible();
  });
});
