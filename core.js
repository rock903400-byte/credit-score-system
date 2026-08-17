// ============================================================
// 常數（評分門檻、法規上限、評等等級）
// ============================================================
const DSR_VETO_THRESHOLD = 0.7;
const DSR_SCORE_TIERS = [
  [0.4, 20],
  [0.45, 18],
  [0.5, 16],
  [0.55, 13],
  [0.6, 10],
  [0.65, 6],
  [0.7, 3],
];
const AGE_HARD_VETO = 75;
const AGE_SOFT_PENALTY = 70;
const AGE_SOFT_PENALTY_MILD = 65;
const AGE_SCORE_HARD = -10;
const AGE_SCORE_MILD = -5;
const NATURAL_PERSON_CAP = 10_000_000;
const CREDIT_FLOOR_PER_SHARE = 1_000_000;
const LONG_TERM_YEARS = 7;
const SECURED_YEARS_STANDARD = 20;
const MAX_SECURED_YEARS = 30;
const MAX_GUARANTORS = 5;
const GUARANTOR_SCORE_TABLE = { 0: 0, 1: 3, 2: 5, 3: 6, 4: 7, 5: 8 };
const GUARANTOR_TYPE_WEIGHT = { member: 1.0, non_member: 0.7 };
const GRADE_THRESHOLDS = { A: 90, B: 80, C: 70, D: 60 };
const GRADE_DTI_LIMITS = { A: 0.6, B: 0.5, C: 0.4, D: 0.3 };
const DBR_HARD_CEILING = 22; // 金管會個人無擔保負債上限 22 倍
const GRADE_DBR_LIMITS = { A: 20, B: 15, C: 12, D: 8, E: 0 }; // 各評等無擔保授信月薪倍數階梯

// 擔保放款 LTV 上限（擔保放款辦法第 10、10-1 條）
const LTV_RATIOS = {
  residential_commercial_educational: 0.85, // 都市計畫住宅區、商業區、文教區
  other: 0.7, // 其他區段
};
const MORTGAGE_REGISTRATION_RATIO = 1.2; // 抵押權設定 ≥ 放款金額 × 120%（第 11 條）
const COLLATERAL_REAPPRAISAL_YEARS = 10; // 鑑價報告逾 10 年須重鑑（第 12 條）

// 擔保品類型分數對照（依《擔保放款辦法》第 3 條分類）
// 12 = 足額股金內借款（無 LTV 限制，額度受股金管制，流動性最佳）
// 10 = 足額不動產抵押（LTV 85%/70%，額度受鑑估×LTV 管制）
//  5 = 不足額擔保／純信用（股金 2 倍內）
//  0 = 純信用借款（超過股金 2 倍）
const COLLATERAL_SCORE = { 12: 12, 10: 12, 5: 5, 0: 0 };

// 115 年度（2026年）各縣市每人每月最低生活費標準（衛福部、各直轄市政府、司法院公告）
var DEFAULT_LIVING_EXPENSE = 17750; // 預設個人每月生活費基準（新北市標準）
var DEFAULT_DEPENDENT_EXPENSE_RATIO = 0.5; // 受扶養人生活費預設為本人的 50%
var JUDICIAL_LIVING_MULTIPLIER = 1.2; // 強制執行法第 122 條維持生活所必需倍數

var REGIONAL_MIN_LIVING_COST_115 = {
  taipei: 20744,
  new_taipei: 17750,
  taoyuan: 17186,
  kaohsiung: 16970,
  taichung: 16431,
  tainan: 15515,
  taiwan_province: 15515,
  kinmen_lienchiang: 15173,
  custom: 17750,
};

// ============================================================
// 工具函式
// ============================================================

function pmt(principal, annualRatePercent, years) {
  const n = years * 12;
  const r = annualRatePercent / 100 / 12;
  // 本金平均攤還法（首期月付）：每月本金 = P / n，利息依當期餘額遞減。
  // UI 單一數字以**首期**呈現（DTI / 否決線採最保守值）。
  //   每月本金 = principal / n
  //   首期利息 = principal * r         （首期餘額 = principal）
  //   首期月付 = 每月本金 + 首期利息
  if (r === 0) return principal / n;
  return principal / n + principal * r;
}

function stripEmoji(str) {
  return String(str)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );
}

function formatAmount(val) {
  if (!val || val <= 0) return '';
  if (val >= 100000000) return (val / 100000000).toFixed(1) + ' 億元';
  if (val >= 10000) {
    const wan = val / 10000;
    const rounded = parseFloat(wan.toFixed(1));
    if (rounded >= 10000) return (val / 100000000).toFixed(1) + ' 億元';
    return (wan % 1 === 0 ? wan : wan.toFixed(1)) + ' 萬元';
  }
  return val.toLocaleString('zh-TW') + ' 元';
}

const _memSeqFallback = {}; // [FIX 2.2] localStorage 不可用時的記憶體序號 fallback

