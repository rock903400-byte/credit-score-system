// @ts-check
const { test, expect } = require('@playwright/test');

const REQUIRED = {
  '#income': '50000',
  '#age': '40',
  '#loan': '300000',
  '#years': '5',
  '#rate': '3',
  '#shares': '50000',
};

async function fillRequired(page) {
  for (const [sel, val] of Object.entries(REQUIRED)) {
    await page.locator(sel).fill(val);
  }
}

test.describe('操作列 — 必填計數 / 待確認下拉', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('開頁：必填 0/6、待確認 9 項', async ({ page }) => {
    await expect(page.locator('#chipRequiredCount')).toHaveText('0/6');
    await expect(page.locator('#chipUnconfirmedCount')).toHaveText('9');
    await expect(page.locator('#chipRequired')).toHaveClass(/chip-todo/);
  });

  test('填完 6 個必填 → 必填 6/6 並轉為完成色', async ({ page }) => {
    await fillRequired(page);
    await expect(page.locator('#chipRequiredCount')).toHaveText('6/6');
    await expect(page.locator('#chipRequired')).toHaveClass(/chip-done/);
  });

  test('改一個評分下拉 → 待確認 −1，且該欄位不再有未確認標示', async ({
    page,
  }) => {
    await page.locator('#jcic').selectOption('5');
    await expect(page.locator('#chipUnconfirmedCount')).toHaveText('8');
    await expect(page.locator('#jcic')).not.toHaveClass(/select-untouched/);
    // 未確認 pill 從 label 移除
    const pills = page.locator('.untouched-pill');
    await expect(pills).toHaveCount(8);
  });

  test('已確認狀態寫入草稿：reload 後不會又變回未確認', async ({ page }) => {
    await page.locator('#jcic').selectOption('5');
    await page.locator('#career').selectOption('3');
    await page.waitForTimeout(150);
    await page.reload();
    await expect(page.locator('#chipUnconfirmedCount')).toHaveText('7');
    await expect(page.locator('#jcic')).not.toHaveClass(/select-untouched/);
    await expect(page.locator('#career')).not.toHaveClass(/select-untouched/);
  });

  test('年限 > 7 年被系統強制改為不動產 → 擔保品視為已確認', async ({
    page,
  }) => {
    await page.locator('#years').fill('10');
    await page.locator('#years').dispatchEvent('change');
    await expect(page.locator('#collateral')).toHaveValue('10');
    await expect(page.locator('#collateral')).not.toHaveClass(
      /select-untouched/
    );
  });

  test('點「待確認」晶片 → 捲到第一個未確認的下拉並聚焦', async ({ page }) => {
    await page.locator('#chipUnconfirmed').click();
    await expect(page.locator('#incomeStability')).toBeFocused();
  });
});

test.describe('結論條 — 一眼看到結論', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('計算後：結論條可見，含等級、額度、負債比與分流建議', async ({
    page,
  }) => {
    await fillRequired(page);
    await page.locator('#collateral').selectOption('5');
    await page.locator('#btnCalc').click();

    const bar = page.locator('#verdictBar');
    await expect(bar).toBeVisible();
    await expect(page.locator('#resGrade')).toHaveText(/[A-E]/);
    await expect(page.locator('#resLimit')).toBeVisible();
    await expect(page.locator('#resTotalDti')).toBeVisible();
    // 三級分流（A/B/C）純顯示，對應社內對保程序
    await expect(page.locator('#verdictTriage')).toContainText(/[ABC] 級/);
    await expect(page.locator('#verdictTriage')).toContainText('建議流程');
  });

  test('評分明細預設收合，點 summary 才展開', async ({ page }) => {
    await fillRequired(page);
    await page.locator('#collateral').selectOption('5');
    await page.locator('#btnCalc').click();

    const details = page.locator('#resultDetails');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(page.locator('#bd_ability_val')).toBeHidden();

    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(page.locator('#bd_ability_val')).toBeVisible();
  });

  test('尚有未確認下拉時，結論條顯示提醒', async ({ page }) => {
    await fillRequired(page);
    await page.locator('#btnCalc').click();
    const note = page.locator('#verdictUnconfirmed');
    await expect(note).toBeVisible();
    await expect(note).toContainText('維持系統預設值');
  });

  test('否決案件 → 結論條為 fail 樣式且分流為 C 級', async ({ page }) => {
    await fillRequired(page);
    await page.locator('#jcic').selectOption('veto');
    await page.locator('#btnCalc').click();

    await expect(page.locator('#verdictBar')).toHaveClass(/verdict-fail/);
    await expect(page.locator('#verdictText')).toHaveText('不予核貸');
    await expect(page.locator('#verdictTriage')).toContainText('C 級');
  });
});

test.describe('本社預設值 / 範例案件', () => {
  test('設為本社預設 → 清除草稿後仍自動帶入年限與利率', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.locator('#years').fill('7');
    await page.locator('#rate').fill('2.75');
    page.on('dialog', (d) => d.accept());
    await page.locator('#btnSavePrefs').click();

    await page.locator('#clearDraftBtn').click();
    await page.waitForLoadState('load');

    await expect(page.locator('#years')).toHaveValue('7');
    await expect(page.locator('#rate')).toHaveValue('2.75');
    await expect(page.locator('.pref-hint').first()).toBeVisible();
  });

  test('載入範例案件 → 直接出結果且待確認歸零', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    page.on('dialog', (d) => d.accept());
    await page.locator('#btnSampleCase').click();

    await expect(page.locator('#resultCard')).toBeVisible();
    await expect(page.locator('#verdictBar')).toBeVisible();
    await expect(page.locator('#chipUnconfirmedCount')).toHaveText('0');
    await expect(page.locator('#chipRequiredCount')).toHaveText('6/6');
  });
});

test.describe('版面 — 計算鈕永遠在視窗內', () => {
  test('桌機 1024×768：捲到頁尾，計算鈕仍可見', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('#btnCalc')).toBeInViewport();
  });

  test('手機 390×844：底部操作條可見，二～五節預設收起', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#btnCalc')).toBeInViewport();

    const cards = page.locator('.card.collapsible');
    await expect(cards.nth(0)).not.toHaveClass(/collapsed/);
    await expect(cards.nth(1)).not.toHaveClass(/collapsed/);
    await expect(cards.nth(2)).toHaveClass(/collapsed/);
    await expect(cards.nth(5)).toHaveClass(/collapsed/);
  });
});

test.describe('Stale banner 重算鈕', () => {
  test('改欄位 → 點 banner 上的重新計算 → stale 清除', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await fillRequired(page);
    await page.locator('#collateral').selectOption('5');
    await page.locator('#btnCalc').click();
    await expect(page.locator('#resultCard')).toBeVisible();

    await page.locator('#income').fill('60000');
    await page.locator('#income').dispatchEvent('change');
    await expect(page.locator('#staleBanner')).toBeVisible();

    await page.locator('#btnRecalc').click();
    await expect(page.locator('#resultCard')).not.toHaveClass(/stale/);
    await expect(page.locator('#staleBanner')).toBeHidden();
  });
});
