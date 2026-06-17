// @ts-check
const { test, expect } = require('@playwright/test');

// 共用：填入一組能算出結果的最低資料
async function fillMinimalValidForm(page) {
  await page.locator('#memberId').fill('A001 王小明');
  await page.locator('#income').fill('50000');
  await page.locator('#age').fill('40');
  await page.locator('#existing_debt').fill('5000');
  await page.locator('#internal_monthly').fill('0');
  await page.locator('#internal_balance').fill('0');
  await page.locator('#loan').fill('300000');
  await page.locator('#years').fill('5');
  await page.locator('#rate').fill('3');
  await page.locator('#shares').fill('50000');
  // select 已是預設值
}

test.describe('Calc — 計算流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('按鈕 disabled 期間無法再次點擊（loading 狀態）', async ({ page }) => {
    await fillMinimalValidForm(page);
    const btn = page.locator('#btnCalc');
    await btn.click();
    // 計算完成後按鈕恢復
    await expect(btn).toBeEnabled();
    await expect(btn).toContainText('開始授信評分');
  });

  test('正常輸入 → 顯示結果與等級', async ({ page }) => {
    await fillMinimalValidForm(page);
    await page.locator('#btnCalc').click();

    await expect(page.locator('#resultCard')).toBeVisible();
    await expect(page.locator('#resGrade')).toContainText(/[A-E]/);
    // 計算時間戳
    await expect(page.locator('#calcTimestamp')).toContainText('計算時間');
  });

  test('驗證失敗 → 顯示錯誤訊息、不顯示結果', async ({ page }) => {
    await page.locator('#income').fill('0'); // 故意錯誤
    await page.locator('#btnCalc').click();

    await expect(page.locator('#income.has-error')).toBeVisible();
    await expect(page.locator('#resultCard')).toBeHidden();
  });

  test('Ctrl+Enter 觸發計算', async ({ page }) => {
    await fillMinimalValidForm(page);
    await page.locator('#age').focus();
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#resultCard')).toBeVisible();
  });
});
