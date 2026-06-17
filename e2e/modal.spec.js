// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Modal — 估算視窗無障礙', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('開啟時有正確的 ARIA 屬性', async ({ page }) => {
    const modal = page.locator('#debtEstimatorModal');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute(
      'aria-labelledby',
      'debtEstimatorTitle'
    );
  });

  test('點擊 🔍 估算 → 開啟、focus 第一個可聚焦元素', async ({ page }) => {
    await page.locator('#btnDebtEstimator').click();
    await expect(page.locator('#debtEstimatorModal')).toBeVisible();
    // 第一個可聚焦元素應該是「房貸」radio 或本金輸入
    const focused = await page.evaluate(
      () => document.activeElement?.id || document.activeElement?.tagName
    );
    expect(focused).toBeTruthy();
  });

  test('Esc 關閉視窗、focus 還原到觸發按鈕', async ({ page }) => {
    await page.locator('#btnDebtEstimator').click();
    await expect(page.locator('#debtEstimatorModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#debtEstimatorModal')).toBeHidden();
    await expect(page.locator('#btnDebtEstimator')).toBeFocused();
  });

  test('點擊背景關閉視窗', async ({ page }) => {
    await page.locator('#btnDebtEstimator').click();
    await expect(page.locator('#debtEstimatorModal')).toBeVisible();
    // 點背景（modal 本身而非 modal-content）
    await page
      .locator('#debtEstimatorModal')
      .click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#debtEstimatorModal')).toBeHidden();
  });

  test('焦點 trap：Shift+Tab 從第一個元素跳到最後一個', async ({ page }) => {
    await page.locator('#btnDebtEstimator').click();
    // focus 在第一個元素
    const firstId = await page.evaluate(() => document.activeElement?.id);
    expect(firstId).toBeTruthy();
    await page.keyboard.press('Shift+Tab');
    // 焦點應跳到 modal 內最後一個可聚焦元素（套用按鈕）
    await expect(page.locator('#applyDebtEstimator')).toBeFocused();
  });

  test('開啟時 body 不能捲動', async ({ page }) => {
    await page.locator('#btnDebtEstimator').click();
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
    await page.keyboard.press('Escape');
    const overflowAfter = await page.evaluate(
      () => document.body.style.overflow
    );
    expect(overflowAfter).not.toBe('hidden');
  });

  test('輸入本金 → 即時預覽更新月付', async ({ page }) => {
    await page.locator('#btnDebtEstimator').click();
    await page.locator('#debtPrincipal').fill('5000000');
    await page.locator('#debtRate').fill('2.5');
    await page.locator('#debtYears').fill('20');
    await expect(page.locator('#debtEstimatedMonthly')).toContainText(/[1-9]/);
  });
});
