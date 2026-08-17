// @ts-check
const { test, expect } = require('@playwright/test');

// 18 個真實承辦情境 — 以人的角度檢視系統行為

async function fillForm(page, data) {
  // 共用：先重置 + 填表
  const fields = {
    memberId: '#memberId',
    income: '#income',
    age: '#age',
    existing_debt: '#existing_debt',
    internal_monthly: '#internal_monthly',
    internal_balance: '#internal_balance',
    loan: '#loan',
    years: '#years',
    rate: '#rate',
    shares: '#shares',
    livingExpense: '#livingExpense',
    dependentExpense: '#dependentExpense',
  };
  for (const [k, v] of Object.entries(data)) {
    if (fields[k]) await page.locator(fields[k]).fill(String(v));
  }
}

// 5P 明細（長條、DTI 尺規）預設收在 <details> 裡，
// 讀取其中的值前先展開。
async function openResultDetails(page) {
  await page.locator('#resultDetails').evaluate((el) => {
    el.open = true;
  });
}

test.describe('場景 1-6：常見優質案件', () => {
  test('① A 級模範生：公務人員 30 歲借 30 萬/5 年', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 50000,
      age: 30,
      existing_debt: 0,
      loan: 300000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    // 公教人員 + 5 年以上年資
    await page.locator('#incomeStability').selectOption('9');
    await page.locator('#tenure').selectOption('6');
    await page.locator('#interaction').selectOption('10'); // 不間斷儲蓄
    await page.locator('#jcic').selectOption('10'); // 無瑕疵
    await page.locator('#membership').selectOption('5'); // 5年以上
    await page.locator('#collateral').selectOption('5'); // 股金2倍內
    await page.locator('#career').selectOption('6');
    await page.locator('#participation').selectOption('4');
    await page.locator('#btnCalc').click();

    const grade = await page.locator('#resGrade').innerText();
    const status = await page.locator('#resStatus').innerText();
    console.log(
      `  → 等級 ${grade}，狀態：${status.replace(/\s+/g, ' ').slice(0, 30)}`
    );
    expect(['A', 'B']).toContain(grade);
    expect(status).toContain('裁量參考');
  });

  test('② 7 年紅線：年限 8 年時系統強制鎖定不動產', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 45000,
      age: 35,
      existing_debt: 0,
      loan: 500000,
      years: 8,
      rate: 3,
      shares: 100000,
    });
    // 系統應自動切到 10（不動產），且鎖定訊息顯示
    const val = await page.locator('#collateral').inputValue();
    const lockMsg = page.locator('#collateralLockMsg');
    await expect(lockMsg).toBeVisible();
    expect(val).toBe('10');
    console.log(`  → 年限 8 年：collateral 自動 = ${val}，鎖定訊息已顯示`);

    // 用 evaluate 把 collateral 改回 5，模擬「規避 UI 直接送後端」的情境
    // 同時把 appraisal/屋齡補上以避免觸發其他規則掩蓋本規則
    await page.evaluate(() => {
      document.getElementById('collateral').value = '5';
    });
    await page.locator('#btnCalc').click();
    const status = await page.locator('#resStatus').innerText();
    expect(status).toContain('不予核貸');
    console.log(`  → 規避後：${status.replace(/\s+/g, ' ').slice(0, 60)}`);
  });

  test('③ DTI 爆表：月入 5 萬但已欠 4 萬月付', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 50000,
      age: 40,
      existing_debt: 40000,
      loan: 200000,
      years: 5,
      rate: 3,
      shares: 50000,
    });
    await page.locator('#btnCalc').click();

    const dti = await page.locator('#resTotalDti').innerText();
    const maxDti = await page.locator('#resMaxDtiTxt').innerText();
    const status = await page.locator('#resStatus').innerText();
    console.log(
      `  → DTI ${dti}% vs 上限 ${maxDti}%；狀態：${status.replace(/\s+/g, ' ').slice(0, 40)}`
    );
    expect(parseFloat(dti)).toBeGreaterThan(70);
    // 應否決或額度超限
    expect(status).toMatch(/不予核貸|額度超限/);
  });

  test('④ 70 歲借 5 年：到期 75 觸及 >70 閾值，扣 10 分', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 40000,
      age: 70,
      existing_debt: 0,
      loan: 200000,
      years: 5,
      rate: 3,
      shares: 50000,
    });
    await page.locator('#btnCalc').click();

    await openResultDetails(page);
    const age = await page.locator('#bd_age_val').innerText();
    const grade = await page.locator('#resGrade').innerText();
    // 70+5=75：AGE_SOFT_PENALTY=70 → 75>70 → 扣 10 分
    expect(age).toContain('-10');
    console.log(`  → 年齡調整：${age}；等級 ${grade}`);
  });

  test('④b 68 歲借 1 年：到期 69，僅觸及 >65，扣 5 分', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 40000,
      age: 68,
      existing_debt: 0,
      loan: 200000,
      years: 1,
      rate: 3,
      shares: 50000,
    });
    await page.locator('#btnCalc').click();

    await openResultDetails(page);
    const age = await page.locator('#bd_age_val').innerText();
    // 68+1=69：69>65 但 ≤70 → 扣 5 分
    expect(age).toContain('-5');
    console.log(`  → 68+1=69 歲：${age}`);
  });

  test('⑤ 76 歲借 3 年：到期 79 超過 75 硬上限', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 35000,
      age: 76,
      existing_debt: 0,
      loan: 100000,
      years: 3,
      rate: 3,
      shares: 50000,
    });
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 80)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/75/);
  });

  test('⑥ 17 歲未成年：欄位紅框 + 法定代理人同意訊息', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 25000,
      age: 17,
      existing_debt: 0,
      loan: 30000,
      years: 2,
      rate: 3,
      shares: 50000,
    });
    await page.locator('#btnCalc').click();

    const ageField = page.locator('#age');
    await expect(ageField).toHaveClass(/has-error/);
    await expect(page.locator('#resultCard')).toBeHidden();
    const errMsg = await ageField
      .locator('xpath=ancestor::div[contains(@class,"form-group")]')
      .locator('.error-msg')
      .innerText();
    expect(errMsg).toContain('法定代理人');
    console.log(`  → 17 歲欄位錯誤：${errMsg}`);
  });
});