function getReportSeq() {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const key = `cu_seq_${ymd}`;
  // [FIX 2.2] localStorage 在隱私模式 / 企業政策封鎖時會丟例外，加 try/catch 與記憶體 fallback
  try {
    const cur = parseInt(localStorage.getItem(key) || '0', 10);
    const next = cur + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch (e) {
    _memSeqFallback[key] = (_memSeqFallback[key] || 0) + 1;
    return _memSeqFallback[key];
  }
}

// 實質收支與現金流試算（生活支出、受扶養親屬、核貸前後淨可支配盈餘）
function computeCashFlow(input, newLoanMonthlyPmt = 0) {
  const livingExpense =
    typeof input.livingExpense === 'number' ? input.livingExpense : 0;
  const dependents =
    typeof input.dependents === 'number' ? input.dependents : 0;
  const depExpense =
    typeof input.dependentExpense === 'number'
      ? input.dependentExpense
      : livingExpense * DEFAULT_DEPENDENT_EXPENSE_RATIO;
  const totalLivingExpenses = livingExpense + dependents * depExpense;

  const extMonthly = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.monthly || 0),
    0
  );
  const totalExistingDebt =
    (input.existingDebt || 0) + (input.internalMonthly || 0) + extMonthly;
  const totalMonthlyPayment = totalExistingDebt + (newLoanMonthlyPmt || 0);

  const netSurplusPreLoan =
    (input.income || 0) - totalExistingDebt - totalLivingExpenses;
  const netSurplusPostLoan =
    (input.income || 0) - totalMonthlyPayment - totalLivingExpenses;
  const totalBurdenRatio =
    input.income > 0
      ? (totalMonthlyPayment + totalLivingExpenses) / input.income
      : Infinity;

  return {
    livingExpense,
    dependents,
    dependentExpense: depExpense,
    totalLivingExpenses,
    totalExistingDebt,
    totalMonthlyPayment,
    netSurplusPreLoan,
    netSurplusPostLoan,
    totalBurdenRatio,
  };
}

// ============================================================
// 解析與驗證輸入
// ============================================================

function validateInputs(input) {
  const errors = [];
  if (input.income <= 0) errors.push('月收入須大於 0');
  if (input.years <= 0) errors.push('貸款年限須大於 0');
  if (input.proposedLoan <= 0) errors.push('申請金額須大於 0');
  const numericFields = [
    'income',
    'age',
    'existingDebt',
    'internalMonthly',
    'internalBalance',
    'proposedLoan',
    'years',
    'ratePercent',
    'shares',
    'appraisalValue',
    'houseAge',
    'appraisalAge',
    'livingExpense',
    'dependents',
    'dependentExpense',
  ];
  for (const f of numericFields) {
    if (typeof input[f] === 'number' && input[f] < 0) {
      errors.push(`「${f}」不可為負值`);
    }
  }
  if (input.ratePercent > 20) errors.push('年利率 > 20% 異常，請確認');
  if (input.years > 50) errors.push('貸款年限過長（> 50 年），請確認');
  // [FIX 2.1] 年齡 <= 0 直接擋下（避免留白 / 負數繞過所有年齡控管）
  if (input.age <= 0) errors.push('年齡為必填欄位且須大於 0');
  else if (input.age < 18)
    errors.push('年齡未滿 18 歲，須取得法定代理人書面同意後送件');
  // 入社年資與儲蓄習慣邏輯矛盾防呆
  if (input.membership === 1 && input.interaction === 10) {
    errors.push(
      '入社年資未滿 1 年，不得選擇「不間斷儲蓄超過 12 個月」（邏輯矛盾，請確認儲蓄習慣或入社年資）'
    );
  }
  // Validate each additional loan (整併模式多筆)
  if (input.additionalLoans && input.additionalLoans.length > 0) {
    input.additionalLoans.forEach((l, i) => {
      if (l.monthly < 0 || l.balance < 0 || l.years < 0 || l.rate < 0) {
        errors.push(`第 ${i + 1} 筆既有貸款數值不可為負值`);
      }
    });
  }
  // Validate each guarantor
  if (input.guarantors && input.guarantors.length > 0) {
    input.guarantors.forEach((g, i) => {
      if (!g.name || !g.name.trim())
        errors.push(`第 ${i + 1} 位保證人姓名未填寫`);
      if (g.income <= 0) errors.push(`第 ${i + 1} 位保證人月收入須大於 0`);
      if (g.debt < 0) errors.push(`第 ${i + 1} 位保證人既有債務月付不可為負值`);
    });
  }
  return errors;
}

// ============================================================
// 欄位級驗證 — 將全域錯誤依欄位分組，供 inline 顯示用
// ============================================================

