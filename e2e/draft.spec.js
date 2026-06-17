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
        await expect(page.locator('#income')).toHaveValue('77777');
        await expect(page.locator('#age')).toHaveValue('35');
    });

    test('點擊清除草稿 → 重置表單', async ({ page }) => {
        await page.goto('/');
        await page.locator('#income').fill('88888');
        await page.waitForTimeout(100);
        page.on('dialog', d => d.accept());
        await page.locator('#clearDraftBtn').click();
        await page.waitForLoadState('load');
        await expect(page.locator('#income')).toHaveValue('');
    });

    test('整併模式勾選 → 草稿還原後第二筆欄位仍顯示', async ({ page }) => {
        await page.goto('/');
        await page.locator('#consolidationMode').check();
        await page.locator('#internal_monthly2').fill('5000');
        await page.waitForTimeout(100);
        await page.reload();
        await expect(page.locator('#consolidationMode')).toBeChecked();
        await expect(page.locator('#internal2Group')).toBeVisible();
        await expect(page.locator('#internal_monthly2')).toHaveValue('5000');
    });
});
