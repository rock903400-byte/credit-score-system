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
const GUARANTOR_SCORE_TABLE = { 0: 0, 1: 4, 2: 6, 3: 7, 4: 8, 5: 9 };
const GUARANTOR_TYPE_WEIGHT = { member: 1.0, non_member: 0.7 };
const GRADE_THRESHOLDS = { A: 90, B: 80, C: 70, D: 60 };
const GRADE_DTI_LIMITS = { A: 0.6, B: 0.5, C: 0.4, D: 0.3 };

// 擔保放款 LTV 上限（擔保放款辦法第 10、10-1 條）
const LTV_RATIOS = {
  residential_commercial_educational: 0.85, // 都市計畫住宅區、商業區、文教區
  other: 0.7, // 其他區段
};
const MORTGAGE_REGISTRATION_RATIO = 1.2; // 抵押權設定 ≥ 放款金額 × 120%（第 11 條）
const COLLATERAL_REAPPRAISAL_YEARS = 10; // 鑑價報告逾 10 年須重鑑（第 12 條）

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
  ];
  for (const f of numericFields) {
    if (input[f] < 0) errors.push(`「${f}」不可為負值`);
  }
  if (input.ratePercent > 20) errors.push('年利率 > 20% 異常，請確認');
  if (input.years > 50) errors.push('貸款年限過長（> 50 年），請確認');
  // [FIX 2.1] 年齡 <= 0 直接擋下（避免留白 / 負數繞過所有年齡控管）
  if (input.age <= 0) errors.push('年齡為必填欄位且須大於 0');
  else if (input.age < 18)
    errors.push('年齡未滿 18 歲，須取得法定代理人書面同意後送件');
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
  if (input.ratePercent > 20) setErr('rate', '年利率 > 20% 異常，請確認');
  if (input.years > 50) setErr('years', '貸款年限過長（> 50 年），請確認');
  if (input.age <= 0) setErr('age', '年齡為必填欄位且須大於 0');
  else if (input.age < 18)
    setErr('age', '年齡未滿 18 歲須取得法定代理人書面同意');

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
  // [FIX 1.6] DSR 含社外 + 本社月付
  const baselineDsr =
    (input.existingDebt + input.internalMonthly) / input.income;
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

  // Protection (20%) — 擔保 12 + 保證人(加權) 9 + 保證人DSR 5 理論值 26，封頂 20 維持 5P 權重
  let effectiveGuarantorCount = 0;
  if (input.guarantors && input.guarantors.length > 0) {
    input.guarantors.forEach((g) => {
      const weight = GUARANTOR_TYPE_WEIGHT[g.type] || 1.0;
      effectiveGuarantorCount += weight;
    });
  }
  effectiveGuarantorCount = Math.round(effectiveGuarantorCount);
  const protectionScore = Math.min(
    20,
    parseInt(input.collateral) +
      (GUARANTOR_SCORE_TABLE[effectiveGuarantorCount] || 0) +
      guarantorDsrScore
  );

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
  // [FIX 1.5] 否決線比對「核貸後總負債比」
  const postLoanDti =
    input.income > 0
      ? (input.existingDebt + input.internalMonthly + newLoanMonthlyPmt) /
        input.income
      : Infinity;

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

  // ⑩ 擔保放款：貸款金額不得超過鑑估價值 × LTV 上限（辦法第 10、10-1 條）
  if (input.collateral === '10') {
    const appraisal = input.appraisalValue || 0;
    const zone = input.collateralZone || 'other';
    const ltv = LTV_RATIOS[zone] || LTV_RATIOS.other;
    const ltvCeiling = Math.floor(appraisal * ltv);
    if (input.proposedLoan > ltvCeiling) {
      vetoes.push(
        `擔保放款金額（${input.proposedLoan.toLocaleString('zh-TW')} 元）超過鑑估價值 ${appraisal.toLocaleString('zh-TW')} 元 × LTV ${(ltv * 100).toFixed(0)}% ＝ ${ltvCeiling.toLocaleString('zh-TW')} 元`
      );
    }
    // ⑩-1 抵押權設定金額 ≥ 放款金額 × 120%（辦法第 11 條）
    const requiredMortgage = input.proposedLoan * MORTGAGE_REGISTRATION_RATIO;
    if (requiredMortgage > ltvCeiling) {
      vetoes.push(
        `抵押權設定金額（放款 × 120% = ${Math.ceil(requiredMortgage).toLocaleString('zh-TW')} 元）超過鑑估價值 LTV 上限（${ltvCeiling.toLocaleString('zh-TW')} 元），請確認鑑估價值或降低放款金額`
      );
    }
    // ⑩-2 屋齡與年限檢核（辦法第 3 條之 1）
    const houseAge = input.houseAge || 0;
    if (houseAge <= 20 && input.years > MAX_SECURED_YEARS) {
      vetoes.push(
        `屋齡 ${houseAge} 年 ≤ 20 年之自用住宅，貸款年限上限 ${MAX_SECURED_YEARS} 年，目前 ${input.years} 年超過上限`
      );
    } else if (houseAge > 20 && input.years > SECURED_YEARS_STANDARD) {
      vetoes.push(
        `屋齡 ${houseAge} 年 > 20 年，貸款年限上限 ${SECURED_YEARS_STANDARD} 年，目前 ${input.years} 年超過上限`
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
  }

  return { vetoes, newLoanMonthlyPmt, postLoanDti };
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
  const maxAvailablePmt =
    input.income * maxDti - input.existingDebt - input.internalMonthly;
  if (maxAvailablePmt <= 0) return 0;
  const r = input.ratePercent / 100 / 12;
  const n = input.years * 12;
  const factor =
    r === 0 ? 1 / n : (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return maxAvailablePmt / factor;
}

// 計算建議增貸額度（一般增貸 + 整併增貸）
function computeSuggestedAdditionalLoan(
  input,
  maxDti,
  internalMonthly2 = 0,
  internalBalance2 = 0
) {
  if (maxDti <= 0) return { general: 0, consolidation: 0 };
  const totalExistingMonthly =
    input.existingDebt + input.internalMonthly + internalMonthly2;
  const maxAvailablePmt = input.income * maxDti - totalExistingMonthly;
  if (maxAvailablePmt <= 0) return { general: 0, consolidation: 0 };
  const r = input.ratePercent / 100 / 12;
  const n = input.years * 12;
  const factor =
    r === 0 ? 1 / n : (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const generalAmount = maxAvailablePmt / factor;
  const consolidationAmount =
    generalAmount + input.internalBalance + internalBalance2;
  return { general: generalAmount, consolidation: consolidationAmount };
}

// 整併貸款試算：將既有貸款併入新貸款
function computeConsolidationScenario(
  input,
  internalMonthly2 = 0,
  internalBalance2 = 0,
  internalYears2 = 0,
  internalRate2 = 0
) {
  const newLoanMonthlyPmt = pmt(
    input.proposedLoan,
    input.ratePercent,
    input.years
  );
  const totalMonthly =
    input.existingDebt +
    input.internalMonthly +
    internalMonthly2 +
    newLoanMonthlyPmt;
  const consolidationLoanAmount =
    input.proposedLoan + input.internalBalance + internalBalance2;
  const consolidationMonthly = pmt(
    consolidationLoanAmount,
    input.ratePercent,
    input.years
  );
  const monthlySavings =
    input.internalMonthly + internalMonthly2 - consolidationMonthly;
  return {
    currentTotalMonthly: input.internalMonthly + internalMonthly2,
    newLoanMonthlyPmt,
    totalMonthlyAfterNew:
      input.internalMonthly + internalMonthly2 + newLoanMonthlyPmt,
    consolidationLoanAmount,
    consolidationMonthly,
    monthlySavings,
    totalExposure:
      input.internalBalance + internalBalance2 + input.proposedLoan,
  };
}

function applyLegalCeiling(input, maxLoanLimit) {
  let ceiling;
  if (input.collateral === '10') {
    const appraisal = input.appraisalValue || 0;
    const zone = input.collateralZone || 'other';
    const ltv = LTV_RATIOS[zone] || LTV_RATIOS.other;
    ceiling = Math.min(NATURAL_PERSON_CAP, Math.floor(appraisal * ltv));
  } else if (input.collateral === '12') {
    ceiling = Math.min(NATURAL_PERSON_CAP, input.shares);
  } else {
    ceiling = input.shares + CREDIT_FLOOR_PER_SHARE;
  }
  let limit = Math.min(maxLoanLimit, ceiling);
  if (input.age < 18) {
    limit = Math.min(limit, Math.max(0, input.shares - input.internalBalance));
  }
  return limit;
}