function validateInputsByField(input) {
  const fieldErrors = {}; // { fieldKey: '錯誤訊息' }
  const setErr = (key, msg) => {
    fieldErrors[key] = (fieldErrors[key] ? fieldErrors[key] + '；' : '') + msg;
  };

  if (input.income <= 0) setErr('income', '月收入須大於 0');
  if (input.years <= 0) setErr('years', '貸款年限須大於 0');
  if (input.proposedLoan <= 0) setErr('loan', '申請金額須大於 0');
  if (input.existingDebt < 0) setErr('existing_debt', '社外債務不可為負值');
  if (input.internalMonthly < 0)
    setErr('internal_monthly', '本社月付不可為負值');
  if (input.internalBalance < 0)
    setErr('internal_balance', '本社餘額不可為負值');
  if (input.shares < 0) setErr('shares', '股金不可為負值');
  if (input.ratePercent < 0) setErr('rate', '年利率不可為負值');
  if (input.appraisalValue < 0) setErr('appraisalValue', '鑑估價值不可為負值');
  if (input.houseAge < 0) setErr('houseAge', '屋齡不可為負值');
  if (input.appraisalAge < 0) setErr('appraisalAge', '鑑價屋齡/年分不可為負值');
  if (input.livingExpense < 0) setErr('livingExpense', '生活支出不可為負值');
  if (input.dependents < 0) setErr('dependents', '扶養人數不可為負值');
  if (input.dependentExpense < 0)
    setErr('dependentExpense', '扶養生活支出不可為負值');
  if (input.ratePercent > 20) setErr('rate', '年利率 > 20% 異常，請確認');
  if (input.years > 50) setErr('years', '貸款年限過長（> 50 年），請確認');
  if (input.age <= 0) setErr('age', '年齡為必填欄位且須大於 0');
  else if (input.age < 18)
    setErr('age', '年齡未滿 18 歲須取得法定代理人書面同意');
  if (input.membership === 1 && input.interaction === 10) {
    setErr('interaction', '入社未滿 1 年無法累積超過 12 個月不間斷儲蓄');
  }

  if (input.additionalLoans && input.additionalLoans.length > 0) {
    input.additionalLoans.forEach((l, i) => {
      if (l.monthly < 0)
        setErr(`internal_ext_${i}_monthly`, '既有貸款月付不可為負值');
      if (l.balance < 0)
        setErr(`internal_ext_${i}_balance`, '既有貸款餘額不可為負值');
      if (l.years < 0)
        setErr(`internal_ext_${i}_years`, '既有貸款年限不可為負值');
      if (l.rate < 0)
        setErr(`internal_ext_${i}_rate`, '既有貸款利率不可為負值');
    });
  }

  if (input.guarantors && input.guarantors.length > 0) {
    input.guarantors.forEach((g, i) => {
      const k = `g_name_${i}`;
      const k2 = `g_income_${i}`;
      const k3 = `g_debt_${i}`;
      if (!g.name || !g.name.trim()) setErr(k, '保證人姓名未填寫');
      if (g.income <= 0) setErr(k2, '月收入須大於 0');
      if (g.debt < 0) setErr(k3, '既有債務月付不可為負值');
    });
  }
  return fieldErrors;
}

// ============================================================
// 評分計算（含 baseline DSR 含本社長債）
// ============================================================

function computeScore(input) {
  if (!input.income || input.income <= 0) {
    return {
      total: 0,
      dsr: 0,
      dsrScore: 0,
      stability: 0,
      ageScore: 0,
      peopleScore: 0,
      protectionScore: 0,
      purposeScore: 0,
      perspectiveScore: 0,
    };
  }
  // [FIX 1.6] DSR 含社外 + 本社月付（含整併模式下的所有額外既有貸款）
  const extMonthly = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.monthly || 0),
    0
  );
  const baselineDsr =
    (input.existingDebt + input.internalMonthly + extMonthly) / input.income;
  let dsrScore = 0;
  for (const [limit, score] of DSR_SCORE_TIERS) {
    if (baselineDsr < limit) {
      dsrScore = score;
      break;
    }
  }

  // People (25%)
  const jcicScore = input.jcic === 'veto' ? 0 : parseInt(input.jcic) || 0;
  const peopleScore = input.interaction + jcicScore + input.membership;

  // Guarantor DSR score — take worst DSR among all guarantors
  let guarantorDsrScore = 0;
  if (
    input.guarantorCount > 0 &&
    input.guarantors &&
    input.guarantors.length > 0
  ) {
    const validDsrs = input.guarantors
      .filter((g) => g.income > 0 && !g.unknown)
      .map((g) => g.debt / g.income);
    if (validDsrs.length > 0) {
      const maxDsr = Math.max(...validDsrs);
      if (maxDsr < 0.3) guarantorDsrScore = 5;
      else if (maxDsr < 0.5) guarantorDsrScore = 3;
      else guarantorDsrScore = 1;
    }
  }

  // Protection (20%) — 擔保 12 + 保證人(加權) 8 + 保證人DSR 5 + LTV覆蓋 3 = 28 理論值 → ×0.8 正規化到 20 滿分
  let effectiveGuarantorCount = 0;
  if (input.guarantors && input.guarantors.length > 0) {
    input.guarantors.forEach((g) => {
      const weight = GUARANTOR_TYPE_WEIGHT[g.type] || 1.0;
      effectiveGuarantorCount += weight;
    });
  }
  effectiveGuarantorCount = Math.round(effectiveGuarantorCount);
  const collateralScore = COLLATERAL_SCORE[input.collateral] || 0;
  const guarantorScore = GUARANTOR_SCORE_TABLE[effectiveGuarantorCount] || 0;
  // 擔保覆蓋加成：不動產抵押依 LTV（貸款/鑑價）加成——價值越足、保障越高
  let ltvBonus = 0;
  if (input.collateral === '10') {
    const appraisal = input.appraisalValue || 0;
    const ltv = appraisal > 0 ? input.proposedLoan / appraisal : Infinity;
    if (ltv <= 0.5) ltvBonus = 3;
    else if (ltv <= 0.7) ltvBonus = 2;
  }
  const rawProtectionScore =
    collateralScore + guarantorScore + guarantorDsrScore + ltvBonus;
  const protectionScore = Math.min(20, Math.round(rawProtectionScore * 0.8));

  // Purpose (10%)
  const purposeScore =
    input.purpose === 'veto' ? 0 : parseInt(input.purpose) || 0;

  // Perspective (10%)
  const perspectiveScore = input.career + input.participation;

  // Age penalty（僅扣分，不否決；否決由法規⑧處理）
  const ageAtMaturity = input.age + input.years;
  let ageScore = 0;
  if (ageAtMaturity > AGE_HARD_VETO) ageScore = AGE_SCORE_HARD;
  else if (ageAtMaturity > AGE_SOFT_PENALTY) ageScore = AGE_SCORE_HARD;
  else if (ageAtMaturity > AGE_SOFT_PENALTY_MILD) ageScore = AGE_SCORE_MILD;

  const stabilityScore = (input.incomeStability || 0) + (input.tenure || 0);
  return {
    dsr: baselineDsr,
    dsrScore,
    stability: stabilityScore,
    ageScore,
    peopleScore,
    protectionScore,
    protectionBreakdown: {
      collateral: collateralScore,
      ltvBonus,
      guarantor: guarantorScore,
      guarantorDsr: guarantorDsrScore,
    },
    purposeScore,
    perspectiveScore,
    total: Math.max(
      0,
      Math.min(
        100,
        dsrScore +
          stabilityScore +
          ageScore +
          peopleScore +
          protectionScore +
          purposeScore +
          perspectiveScore
      )
    ),
  };
}