test.describe('場景 7-12：法規紅線', () => {
  test('⑦ 聯徵嚴重瑕疵：直接否決', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 50000,
      age: 40,
      existing_debt: 0,
      loan: 100000,
      years: 5,
      rate: 3,
      shares: 50000,
    });
    await page.locator('#jcic').selectOption('veto');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 50)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/聯徵|瑕疵/);
  });

  test('⑧ 高風險投機用途：直接否決', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 50000,
      age: 40,
      existing_debt: 0,
      loan: 100000,
      years: 5,
      rate: 3,
      shares: 50000,
    });
    await page.locator('#purpose').selectOption('veto');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 50)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/用途|投機/);
  });

  test('⑨ 30 年上限：35 年即使有不動產也否決', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 1000000,
      years: 35,
      rate: 3,
      shares: 100000,
    });
    // 35 年已自動切到不動產
    await page.locator('#collateral').selectOption('10');
    await page.locator('#appraisalValue').fill('15000000');
    await page.locator('#houseAge').fill('5');
    await page.locator('#appraisalAge').fill('2');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 80)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/30 年/);
  });

  test('⑩ 擔保放款鑑價過期：15 年須重鑑', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 1000000,
      years: 20,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('10');
    await page.locator('#appraisalValue').fill('15000000');
    await page.locator('#houseAge').fill('10');
    await page.locator('#appraisalAge').fill('15');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 60)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/重新辦理鑑價/);
  });

  test('⑪ 屋齡超限：25 年屋齡借 25 年', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 1000000,
      years: 25,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('10');
    await page.locator('#appraisalValue').fill('15000000');
    await page.locator('#houseAge').fill('25'); // 25 年屋齡
    await page.locator('#appraisalAge').fill('2');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 80)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/20 年/); // 屋齡 >20 借 25 → 觸及 20 上限
  });

  test('⑫-2 土地擔保品：屋齡欄隱藏、年限超 20 否決', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 1000000,
      years: 25,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('10');
    await page.locator('#collateralKind').selectOption('land');
    await page.locator('#appraisalValue').fill('15000000');
    await page.locator('#appraisalAge').fill('2');
    // 土地：屋齡欄隱藏，不可填
    await expect(page.locator('#houseAgeGroup')).toBeHidden();
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 80)}`);
    expect(status).toContain('不予核貸');
    // 土地一律一般上限 20 年，25 年直接否決
    expect(status).toMatch(/土地擔保品/);
    expect(status).toMatch(/20 年/);
  });

  test('⑫ 擔保放款超過 LTV 上限', async ({ page }) => {
    await page.goto('/');
    // 鑑價 1000 萬，其他區 LTV 70% = 700 萬上限
    // 借 750 萬 → 750 > 700 → 否決
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 7500000,
      years: 20,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('10');
    await page.locator('#collateralZone').selectOption('other');
    await page.locator('#appraisalValue').fill('10000000');
    await page.locator('#houseAge').fill('5');
    await page.locator('#appraisalAge').fill('2');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 100)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/LTV|超過鑑估價值/);
  });

  test('⑫-3 抵押權設定金額 < 放款 120% → 否決', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 500000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('10');
    await page.locator('#appraisalValue').fill('10000000');
    // 設定金額 50 萬 < 60 萬（= 50 萬 × 120%）→ 否決
    await page.locator('#mortgageAmount').fill('500000');
    await page.locator('#houseAge').fill('5');
    await page.locator('#appraisalAge').fill('2');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 100)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/120%|抵押權設定金額/);
  });

  test('⑫-4 抵押權設定金額 ≥ 放款 120% → 不因 120% 否決', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 500000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('10');
    await page.locator('#appraisalValue').fill('10000000');
    await page.locator('#mortgageAmount').fill('600000');
    await page.locator('#houseAge').fill('5');
    await page.locator('#appraisalAge').fill('2');
    await page.locator('#btnCalc').click();

    const status = await page.locator('#resStatus').innerText();
    console.log(`  → 狀態：${status.replace(/\s+/g, ' ').slice(0, 100)}`);
    expect(status).not.toContain('不予核貸');
    expect(status).not.toMatch(/120%/);
  });

  test('⑪-2 屋齡≤20 非自用住宅：25 年否決；勾自用即放行', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 5000000,
      years: 25,
      rate: 3,
      shares: 200000,
    });
    // 25 年已自動切到不動產，再保險指定一次
    await page.locator('#collateral').selectOption('10');
    await page.locator('#appraisalValue').fill('10000000');
    await page.locator('#mortgageAmount').fill('8000000');
    await page.locator('#houseAge').fill('10');
    await page.locator('#appraisalAge').fill('3');
    // 預設未勾自用 → 非自用住宅，25 年超過一般上限 20 年
    await page.locator('#btnCalc').click();
    let status = await page.locator('#resStatus').innerText();
    console.log(`  → 非自用：${status.replace(/\s+/g, ' ').slice(0, 100)}`);
    expect(status).toContain('不予核貸');
    expect(status).toMatch(/非自用住宅/);
    // 勾自用住宅 → 屋齡≤20 得放寬至 30 年，只剩 120%/LTV 檢核應通過
    await page.locator('#selfOccupied').check();
    await page.locator('#btnCalc').click();
    status = await page.locator('#resStatus').innerText();
    console.log(`  → 自用：${status.replace(/\s+/g, ' ').slice(0, 100)}`);
    expect(status).not.toContain('不予核貸');
  });
});

test.describe('場景 13-18：實務進階', () => {
  test('⑬ 5 個非社員 vs 5 個社員保證人：社員加分多', async ({ page }) => {
    // 第一次：全非社員
    await page.goto('/');
    await fillForm(page, {
      income: 50000,
      age: 30,
      existing_debt: 5000,
      loan: 300000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#guarantor_count').selectOption('5');
    for (let i = 0; i < 5; i++) {
      const row = page.locator('.guarantor-row').nth(i);
      await row.locator('.g-name').fill(`非社${i + 1}`);
      await row.locator('.g-income').fill('40000');
      await row.locator('.g-debt').fill('3000');
      await row.locator('.g-type').selectOption('non_member');
    }
    await page.locator('#btnCalc').click();
    await openResultDetails(page);
    const nonMemberProtection = await page
      .locator('#bd_protection_val')
      .innerText();
    const nonMemberScore = await page.locator('#gaugeScoreVal').textContent();
    console.log(
      `  → 非社員：保障 ${nonMemberProtection} 分，總分 ${nonMemberScore}`
    );

    // 第二次：全社員
    await page.goto('/');
    await fillForm(page, {
      income: 50000,
      age: 30,
      existing_debt: 5000,
      loan: 300000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#guarantor_count').selectOption('5');
    for (let i = 0; i < 5; i++) {
      const row = page.locator('.guarantor-row').nth(i);
      await row.locator('.g-name').fill(`社員${i + 1}`);
      await row.locator('.g-income').fill('40000');
      await row.locator('.g-debt').fill('3000');
      await row.locator('.g-type').selectOption('member');
    }
    await page.locator('#btnCalc').click();
    await openResultDetails(page);
    const memberProtection = await page
      .locator('#bd_protection_val')
      .innerText();
    const memberScore = await page.locator('#gaugeScoreVal').textContent();
    console.log(`  → 社員：  保障 ${memberProtection} 分，總分 ${memberScore}`);

    expect(parseInt(memberProtection)).toBeGreaterThanOrEqual(
      parseInt(nonMemberProtection)
    );
    expect(parseInt(memberScore)).toBeGreaterThanOrEqual(
      parseInt(nonMemberScore)
    );
  });

  test('⑭ 整併貸款：三筆既有整合 + 月省金額', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 60000,
      age: 35,
      existing_debt: 0,
      loan: 800000,
      years: 7,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#consolidationMode').check();
    await page.locator('#internal_monthly').fill('5000');
    await page.locator('#internal_balance').fill('200000');
    // 第一筆額外（動態列）
    await page.locator('.ext-row').nth(0).locator('.ext-monthly').fill('3000');
    await page
      .locator('.ext-row')
      .nth(0)
      .locator('.ext-balance')
      .fill('100000');
    await page.locator('.ext-row').nth(0).locator('.ext-years').fill('3');
    await page.locator('.ext-row').nth(0).locator('.ext-rate').fill('4');
    // 再新增兩筆 → 共三筆額外既有貸款
    await page.locator('#btnAddExtLoan').click();
    await page.locator('.ext-row').nth(1).locator('.ext-monthly').fill('2000');
    await page.locator('#btnAddExtLoan').click();
    await page.locator('.ext-row').nth(2).locator('.ext-monthly').fill('1000');
    await page.locator('.ext-row').nth(2).locator('.ext-balance').fill('50000');
    await page.locator('#btnCalc').click();

    const consBox = page.locator('#consolidationBox');
    await expect(consBox).toBeVisible();
    const text = await consBox.innerText();
    console.log(`  → 整併盒內容：${text.replace(/\n/g, ' | ').slice(0, 80)}`);
    expect(text).toContain('現狀月付');
    expect(text).toContain('整併後月付');
    // 未整併的既有月付 = 5000 + 3000 + 2000 + 1000 = 11000 → 1.1 萬元
    expect(text).toContain('1.1 萬元');
  });

  test('⑭-2 整併模式筆數變更後仍可刪除、計算結果同步', async ({ page }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 60000,
      age: 35,
      existing_debt: 0,
      loan: 800000,
      years: 7,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#consolidationMode').check();
    await page.locator('.ext-row').nth(0).locator('.ext-monthly').fill('3000');
    await page.locator('#btnAddExtLoan').click();
    await page.locator('.ext-row').nth(1).locator('.ext-monthly').fill('2000');
    // 刪掉第一筆 → 只剩 2000
    await page.locator('.ext-row').nth(0).locator('.ext-remove').click();
    await expect(page.locator('.ext-row')).toHaveCount(1);
    await expect(
      page.locator('.ext-row').nth(0).locator('.ext-monthly')
    ).toHaveValue('2,000');
    await page.locator('#btnCalc').click();
    const text = await page.locator('#consolidationBox').innerText();
    expect(text).toContain('2,000');
    // 總借款金額不得因殘留的 internalBalance2 舊欄位算成 NaN
    await openResultDetails(page);
    const exposure = await page.locator('#resTotalExposure').innerText();
    expect(exposure).not.toMatch(/NaN/);
    expect(exposure).toMatch(/[\d,]/);
  });

  test('⑮ 建議增貸額度：股金 2 倍內 (collateral=5) 顯示', async ({ page }) => {
    await page.goto('/');
    // 預設 collateral=12「足額股金內」會因 50 萬 > 股金 20 萬直接否決，改用 5
    await fillForm(page, {
      income: 100000,
      age: 35,
      existing_debt: 0,
      loan: 500000,
      years: 5,
      rate: 3,
      shares: 200000,
    });
    await page.locator('#collateral').selectOption('5');
    await page.locator('#incomeStability').selectOption('9');
    await page.locator('#tenure').selectOption('6');
    await page.locator('#interaction').selectOption('10');
    await page.locator('#jcic').selectOption('10');
    await page.locator('#membership').selectOption('5');
    await page.locator('#career').selectOption('6');
    await page.locator('#participation').selectOption('4');
    await page.locator('#btnCalc').click();

    const grade = await page.locator('#resGrade').innerText();
    const suggestedBox = page.locator('#suggestedLoanBox');
    await expect(suggestedBox).toBeVisible();
    const text = await suggestedBox.innerText();
    console.log(
      `  → 等級 ${grade}，建議盒：${text.replace(/\n/g, ' | ').slice(0, 60)}`
    );
    expect(text).toMatch(/一般增貸額度/);
  });

  test('⑯ 列印報表：社員編號、日期、Report ID 都正確', async ({ page }) => {
    await page.goto('/');
    await page.locator('#memberId').fill('B99999 林小芬');
    await fillForm(page, {
      income: 50000,
      age: 40,
      existing_debt: 0,
      loan: 200000,
      years: 5,
      rate: 3,
      shares: 80000,
    });
    await page.locator('#btnCalc').click();

    const member = await page.locator('#p_memberId').innerText();
    const reportId = await page.locator('#reportId').innerText();
    const printDate = await page.locator('#printDate').innerText();
    const grade = await page.locator('#p_grade').innerText();
    const score = await page.locator('#p_score').innerText();
    const limit = await page.locator('#p_limit').innerText();
    console.log(`  → 報表 ID: ${reportId}`);
    console.log(
      `  → 社員：${member} / 等級 ${grade} / ${score} 分 / 額度 ${limit} 元`
    );
    console.log(`  → 產出時間：${printDate}`);

    expect(member).toContain('B99999');
    expect(reportId).toMatch(/^CU-\d{8}-\d{4}$/);
    expect(grade).toMatch(/[A-E]/);
    expect(parseInt(score.replace(/[^\d]/g, ''))).toBeGreaterThan(0);
  });

  test('⑰ 股金矛盾提示：申請 50 萬/股金 10 萬/選「足額股金內」', async ({
    page,
  }) => {
    await page.goto('/');
    await fillForm(page, {
      income: 50000,
      age: 40,
      existing_debt: 0,
      loan: 500000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('12'); // 足額股金內借款
    await page.locator('#btnCalc').click();

    const hint = page.locator('#shareHint');
    await expect(hint).toBeVisible();
    const text = await hint.innerText();
    console.log(`  → 提示：${text.slice(0, 80)}`);
    expect(text).toContain('矛盾');
  });

  test('⑱ 估算小幫手已移除：表單不再有估算按鈕', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btnDebtEstimator')).toHaveCount(0);
    await expect(page.locator('#debtEstimatorModal')).toHaveCount(0);
  });

  test('⑲ B1：股金矛盾提示在輸入時即時顯示，不必按計算', async ({ page }) => {
    await page.goto('/');
    // 清空草稿（避免上次測試的殘留）
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 還沒填任何東西，shareHint 應為隱藏
    await expect(page.locator('#shareHint')).toBeHidden();

    // 填 loan=50 萬、shares=10 萬、預設 collateral=12 → 應該立即出現矛盾提示
    await page.locator('#loan').fill('500000');
    await page.locator('#shares').fill('100000');
    // 等 input 事件生效
    await page.waitForTimeout(100);

    const hint = page.locator('#shareHint');
    await expect(hint).toBeVisible();
    const text = await hint.innerText();
    console.log(`  → 即時提示：${text.slice(0, 80)}`);
    expect(text).toContain('矛盾');
    // 不需要按 btnCalc 就有提示
  });

  test('⑲b B1：變更 collateral 為 0 後提示即時切換', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.locator('#loan').fill('50000');
    await page.locator('#shares').fill('100000');
    await page.locator('#collateral').selectOption('0');
    await page.waitForTimeout(50);

    const hint = page.locator('#shareHint');
    await expect(hint).toBeVisible();
    const text = await hint.innerText();
    console.log(`  → 即時提示：${text.slice(0, 80)}`);
    // collateral=0 + loan=5 萬 < shares=10 萬 → 提示「可能符合足額股金內借款」
    expect(text).toContain('可能符合');
  });

  test('⑳ 保證人「債務不詳」：checkbox + 警示 + 列印標註 + 草稿持久化', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 1 位保證人，勾不詳
    await page.locator('#guarantor_count').selectOption('1');
    const row = page.locator('.guarantor-row').first();
    await row.locator('.g-name').fill('王大成');
    await row.locator('.g-income').fill('50000');
    // 確認 checkbox 存在
    const checkbox = row.locator('.g-unknown');
    await expect(checkbox).toBeVisible();
    await checkbox.check();

    // 勾選後 debt 欄應 disabled 且清空
    const debtInput = row.locator('.g-debt');
    await expect(debtInput).toBeDisabled();
    await expect(debtInput).toHaveValue('');

    // 填其餘必填欄位並計算
    await fillForm(page, {
      income: 60000,
      age: 40,
      existing_debt: 0,
      loan: 300000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#btnCalc').click();

    // 警示盒可見 + 數量為 1
    const warn = page.locator('#unknownGuarantorWarn');
    await expect(warn).toBeVisible();
    const count = await page.locator('#unknownGuarantorCount').innerText();
    expect(count).toBe('1');
    console.log(`  → 警示盒顯示：${count} 位不詳`);

    // 列印報表:保證人姓名旁應有「債務未查證」+ 表尾備註
    const guarantorPrint = page.locator('#p_guarantor_print');
    const printText = await guarantorPrint.innerText();
    expect(printText).toContain('債務未查證');
    expect(printText).toContain('另覓佐證');
    console.log(`  → 列印報表含「債務未查證」與「另覓佐證」`);

    // 草稿持久化:重整後 checkbox 仍勾選
    await page.waitForTimeout(150); // 等待 debounced saveFormDraft
    await page.reload();
    const checkboxAfter = page
      .locator('.guarantor-row')
      .first()
      .locator('.g-unknown');
    await expect(checkboxAfter).toBeChecked();
    const debtAfter = page.locator('.guarantor-row').first().locator('.g-debt');
    await expect(debtAfter).toBeDisabled();
    console.log(`  → 重整後 checkbox 仍勾選，debt 欄仍 disabled`);
  });

  test('㉑ 借款人身分（理監事/職員）：利益迴避提示 + 理事會特別決議層級', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 選擇「理事 / 監事」
    await page.locator('#borrowerRole').selectOption('board');
    // 利益迴避提示應顯示
    const hint = page.locator('#roleAvoidanceHint');
    await expect(hint).toBeVisible();
    expect(await hint.innerText()).toContain('迴避');

    // 填寫無擔保借款 50 萬（股金 10 萬，超股金）
    await fillForm(page, {
      income: 80000,
      age: 45,
      existing_debt: 0,
      loan: 500000,
      years: 5,
      rate: 3,
      shares: 100000,
    });
    await page.locator('#collateral').selectOption('5');
    await page.locator('#btnCalc').click();

    // 結論條法定送審層級應為「理事會特別決議」
    const govEl = page.locator('#verdictGovernance');
    await expect(govEl).toBeVisible();
    const govText = await govEl.innerText();
    expect(govText).toContain('理事會特別決議');
    expect(govText).toContain('2/3');

    // 列印報表應正確標註借款人身分與法定送審層級
    const printRole = await page.locator('#p_borrower_role').innerText();
    expect(printRole).toContain('理事 / 監事');
    const printGov = await page.locator('#p_governance').innerText();
    expect(printGov).toContain('理事會特別決議');

    console.log(`  → 利益迴避提示顯示正常，法定層級：理事會特別決議`);
  });

  test('㉒ 第三人名下擔保品：未填保證人否決，填寫保證人通過並標記理事會決議', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await fillForm(page, {
      income: 80000,
      age: 40,
      existing_debt: 0,
      loan: 2000000,
      years: 10,
      rate: 2.5,
      shares: 200000,
    });
    await page.locator('#collateral').selectOption('10');
    await page.locator('#appraisalValue').fill('5000000');
    await page.locator('#mortgageAmount').fill('3000000');
    await page.locator('#collateralKind').selectOption('building');
    await page.locator('#houseAge').fill('10');

    // 擔保品所有權人選擇「他人（第三人）名下」
    await page.locator('#collateralOwner').selectOption('third_party');
    const thirdPartyHint = page.locator('#thirdPartyGuarantorHint');
    await expect(thirdPartyHint).toBeVisible();
    expect(await thirdPartyHint.innerText()).toContain('連帶保證人');

    // 尚未填保證人時點計算 → 應遭第 17 條否決
    await page.locator('#btnCalc').click();
    const status = await page.locator('#resStatus').innerText();
    expect(status).toContain('不予核貸');
    expect(status).toContain('第三人');

    // 加入 1 位保證人
    await page.locator('#guarantor_count').selectOption('1');
    const row = page.locator('.guarantor-row').first();
    await row.locator('.g-name').fill('陳大明（擔保物提供人）');
    await row.locator('.g-income').fill('60000');
    await row.locator('.g-debt').fill('0');

    await page.locator('#btnCalc').click();
    const statusPass = await page.locator('#resStatus').innerText();
    expect(statusPass).not.toContain('第三人');

    // 擔保放款法定層級應為「理事會決議」
    const govEl = page.locator('#verdictGovernance');
    await expect(govEl).toBeVisible();
    expect(await govEl.innerText()).toContain('理事會決議');

    console.log(`  → 第三人擔保品連帶保證人檢核及理事會決議層級驗證通過`);
  });

  test('㉓ 115 年度生活支出地區切換與 1.2 倍強制執行標準連動', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 預設為新北市 17,750
    const livingExp = page.locator('#livingExpense');
    await expect(livingExp).toHaveValue('17,750');

    // 切換為臺北市 → 應自動變為 20,744
    await page.locator('#livingRegion').selectOption('taipei');
    await expect(livingExp).toHaveValue('20,744');
    expect(await page.locator('#dependentExpense').inputValue()).toBe('10,372');

    // 勾選 1.2 倍強制執行生活必需標準 → 20,744 * 1.2 = 24,893
    await page.locator('#livingMultiplier12').check();
    await expect(livingExp).toHaveValue('24,893');
    expect(await page.locator('#dependentExpense').inputValue()).toBe('12,447');

    // 切換受扶養人數為 2 人 → 家庭總生活費更新
    await page.locator('#dependents').selectOption('2');
    const hintTotal = await page.locator('#hint_livingTotal').innerText();
    expect(hintTotal).toBe('49,787');

    console.log(`  → 115 年地區切換、1.2 倍乘數與扶養親屬連動驗證通過`);
  });

  test('㉔ 收支赤字否決 (第18條) 與現金流平衡分析卡', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 月薪 30,000，借 100 萬/5年/3% (月付約 19,167 元)，生活費 17,750 元
    // 總支出 = 19,167 + 17,750 = 36,917 > 30,000（赤字 6,917 元）
    await fillForm(page, {
      income: 30000,
      age: 35,
      existing_debt: 0,
      loan: 1000000,
      years: 5,
      rate: 3,
      shares: 1000000,
      livingExpense: 17750,
      dependentExpense: 8875,
    });
    await page.locator('#collateral').selectOption('5');
    await page.locator('#btnCalc').click();

    // 驗證觸發收支赤字否決
    const status = await page.locator('#resStatus').innerText();
    expect(status).toContain('不予核貸');
    expect(status).toContain('收支赤字');

    // 展開明細檢查現金流分析卡
    await openResultDetails(page);
    const surplusVal = await page.locator('#cf_net_surplus').innerText();
    expect(surplusVal).toContain('－');
    const badge = await page.locator('#cf_surplus_badge').innerText();
    expect(badge).toBe('赤字警告');

    console.log(`  → 收支赤字否決與現金流分析卡驗證通過`);
  });

  test('㉕ 列印報表：包含生活支出與每月收支淨盈餘', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await fillForm(page, {
      memberId: 'C88888 陳大同',
      income: 60000,
      age: 35,
      existing_debt: 5000,
      loan: 300000,
      years: 5,
      rate: 3,
      shares: 200000,
      livingExpense: 17750,
      dependentExpense: 8875,
    });
    await page.locator('#dependents').selectOption('1');
    await page.locator('#collateral').selectOption('5');
    await page.locator('#btnCalc').click();

    const livingInfo = await page.locator('#p_living_info').innerText();
    expect(livingInfo).toContain('17,750');
    expect(livingInfo).toContain('扶養親屬 1 人');

    const surplusInfo = await page.locator('#p_cashflow_surplus').innerText();
    expect(surplusInfo).toContain('每月淨盈餘');
    expect(surplusInfo).toContain('＋');

    console.log(`  → 列印報表生活支出與現金流盈餘資訊列驗證通過`);
  });
});
