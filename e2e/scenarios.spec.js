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
  };
  for (const [k, v] of Object.entries(data)) {
    if (fields[k]) await page.locator(fields[k]).fill(String(v));
  }
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

  test('⑫ 抵押權設定 120% 不足：放款接近鑑價上限時', async ({ page }) => {
    await page.goto('/');
    // 鑑價 1000 萬，其他區 LTV 70% = 700 萬上限
    // 借 600 萬 → 抵押權須設 720 萬 → 720 > 700 → 否決
    await fillForm(page, {
      income: 80000,
      age: 35,
      existing_debt: 0,
      loan: 6000000,
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
    expect(status).toMatch(/抵押權設定|120%/);
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

  test('⑭ 整併貸款：兩筆既有整合 + 月省金額', async ({ page }) => {
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
    await page.locator('#internal_monthly2').fill('3000');
    await page.locator('#internal_balance2').fill('100000');
    await page.locator('#internal_years2').fill('3');
    await page.locator('#internal_rate2').fill('4');
    await page.locator('#btnCalc').click();

    const consBox = page.locator('#consolidationBox');
    await expect(consBox).toBeVisible();
    const text = await consBox.innerText();
    console.log(`  → 整併盒內容：${text.replace(/\n/g, ' | ').slice(0, 80)}`);
    expect(text).toContain('現狀月付');
    expect(text).toContain('整併後月付');
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

  test('⑱ 估算小幫手：房貸 500 萬/2.5%/20 年 → 月付約 3.1 萬', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#btnDebtEstimator').click();
    await page.locator('#debtPrincipal').fill('5000000');
    await page.locator('#debtRate').fill('2.5');
    await page.locator('#debtYears').fill('20');
    await page.locator('#debtEstimatedMonthly').waitFor();
    const monthlyTxt = await page.locator('#debtEstimatedMonthly').innerText();
    console.log(`  → 估算月付：${monthlyTxt}`);
    // 「3.1 萬元」→ 31,250 元；parse 含單位的數字（顯示精度 1 位）
    // PMT(5000000, 2.5, 20) ≈ 31250（首期本金 20833 + 首期利息 10417），
    // 顯示為 3.1 萬元（截斷）
    const m = monthlyTxt.match(/([\d.]+)\s*萬/);
    let num = m ? parseFloat(m[1]) * 10000 : 0;
    expect(num).toBeGreaterThanOrEqual(31000);
    expect(num).toBeLessThanOrEqual(32000);

    // 套用 → 自動填入實際 PMT 精準值（不受顯示截斷影響）
    await page.locator('#applyDebtEstimator').click();
    const debtVal = parseInt(await page.locator('#existing_debt').inputValue());
    console.log(`  → 套用後 existing_debt = ${debtVal}（實際 PMT ≈ 31250）`);
    expect(debtVal).toBeGreaterThanOrEqual(31000);
    expect(debtVal).toBeLessThanOrEqual(32000);
  });
});