// ============================================================
// 法規否決（累積所有觸發原因）
// ============================================================

function applyRegulatoryVetoes(input) {
  const vetoes = [];
  const ageAtMaturity = input.age + input.years;

  // [FIX 1.1] 月付金改用本金平均攤還法
  const newLoanMonthlyPmt = pmt(
    input.proposedLoan,
    input.ratePercent,
    input.years
  );
  // [FIX 1.5] 否決線比對「核貸後總負債比」（整併模式含所有額外既有貸款月付）
  const extMonthlyVeto = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.monthly || 0),
    0
  );
  const postLoanDti =
    input.income > 0
      ? (input.existingDebt +
          input.internalMonthly +
          extMonthlyVeto +
          newLoanMonthlyPmt) /
        input.income
      : Infinity;

  // [FIX] 70% DTI 否決紅線
  if (postLoanDti > DSR_VETO_THRESHOLD) {
    vetoes.push(
      `核貸後總負債比 ${(postLoanDti * 100).toFixed(1)}% 超過法規上限 ${(DSR_VETO_THRESHOLD * 100).toFixed(1)}%，不予核貸`
    );
  }

  // ① 未成年社員借款總額 ≤ 股金
  if (
    input.age < 18 &&
    input.proposedLoan + input.internalBalance > input.shares
  ) {
    vetoes.push(
      `未成年社員借款總額（${(input.proposedLoan + input.internalBalance).toLocaleString('zh-TW')} 元）不得超過股金餘額（${input.shares.toLocaleString('zh-TW')} 元）`
    );
  }

  // ② [FIX 1.4] 信用借款法定上限（含現有本社餘額）
  const creditCeiling = input.shares + CREDIT_FLOOR_PER_SHARE;
  const totalCreditExposure = input.proposedLoan + input.internalBalance;
  if (
    (input.collateral === '0' || input.collateral === '5') &&
    totalCreditExposure > creditCeiling
  ) {
    vetoes.push(
      `信用借款總額（${totalCreditExposure.toLocaleString('zh-TW')} 元）超過法定上限（股金 ${input.shares.toLocaleString('zh-TW')} 元 ＋ 100 萬 ＝ ${creditCeiling.toLocaleString('zh-TW')} 元）`
    );
  }

  // ③ 自然人放款絕對上限
  if (input.proposedLoan > NATURAL_PERSON_CAP) {
    vetoes.push(
      `申請金額（${input.proposedLoan.toLocaleString('zh-TW')} 元）超過自然人放款法定上限 ${(NATURAL_PERSON_CAP / 10000).toLocaleString('zh-TW')} 萬元`
    );
  }

  // ④ 7 年以上須足額不動產抵押
  if (input.years > LONG_TERM_YEARS && input.collateral !== '10') {
    vetoes.push(
      `貸款年限 ${input.years} 年超過 ${LONG_TERM_YEARS} 年，須以足額不動產抵押為擔保，不得僅以股金或信用方式辦理`
    );
  }

  // ④-1 擔保放款最長 30 年（屋齡 20 年內自用住宅；一般 20 年由 UI 提示）
  if (input.years > MAX_SECURED_YEARS) {
    vetoes.push(
      `貸款年限 ${input.years} 年超過擔保放款最長期限 ${MAX_SECURED_YEARS} 年（屋齡 20 年內自用住宅上限 30 年，一般擔保品上限 ${SECURED_YEARS_STANDARD} 年）`
    );
  }

  // ⑤ 擔保品 '12'（足額股金內借款）申請金額不得超過股金（僅限 ≤7 年）
  if (
    input.collateral === '12' &&
    input.years <= LONG_TERM_YEARS &&
    input.proposedLoan > input.shares
  ) {
    vetoes.push(
      `足額股金內借款申請金額（${input.proposedLoan.toLocaleString('zh-TW')} 元）不得超過股金餘額（${input.shares.toLocaleString('zh-TW')} 元）`
    );
  }

  // ⑥ 聯徵紀錄嚴重瑕疵
  if (input.jcic === 'veto') {
    vetoes.push('聯徵紀錄存有嚴重瑕疵（拒絕往來/強執）');
  }

  // ⑦ 資金用途不當
  if (input.purpose === 'veto') {
    vetoes.push('資金用途不具正當性或屬高風險投機');
  }

  // ⑨ [FIX 1.7] 到期年齡 > 75 直接否決
  if (ageAtMaturity > AGE_HARD_VETO) {
    vetoes.push(`還款到期年齡 ${ageAtMaturity} 歲超過 ${AGE_HARD_VETO} 歲上限`);
  }

  // ⑩ 擔保放款：貸款金額不得超過鑑估價值 × 貸款成數(LTV)上限（辦法第 10、10-1 條）
  if (input.collateral === '10') {
    const appraisal = input.appraisalValue || 0;
    const zone = input.collateralZone || 'other';
    const ltv = LTV_RATIOS[zone] || LTV_RATIOS.other;
    const ltvCeiling = Math.floor(appraisal * ltv);
    if (input.proposedLoan > ltvCeiling) {
      const extraHint = appraisal === 0 ? '（請確認是否未填寫鑑估價值）' : '';
      vetoes.push(
        `擔保放款金額（${input.proposedLoan.toLocaleString('zh-TW')} 元）超過鑑估價值 ${appraisal.toLocaleString('zh-TW')} 元 × 貸款成數(LTV) ${(ltv * 100).toFixed(0)}% ＝ ${ltvCeiling.toLocaleString('zh-TW')} 元${extraHint}`
      );
    }
    // ⑩-1 抵押權設定金額 ≥ 放款金額 × 120%（辦法第 11 條）
    const requiredMortgage = input.proposedLoan * MORTGAGE_REGISTRATION_RATIO;
    const mortgageRegistered = input.mortgageAmount || 0;
    if (mortgageRegistered < requiredMortgage) {
      vetoes.push(
        `抵押權設定金額（${mortgageRegistered.toLocaleString('zh-TW')} 元）不足放款金額 ${input.proposedLoan.toLocaleString('zh-TW')} 元的 120%（${Math.round(requiredMortgage).toLocaleString('zh-TW')} 元）`
      );
    }

    // ⑩-2 屋齡與年限檢核（辦法第 3 條之 1）；土地無建物 → 一律一般上限 20 年
    const collateralKind = input.collateralKind || 'building';
    const houseAge = input.houseAge || 0;
    if (collateralKind === 'land') {
      if (input.years > SECURED_YEARS_STANDARD) {
        vetoes.push(
          `土地擔保品貸款年限上限 ${SECURED_YEARS_STANDARD} 年，目前 ${input.years} 年超過上限`
        );
      }
    } else if (
      input.years > SECURED_YEARS_STANDARD &&
      (houseAge > 20 || !input.isSelfOccupied)
    ) {
      vetoes.push(
        `屋齡 ${houseAge} 年${houseAge <= 20 ? '之非自用住宅' : ''}，貸款年限上限 ${SECURED_YEARS_STANDARD} 年，目前 ${input.years} 年超過上限`
      );
    } else if (
      houseAge <= 20 &&
      input.isSelfOccupied &&
      input.years > MAX_SECURED_YEARS
    ) {
      vetoes.push(
        `屋齡 ${houseAge} 年 ≤ 20 年之自用住宅，貸款年限上限 ${MAX_SECURED_YEARS} 年，目前 ${input.years} 年超過上限`
      );
    }
    // ⑩-3 鑑價報告逾 10 年須重鑑（辦法第 12 條）
    if (
      input.appraisalAge &&
      input.appraisalAge > COLLATERAL_REAPPRAISAL_YEARS
    ) {
      vetoes.push(
        `擔保品鑑價報告已逾 ${COLLATERAL_REAPPRAISAL_YEARS} 年（目前 ${input.appraisalAge} 年），須重新辦理鑑價`
      );
    }
    // ⑩-4 第三人擔保品連帶保證人檢核（辦法第 14 條）
    if (input.collateralOwner === 'third_party') {
      const hasGuarantor =
        (input.guarantorCount && input.guarantorCount > 0) ||
        (input.guarantors && input.guarantors.length > 0);
      if (!hasGuarantor) {
        vetoes.push(
          '提供第三人名下不動產為擔保物者，該第三人必須於借據中擔任連帶保證人（請於保證人區塊填寫連帶保證人資料）'
        );
      }
    }
  }

  // ⑱ [115年授信規範] 收支赤字否決 (Cashflow Deficit Veto)：核貸後總支出 > 月收入（每月淨餘額 < 0）
  const cashFlow = computeCashFlow(input, newLoanMonthlyPmt);
  if (cashFlow.totalLivingExpenses > 0 && cashFlow.netSurplusPostLoan < 0) {
    const deficit = Math.abs(Math.round(cashFlow.netSurplusPostLoan));
    vetoes.push(
      `核貸後每月總支出（總月付 ${Math.round(cashFlow.totalMonthlyPayment).toLocaleString('zh-TW')} 元 ＋ 生活支出 ${Math.round(cashFlow.totalLivingExpenses).toLocaleString('zh-TW')} 元 ＝ ${Math.round(cashFlow.totalMonthlyPayment + cashFlow.totalLivingExpenses).toLocaleString('zh-TW')} 元）超過月收入（${input.income.toLocaleString('zh-TW')} 元），每月收支赤字 ${deficit.toLocaleString('zh-TW')} 元，不予核貸`
    );
  }

  // ⑲ [金管會/銀行法規範] DBR 22 倍無擔保負債硬性否決 (DBR 22 Veto)
  let unsecuredProposedLoan = 0;
  if (input.collateral === '10') {
    const appraisal = input.appraisalValue || 0;
    const zone = input.collateralZone || 'other';
    const ltv = LTV_RATIOS[zone] || LTV_RATIOS.other;
    unsecuredProposedLoan = Math.max(
      0,
      input.proposedLoan - Math.floor(appraisal * ltv)
    );
  } else if (input.collateral === '12') {
    unsecuredProposedLoan = 0; // 足額股金質借，實質無擔保曝險為 0
  } else if (input.collateral === '5') {
    unsecuredProposedLoan = Math.max(
      0,
      input.proposedLoan - (input.shares || 0)
    );
  } else {
    unsecuredProposedLoan = input.proposedLoan;
  }

  const extBalance = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.balance || 0),
    0
  );
  // 本社未足額質借之負債餘額
  const internalUnsecuredBalance = Math.max(
    0,
    (input.internalBalance || 0) -
      (input.collateral === '12' ? input.shares || 0 : 0)
  );
  const totalExistingUnsecuredDebt =
    (input.existingDebt || 0) + internalUnsecuredBalance + extBalance;
  const totalPostUnsecuredDebt =
    unsecuredProposedLoan + totalExistingUnsecuredDebt;
  const maxDbrAllowed = (input.income || 0) * DBR_HARD_CEILING;

  if (input.income > 0 && totalPostUnsecuredDebt > maxDbrAllowed) {
    const dbrRatio = (totalPostUnsecuredDebt / input.income).toFixed(1);
    vetoes.push(
      `無擔保負債總額（本次無擔保借款 ${Math.round(unsecuredProposedLoan).toLocaleString('zh-TW')} 元 ＋ 現有負債 ${Math.round(totalExistingUnsecuredDebt).toLocaleString('zh-TW')} 元 ＝ ${Math.round(totalPostUnsecuredDebt).toLocaleString('zh-TW')} 元）達月收入（${input.income.toLocaleString('zh-TW')} 元）之 ${dbrRatio} 倍，超過法定 22 倍上限（${Math.round(maxDbrAllowed).toLocaleString('zh-TW')} 元），不予核貸`
    );
  }

  return { vetoes, newLoanMonthlyPmt, postLoanDti, cashFlow };
}

