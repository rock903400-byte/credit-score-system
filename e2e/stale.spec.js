// @ts-check
const { test, expect } = require('@playwright/test');

async function fillAndCalculate(page) {
    await page.locator('#income').fill('50000');
    await page.locator('#age').fill('40');
    await page.locator('#existing_debt').fill('5000');
    await page.locator('#internal_monthly').fill('0');
    await page.locator('#internal_balance').fill('0');
    await page.locator('#loan').fill('300000');
    await page.locator('#years').fill('5');
    await page.locator('#rate').fill('3');
    await page.locator('#shares').fill('50000');
    await page.locator('#btnCalc').click();
    await expect(page.locator('#resultCard')).toBeVisible();
}

test.describe('Stale — 結果過期狀態', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('計算完成 → 結果卡無 .stale', async ({ page }) => {
        await fillAndCalculate(page);
        await expect(page.locator('#resultCard')).not.toHaveClass(/stale/);
        await expect(page.locator('#staleBanner')).toBeHidden();
        await expect(page.locator('#btnCalc')).not.toHaveClass(/btn-stale/);
    });

    test('改 number 欄位（失焦後）→ 出現 stale banner', async ({ page }) => {
        await fillAndCalculate(page);
        await page.locator('#loan').click();
        await page.locator('#loan').fill('400000');
        await page.locator('#loan').blur();  // 觸發 change 事件
        await expect(page.locator('#resultCard')).toHaveClass(/stale/);
        await expect(page.locator('#staleBanner')).toBeVisible();
        await expect(page.locator('#btnCalc')).toHaveClass(/btn-stale/);
    });

    test('改 select 欄位 → 立即觸發 stale', async ({ page }) => {
        await fillAndCalculate(page);
        await page.locator('#jcic').selectOption('5');
        await expect(page.locator('#resultCard')).toHaveClass(/stale/);
    });

    test('重新計算後 stale 清除', async ({ page }) => {
        await fillAndCalculate(page);
        await page.locator('#loan').fill('400000');
        await page.locator('#loan').blur();
        await expect(page.locator('#resultCard')).toHaveClass(/stale/);
        await page.locator('#btnCalc').click();
        await expect(page.locator('#resultCard')).not.toHaveClass(/stale/);
        await expect(page.locator('#staleBanner')).toBeHidden();
    });

    test('未計算過就改欄位 → 不觸發 stale', async ({ page }) => {
        // 結果卡未顯示時改欄位不該 stale
        await page.locator('#income').fill('99999');
        await page.locator('#income').blur();
        await expect(page.locator('#resultCard')).toBeHidden();
    });
});
