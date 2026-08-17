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

  test('LTV 覆蓋充足（300萬/1000萬）→ 債權保障 12/20 且明細含加成', async ({
    page,
  }) => {
    await fillMinimalValidForm(page);
    await page.locator('#loan').fill('3000000');
    await page.locator('#collateral').selectOption('10');
    await page.locator('#collateralZone').selectOption('other');
    await page.locator('#appraisalValue').fill('10000000');
    await page.locator('#houseAge').fill('5');
    await page.locator('#appraisalAge').fill('2');
    await page.locator('#mortgageAmount').fill('3600000');
    await page.locator('#btnCalc').click();
    await page.locator('#resultDetails').evaluate((el) => {
      el.open = true;
    });
    await expect(page.locator('#bd_protection_val')).toHaveText('12');
    await expect(page.locator('#bd_protection_detail')).toContainText(
      'LTV 加成 3'
    );
  });

  test('Bug 1 修復：補填合法數值後，即時清除該欄位的紅框與錯誤文字', async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 1. 空表單直接點擊計算 → 觸發驗證紅框
    await page.locator('#btnCalc').click();

    const incomeInput = page.locator('#income');
    await expect(incomeInput).toHaveClass(/has-error/);
    const group = incomeInput.locator(
      'xpath=ancestor::div[contains(@class, "form-group")][1]'
    );
    const errorMsg = group.locator('.error-msg');
    await expect(errorMsg).toBeVisible();
    expect(await errorMsg.innerText()).toContain('月收入');

    // 2. 補填月收入 50,000 → 紅框與錯誤文字應在鍵入當下立即清除
    await incomeInput.fill('50000');
    await expect(incomeInput).not.toHaveClass(/has-error/);
    await expect(errorMsg).toBeHidden();

    // 3. 補填年齡與借款金額 → 同樣即時清除
    const ageInput = page.locator('#age');
    await expect(ageInput).toHaveClass(/has-error/);
    await ageInput.fill('35');
    await expect(ageInput).not.toHaveClass(/has-error/);

    const loanInput = page.locator('#loan');
    await expect(loanInput).toHaveClass(/has-error/);
    await loanInput.fill('300000');
    await expect(loanInput).not.toHaveClass(/has-error/);

    // 4. 輸入負數測試再次觸發錯誤，改回正數立即消除
    await ageInput.fill('-5');
    await expect(ageInput).toHaveClass(/has-error/);
    await ageInput.fill('30');
    await expect(ageInput).not.toHaveClass(/has-error/);
  });

  test('載入範例案件 → 自動清除先前殘留的錯誤紅框', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 點擊計算觸發錯誤
    await page.locator('#btnCalc').click();
    await expect(page.locator('#income.has-error')).toBeVisible();

    // 載入範例案件
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('#btnSampleCase').click();

    // 驗證所有 has-error 均被清除且順利完成評分
    const errorCount = await page.locator('.has-error').count();
    expect(errorCount).toBe(0);
    await expect(page.locator('#resultCard')).toBeVisible();
  });
});