function determineGrade(score, isVetoed) {
  if (isVetoed) return { grade: 'E', maxDti: 0 };
  if (score >= GRADE_THRESHOLDS.A)
    return { grade: 'A', maxDti: GRADE_DTI_LIMITS.A };
  if (score >= GRADE_THRESHOLDS.B)
    return { grade: 'B', maxDti: GRADE_DTI_LIMITS.B };
  if (score >= GRADE_THRESHOLDS.C)
    return { grade: 'C', maxDti: GRADE_DTI_LIMITS.C };
  if (score >= GRADE_THRESHOLDS.D)
    return { grade: 'D', maxDti: GRADE_DTI_LIMITS.D };
  return { grade: 'E', maxDti: 0 };
}

function computeMaxLoan(input, maxDti) {
  if (maxDti <= 0) return 0;
  const extMonthly = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.monthly || 0),
    0
  );
  const totalExisting = input.existingDebt + input.internalMonthly + extMonthly;
  const maxPmtByDti = input.income * maxDti - totalExisting;

  const cashFlow = computeCashFlow(input, 0);
  const maxPmtByCashflow =
    cashFlow.totalLivingExpenses > 0
      ? input.income - totalExisting - cashFlow.totalLivingExpenses
      : Infinity;

  const maxAvailablePmt = Math.min(maxPmtByDti, Math.max(0, maxPmtByCashflow));
  if (maxAvailablePmt <= 0) return 0;
  const r = input.ratePercent / 100 / 12;
  const n = input.years * 12;
  const factor = r === 0 ? 1 / n : 1 / n + r;
  return maxAvailablePmt / factor;
}

// 計算建議增貸額度（一般增貸 + 整併增貸）
// 整併模式下所有額外既有貸款（additionalLoans）皆計入既有月付與既有餘額
function computeSuggestedAdditionalLoan(input, maxDti) {
  if (maxDti <= 0) return { general: 0, consolidation: 0 };
  const ext = input.additionalLoans || [];
  const extMonthly = ext.reduce((sum, l) => sum + (l.monthly || 0), 0);
  const extBalance = ext.reduce((sum, l) => sum + (l.balance || 0), 0);
  const totalExistingMonthly =
    input.existingDebt + input.internalMonthly + extMonthly;

  const maxPmtByDti = input.income * maxDti - totalExistingMonthly;
  const cashFlow = computeCashFlow(input, 0);
  const maxPmtByCashflow =
    cashFlow.totalLivingExpenses > 0
      ? input.income - totalExistingMonthly - cashFlow.totalLivingExpenses
      : Infinity;
  const maxAvailablePmt = Math.min(maxPmtByDti, Math.max(0, maxPmtByCashflow));

  if (maxAvailablePmt <= 0) return { general: 0, consolidation: 0 };
  const r = input.ratePercent / 100 / 12;
  const n = input.years * 12;
  const factor = r === 0 ? 1 / n : 1 / n + r;
  const generalAmount = maxAvailablePmt / factor;
  const consolidationAmount =
    generalAmount + input.internalBalance + extBalance;
  return { general: generalAmount, consolidation: consolidationAmount };
}

// 整併貸款試算：將既有貸款（含所有額外筆）併入新貸款
function computeConsolidationScenario(input) {
  const ext = input.additionalLoans || [];
  const extMonthly = ext.reduce((sum, l) => sum + (l.monthly || 0), 0);
  const extBalance = ext.reduce((sum, l) => sum + (l.balance || 0), 0);
  const newLoanMonthlyPmt = pmt(
    input.proposedLoan,
    input.ratePercent,
    input.years
  );
  const totalMonthly =
    input.existingDebt + input.internalMonthly + extMonthly + newLoanMonthlyPmt;
  const consolidationLoanAmount =
    input.proposedLoan + input.internalBalance + extBalance;
  const consolidationMonthly = pmt(
    consolidationLoanAmount,
    input.ratePercent,
    input.years
  );
  const monthlySavings =
    input.internalMonthly +
    extMonthly +
    newLoanMonthlyPmt -
    consolidationMonthly;
  return {
    currentTotalMonthly: input.internalMonthly + extMonthly,
    newLoanMonthlyPmt,
    totalMonthlyAfterNew:
      input.internalMonthly + extMonthly + newLoanMonthlyPmt,
    consolidationLoanAmount,
    consolidationMonthly,
    monthlySavings,
    totalExposure: input.internalBalance + extBalance + input.proposedLoan,
  };
}

function applyLegalCeiling(input, maxLoanLimit, grade) {
  let ceiling;
  if (input.collateral === '10') {
    const appraisal = input.appraisalValue || 0;
    const zone = input.collateralZone || 'other';
    const ltv = LTV_RATIOS[zone] || LTV_RATIOS.other;
    ceiling = Math.min(NATURAL_PERSON_CAP, Math.floor(appraisal * ltv));
  } else if (input.collateral === '12') {
    ceiling = Math.min(NATURAL_PERSON_CAP, input.shares);
  } else {
    // 無擔保放款：章程上限 (股金 + 100 萬) 與 DBR 評級倍數天花板取小
    const dbrMultiplier =
      input.income && grade && GRADE_DBR_LIMITS[grade] !== undefined
        ? GRADE_DBR_LIMITS[grade]
        : DBR_HARD_CEILING;
    const extBalance = (input.additionalLoans || []).reduce(
      (sum, l) => sum + (l.balance || 0),
      0
    );
    const internalUnsecured = Math.max(
      0,
      (input.internalBalance || 0) -
        (input.collateral === '5' ? input.shares || 0 : 0)
    );
    const totalExistingUnsecured =
      (input.existingDebt || 0) + internalUnsecured + extBalance;
    const securedSharesPart = input.collateral === '5' ? input.shares || 0 : 0;

    let dbrCap = Infinity;
    if (input.income > 0) {
      const netDbrUnsecuredAvailable = Math.max(
        0,
        input.income * dbrMultiplier - totalExistingUnsecured
      );
      dbrCap = netDbrUnsecuredAvailable + securedSharesPart;
    }
    const bylawCap = (input.shares || 0) + CREDIT_FLOOR_PER_SHARE;
    ceiling = Math.min(bylawCap, dbrCap);
  }
  let limit = Math.min(maxLoanLimit, ceiling);
  if (input.age < 18) {
    limit = Math.min(limit, Math.max(0, input.shares - input.internalBalance));
  }
  return limit;
}

// 取得核貸額度受限因子與各維度天花板明細
function getLoanLimitDetails(input, maxLoanLimit, grade) {
  const finalLimit = applyLegalCeiling(input, maxLoanLimit, grade);
  const extMonthly = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.monthly || 0),
    0
  );
  const totalExistingMonthly =
    (input.existingDebt || 0) + (input.internalMonthly || 0) + extMonthly;
  const maxPmtByDti =
    (input.income || 0) * (GRADE_DTI_LIMITS[grade] || 0.6) -
    totalExistingMonthly;
  const cashFlow = computeCashFlow(input, 0);
  const maxPmtByCashflow =
    cashFlow.totalLivingExpenses > 0
      ? (input.income || 0) -
        totalExistingMonthly -
        cashFlow.totalLivingExpenses
      : Infinity;

  const r = (input.ratePercent || 0) / 100 / 12;
  const n = (input.years || 0) * 12;
  const factor = r === 0 ? 1 / n : 1 / n + r;
  const pmtCap = factor > 0 ? Math.max(0, maxPmtByDti / factor) : 0;
  const cashflowCap =
    factor > 0 && maxPmtByCashflow !== Infinity
      ? Math.max(0, maxPmtByCashflow / factor)
      : Infinity;

  const dbrMultiplier =
    grade && GRADE_DBR_LIMITS[grade] !== undefined
      ? GRADE_DBR_LIMITS[grade]
      : DBR_HARD_CEILING;
  const extBalance = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.balance || 0),
    0
  );
  const internalUnsecured = Math.max(
    0,
    (input.internalBalance || 0) -
      (input.collateral === '5' ? input.shares || 0 : 0)
  );
  const totalExistingUnsecured =
    (input.existingDebt || 0) + internalUnsecured + extBalance;
  const securedSharesPart = input.collateral === '5' ? input.shares || 0 : 0;
  const dbrCap =
    input.income > 0
      ? Math.max(0, input.income * dbrMultiplier - totalExistingUnsecured) +
        securedSharesPart
      : Infinity;
  const bylawCap = (input.shares || 0) + CREDIT_FLOOR_PER_SHARE;

  let primaryLimiter = 'dti_pmt';
  let limiterText = `受限於 ${grade} 級 DTI 負債比上限（${Math.round(
    (GRADE_DTI_LIMITS[grade] || 0.6) * 100
  )}%）`;

  if (input.collateral === '10') {
    const appraisal = input.appraisalValue || 0;
    const zone = input.collateralZone || 'other';
    const ltv = LTV_RATIOS[zone] || LTV_RATIOS.other;
    const appraisalCap = Math.min(
      NATURAL_PERSON_CAP,
      Math.floor(appraisal * ltv)
    );
    if (finalLimit === appraisalCap && appraisalCap < pmtCap) {
      primaryLimiter = 'appraisal_ltv';
      limiterText = `受限於擔保品鑑估乘數上限（${(ltv * 100).toFixed(
        0
      )}% / ${appraisalCap.toLocaleString('zh-TW')} 元）`;
    }
  } else if (input.collateral === '12') {
    if (finalLimit === input.shares) {
      primaryLimiter = 'shares';
      limiterText = `受限於足額股金餘額上限（${input.shares.toLocaleString(
        'zh-TW'
      )} 元）`;
    }
  } else {
    if (finalLimit === dbrCap && dbrCap < pmtCap && dbrCap <= bylawCap) {
      primaryLimiter = 'dbr_grade_cap';
      limiterText = `受限於 ${grade} 級無擔保月薪倍數上限（${dbrMultiplier} 倍 / ${Math.round(
        dbrCap
      ).toLocaleString('zh-TW')} 元）`;
    } else if (
      finalLimit === cashflowCap &&
      cashflowCap < pmtCap &&
      cashflowCap < dbrCap
    ) {
      primaryLimiter = 'living_expense';
      limiterText = `受限於生活支出扣除後之現金流月付上限（${Math.round(
        cashflowCap
      ).toLocaleString('zh-TW')} 元）`;
    } else if (finalLimit === bylawCap && bylawCap < pmtCap) {
      primaryLimiter = 'bylaw_cap';
      limiterText = `受限於互助社章程無擔保上限（股金＋100 萬 / ${bylawCap.toLocaleString(
        'zh-TW'
      )} 元）`;
    }
  }

  return {
    finalLimit,
    primaryLimiter,
    limiterText,
    dbrMultiplier,
    dbrCap,
    bylawCap,
    pmtCap,
    cashflowCap,
  };
}

// ============================================================
// 法定核決送審層級（依《章程範例》第27條、《放款委員會組織規則》第9條、《放款實施要點》第5條）
// ============================================================

function determineGovernanceRouting(input, result) {
  if (!result || result.isVetoed) {
    return {
      level: 'veto',
      tag: '不予核貸',
      authority: '放款委員會 / 理事會',
      text: '案件違反法定或規章限制，原則不予核貸；若屬爭議案件依章程第 28 條提交理事會決議。',
      requiresBoardSpecialMajority: false,
    };
  }

  const isStaffOrBoard =
    input.borrowerRole === 'board' || input.borrowerRole === 'staff';
  const extBalance = (input.additionalLoans || []).reduce(
    (sum, l) => sum + (l.balance || 0),
    0
  );
  const totalUnsecuredExposure =
    input.proposedLoan + (input.internalBalance || 0) + extBalance;
  const shares = input.shares || 0;
  const exceedsShares = totalUnsecuredExposure > shares;

  // 1. 理監事或職員無擔保借款超過股金：章程第 27 條第 2 項、放款委員會組織規則第 9 條第 1 款
  if (
    isStaffOrBoard &&
    (input.collateral === '0' || input.collateral === '5') &&
    exceedsShares
  ) {
    return {
      level: 'board_special',
      tag: '理事會特別決議',
      authority: '理事會（須 2/3 出席理事同意）',
      text: '理事、監事或職員申請無擔保借款超過股金，經放款委員會初審後，須送交理事會經三分之二出席理事同意後始得貸放。本人、配偶及二親等內親屬應迴避審查與對保（要點第 9 條）。',
      requiresBoardSpecialMajority: true,
    };
  }

  // 2. 社員申請擔保借款：章程第 27 條第 1 項、放款委員會組織規則第 9 條第 2 款
  if (input.collateral === '10') {
    return {
      level: 'board_general',
      tag: '理事會決議',
      authority: '放款委員會初審 → 理事會決議',
      text: '社員申請擔保借款應經放款委員會先行初審後，提交理事會作最後決議。',
      requiresBoardSpecialMajority: false,
    };
  }

  // 3. 小額無擔保借款（股金內）：放款實施要點第 5 條
  if (input.collateral === '12' || totalUnsecuredExposure <= shares) {
    return {
      level: 'staff_delegated',
      tag: '專職授權核放',
      authority: '專職人員核放（10 日內送放款會追認）',
      text: '無擔保借款於社員股金內得由理事會授權專職人員或社務助理核放，並於 10 日內提交放款委員會追認。',
      requiresBoardSpecialMajority: false,
    };
  }

  // 4. 一般無擔保放款（超股金但為一般社員）：放款委員會組織規則第 10 條、第 11 條
  return {
    level: 'committee',
    tag: '放款委員會審查',
    authority: '放款委員會（全數通過）',
    text: '放款委員會審核放款應有過半數委員出席並須出席委員全數通過方可批准。',
    requiresBoardSpecialMajority: false,
  };
}
