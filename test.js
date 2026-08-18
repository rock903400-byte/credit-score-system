// ============================================================
// 自動化測試 — Node.js vm 沙箱執行 core.js 核心邏輯
// ============================================================
const fs = require('fs');
const vm = require('vm');

// 讀取 core.js（純業務邏輯，無 DOM 相依）
const coreJs = fs.readFileSync(__dirname + '/core.js', 'utf8');

// 沙箱（只需 localStorage mock，無需 DOM）
const ctx = {
  console: console,
  Math,
  Date,
  String,
  Number,
  Array,
  Object,
  JSON,
  RegExp,
  parseInt,
  parseFloat,
  isNaN,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  localStorage: {
    _store: {},
    getItem(k) {
      return this._store[k] ?? null;
    },
    setItem(k, v) {
      this._store[k] = v;
    },
    removeItem(k) {
      delete this._store[k];
    },
  },
};

// 執行 core.js
vm.runInNewContext(coreJs, ctx);

const {
  computeScore: CS,
  applyRegulatoryVetoes: ARV,
  determineGrade: DG,
  computeMaxLoan: CML,
  applyLegalCeiling: ALC,
  validateInputs: VI,
  validateInputsByField: VIBF,
  computeSuggestedAdditionalLoan: CSAL,
  computeConsolidationScenario: CCS,
  determineGovernanceRouting: DGR,
  computeCashFlow: CCF,
  getLoanLimitDetails: GLLD,
  getEffectiveIncome: GEI,
  INCOME_STABILITY_HAIRCUT,
  GUARANTOR_HIGH_DSR_THRESHOLD,
  GUARANTOR_UNKNOWN_WEIGHT_RATIO,
  DEFAULT_LIVING_EXPENSE,
  REGIONAL_MIN_LIVING_COST_115,
  JUDICIAL_LIVING_MULTIPLIER,
  pmt: PMT,
  formatAmount: FA,
  escapeHtml: EH,
} = ctx;

// ============================================================
// 測試執行器
// ============================================================
let passed = 0,
  failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('  \x1b[32mPASS\x1b[0m: ' + name + '\n');
  } catch (e) {
    failed++;
    process.stdout.write(
      '  \x1b[31mFAIL\x1b[0m: ' +
        name +
        '\n         ' +
        e.message.substring(0, 160) +
        '\n'
    );
  }
}
function assert(c, m) {
  if (!c) throw new Error(m || 'assertion failed');
}
function approx(a, b, tol, m) {
  tol = tol || 0.001;
  if (Math.abs(a - b) > tol)
    throw new Error((m || '') + ': expected ~' + b + ', got ' + a);
}

// ============================================================
// 測試開始
// ============================================================

console.log('\n── PMT 公式 (3) ──');
test('100萬/5年/3% ≈ 19167（首期本金 16666.67 + 首期利息 2500）', () =>
  approx(PMT(1_000_000, 3, 5), 19166.67, 1));
test('r=0 分期 120萬/10年 = 1萬/月', () =>
  approx(PMT(120_000, 0, 10), 1000, 0.01));
test('100萬/7年/2.5% 在合理範圍', () => {
  const p = PMT(1_000_000, 2.5, 7);
  assert(p > 10000 && p < 14000, 'got:' + p.toFixed(0));
});
test('n=1 邊界：1000/12%/1月 = 1010（精確首期）', () =>
  assert(PMT(1000, 12, 1 / 12) === 1010, 'got:' + PMT(1000, 12, 1 / 12)));

console.log('\n── formatAmount / escapeHtml (6) ──');
test('45000 → 4.5 萬元', () => assert(FA(45000) === '4.5 萬元'));
test('10000000 → 1000 萬元', () => assert(FA(10_000_000) === '1000 萬元'));
test('99999500 → 1.0 億元 (邊界進位)', () =>
  assert(FA(99_999_500) === '1.0 億元'));
test('99999499 → 9999.9 萬元 (邊界不進位)', () =>
  assert(FA(99_999_499) === '9999.9 萬元'));
test('0 → 空字串', () => assert(FA(0) === ''));
test('<script> → escaped', () => assert(EH('<script>') === '&lt;script&gt;'));

console.log('\n── validateInputs (5) ──');
test('空輸入 ≥4 錯誤', () => {
  const i = {
    income: 0,
    years: 0,
    proposedLoan: 0,
    age: 0,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    ratePercent: 0,
    shares: 0,
    guarantors: [],
  };
  assert(VI(i).length >= 4, 'got:' + VI(i).length);
});
test('正常輸入 0 錯誤', () => {
  const i = {
    income: 50000,
    years: 5,
    proposedLoan: 300000,
    age: 40,
    existingDebt: 5000,
    internalMonthly: 2000,
    internalBalance: 0,
    ratePercent: 3,
    shares: 50000,
    guarantors: [],
  };
  assert(VI(i).length === 0, 'got:' + VI(i).length);
});
test('負值觸發阻擋', () => {
  const i = {
    income: -500,
    years: 5,
    proposedLoan: 300000,
    age: 40,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    ratePercent: 3,
    shares: 50000,
    guarantors: [],
  };
  assert(VI(i).some((e) => e.includes('負值')));
});
test('未滿18歲警告', () => {
  const i = {
    income: 50000,
    years: 5,
    proposedLoan: 300000,
    age: 16,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    ratePercent: 3,
    shares: 50000,
    guarantors: [],
  };
  assert(VI(i).some((e) => e.includes('18')));
});
test('利率>20%警告', () => {
  const i = {
    income: 50000,
    years: 5,
    proposedLoan: 300000,
    age: 40,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    ratePercent: 25,
    shares: 50000,
    guarantors: [],
  };
  assert(VI(i).some((e) => e.includes('20')));
});

console.log('\n── validateInputsByField (2) ──');
test('多欄位錯誤分組', () => {
  const i = {
    income: 0,
    years: 0,
    proposedLoan: 0,
    age: 0,
    existingDebt: -1,
    internalMonthly: -1,
    internalBalance: 0,
    ratePercent: 25,
    shares: -1,
    guarantors: [],
  };
  const fe = VIBF(i);
  ['income', 'years', 'loan', 'age', 'existing_debt', 'rate', 'shares'].forEach(
    (k) => assert(fe[k], '缺' + k + '錯誤')
  );
});
test('保證人錯誤', () => {
  const i = {
    income: 50000,
    years: 5,
    proposedLoan: 300000,
    age: 40,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    ratePercent: 3,
    shares: 50000,
    guarantors: [{ name: '', income: 0, debt: -100 }],
    guarantorCount: 1,
  };
  const fe = VIBF(i);
  assert(fe.g_name_0 && fe.g_income_0 && fe.g_debt_0, '缺保證人欄位錯誤');
});
test('入社未滿1年但選儲蓄超過12個月 → 邏輯矛盾阻擋', () => {
  const i = {
    income: 50000,
    years: 5,
    proposedLoan: 300000,
    age: 40,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    ratePercent: 3,
    shares: 50000,
    membership: 1,
    interaction: 10,
    guarantors: [],
  };
  assert(VI(i).some((e) => e.includes('入社年資未滿 1 年')));
  const fe = VIBF(i);
  assert(
    fe.interaction && fe.interaction.includes('入社未滿 1 年'),
    'interaction 欄位應有矛盾錯誤'
  );
});

console.log('\n── computeScore (3) ──');
test('優質借款人 ≥ 90 分', () => {
  const inp = {
    income: 80000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 400000,
    incomeStability: 9,
    tenure: 6,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '12',
    guarantorCount: 1,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 200000,
    guarantors: [{ name: 'a', income: 60000, debt: 0 }],
  };
  assert(CS(inp).total >= 90, 'got:' + CS(inp).total);
});
test('不良借款人 < 60', () => {
  const inp = {
    income: 30000,
    age: 60,
    years: 10,
    ratePercent: 5,
    existingDebt: 15000,
    internalMonthly: 5000,
    proposedLoan: 200000,
    incomeStability: 1,
    tenure: 2,
    interaction: -20,
    jcic: 'veto',
    membership: 1,
    collateral: '0',
    guarantorCount: 0,
    purpose: '7',
    career: 2,
    participation: 1,
    internalBalance: 0,
    shares: 10000,
    guarantors: [],
  };
  assert(CS(inp).total < 60, 'got:' + CS(inp).total);
});
test('保證人全部不詳：guarantorDsrScore=0且人數權重折半認列', () => {
  const inp = {
    income: 60000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    incomeStability: 9,
    tenure: 4,
    interaction: 7,
    jcic: '10',
    membership: 3,
    collateral: '10',
    guarantorCount: 3,
    purpose: '10',
    career: 4,
    participation: 3,
    internalBalance: 0,
    shares: 100000,
    guarantors: [
      { name: 'A', income: 50000, debt: 0, type: 'member', unknown: true },
      { name: 'B', income: 40000, debt: 0, type: 'non_member', unknown: true },
      { name: 'C', income: 60000, debt: 0, type: 'member', unknown: true },
    ],
  };
  // 債務不詳折半加權: 1.0*0.5 + 0.7*0.5 + 1.0*0.5 = 0.5 + 0.35 + 0.5 = 1.35 → round 1 → +3
  // guarantorDsrScore: 0 (全部不詳, validDsrs 空)
  // rawProtectionScore = 12 (collateral) + 3 (guarantor) + 0 (dsr) = 15 → ×0.8 = 12
  assert(CS(inp).protectionScore === 12, 'got:' + CS(inp).protectionScore);
});
test('保證人混合（2 不詳 + 1 正常揭露）：正常揭露計入 DSR，不詳者折半', () => {
  // A (member, unknown): 0.5
  // B (non_member, debt=10000, income=50000 -> DSR=0.2 < 0.3): 0.7, DSR +5
  // C (member, unknown): 0.5
  // 有效加權 = 0.5 + 0.7 + 0.5 = 1.7 → round 2 → +5
  // DSR = 0.2 < 0.3 → +5
  // raw = 12 + 5 + 5 = 22 → ×0.8 = 17.6 → round → 18
  const inp = {
    income: 60000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    incomeStability: 9,
    tenure: 4,
    interaction: 7,
    jcic: '10',
    membership: 3,
    collateral: '10',
    guarantorCount: 3,
    purpose: '10',
    career: 4,
    participation: 3,
    internalBalance: 0,
    shares: 100000,
    guarantors: [
      { name: 'A', income: 50000, debt: 0, type: 'member', unknown: true },
      {
        name: 'B',
        income: 50000,
        debt: 10000,
        type: 'non_member',
        unknown: false,
      },
      { name: 'C', income: 60000, debt: 0, type: 'member', unknown: true },
    ],
  };
  assert(CS(inp).protectionScore === 18, 'got:' + CS(inp).protectionScore);
});
test('高負債保證人過濾：DSR >= 65% 排除人數與 DSR 加分', () => {
  const inp = {
    income: 60000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    incomeStability: 9,
    tenure: 4,
    interaction: 7,
    jcic: '10',
    membership: 3,
    collateral: '10',
    guarantorCount: 1,
    purpose: '10',
    career: 4,
    participation: 3,
    internalBalance: 0,
    shares: 100000,
    guarantors: [
      {
        name: '高負債保人',
        income: 50000,
        debt: 35000, // DSR = 70% >= 65%
        type: 'member',
        unknown: false,
      },
    ],
  };
  const res = CS(inp);
  // 加權人數 = 0 → guarantorScore = 0
  // validDsrs 空 → guarantorDsrScore = 0
  // rawProtectionScore = 12 + 0 + 0 = 12 → ×0.8 = 9.6 → 10
  assert(res.protectionScore === 10, 'got:' + res.protectionScore);
  assert(res.protectionBreakdown.guarantor === 0, 'guarantor should be 0');
  assert(
    res.protectionBreakdown.guarantorDsr === 0,
    'guarantorDsr should be 0'
  );
});
test('年齡罰分 65-70 到期 = -5', () => {
  const inp = {
    income: 50000,
    age: 66,
    years: 3,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).ageScore === -5, 'got:' + CS(inp).ageScore);
});
test('年齡罰分 65 到期 = 0', () => {
  const inp = {
    income: 50000,
    age: 62,
    years: 3,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).ageScore === 0, 'got:' + CS(inp).ageScore);
});
test('年齡罰分 70 到期 = -5', () => {
  const inp = {
    income: 50000,
    age: 67,
    years: 3,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).ageScore === -5, 'got:' + CS(inp).ageScore);
});
test('年齡罰分 71 到期 = -10', () => {
  const inp = {
    income: 50000,
    age: 68,
    years: 3,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).ageScore === -10, 'got:' + CS(inp).ageScore);
});
test('年齡罰分 75 到期 = -10 (否決在 ARV 是 >75)', () => {
  const inp = {
    income: 50000,
    age: 72,
    years: 3,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).ageScore === -10, 'got:' + CS(inp).ageScore);
});
test('總分上限 100：超量輸入 clamp 為 100', () => {
  const inp = {
    income: 200000,
    age: 30,
    years: 3,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 100000,
    incomeStability: 100,
    tenure: 100,
    interaction: 100,
    jcic: '100',
    membership: 100,
    collateral: '12',
    guarantorCount: 5,
    guarantors: [],
    purpose: '100',
    career: 100,
    participation: 100,
    internalBalance: 0,
    shares: 1000000,
  };
  const r = CS(inp);
  assert(r.total === 100, 'got:' + r.total);
});
test('總分下限 0：負分輸入 clamp 為 0', () => {
  const inp = {
    income: 50000,
    age: 60,
    years: 20,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 100000,
    incomeStability: 0,
    tenure: 0,
    interaction: -100,
    jcic: '1',
    membership: 0,
    collateral: '0',
    guarantorCount: 0,
    guarantors: [],
    purpose: '1',
    career: 0,
    participation: 0,
    internalBalance: 0,
    shares: 100000,
  };
  const r = CS(inp);
  assert(r.total === 0, 'got:' + r.total);
});
test('年齡罰分 76 到期 = -10 (否決在 ARV)', () => {
  const inp = {
    income: 50000,
    age: 73,
    years: 3,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).ageScore === -10, 'got:' + CS(inp).ageScore);
});
test('income=0 回傳零分物件', () => {
  const inp = {
    income: 0,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 200000,
    guarantors: [],
  };
  const r = CS(inp);
  assert(
    r.total === 0 && r.dsr === 0 && r.dsrScore === 0 && r.ageScore === 0,
    'got:' + JSON.stringify(r)
  );
});

console.log('\n── DSR 給分級距（每 5% 一檔） (13) ──');
// income 100000、existingDebt = DSR×100000，逐一打在級距邊界上
[
  [0.399, 20],
  [0.4, 18],
  [0.449, 18],
  [0.45, 16],
  [0.499, 16],
  [0.5, 13],
  [0.549, 13],
  [0.55, 10],
  [0.599, 10],
  [0.6, 6],
  [0.649, 6],
  [0.65, 3],
  [0.699, 3],
].forEach(([dsr, expected]) => {
  test(`DSR ${(dsr * 100).toFixed(1)}% → ${expected} 分`, () => {
    const inp = {
      income: 100000,
      age: 40,
      years: 5,
      ratePercent: 3,
      existingDebt: dsr * 100000,
      internalMonthly: 0,
      proposedLoan: 200000,
      incomeStability: 9,
      tenure: 4,
      interaction: 10,
      jcic: '10',
      membership: 5,
      collateral: '10',
      guarantorCount: 0,
      purpose: '10',
      career: 6,
      participation: 4,
      internalBalance: 0,
      shares: 100000,
      guarantors: [],
    };
    assert(CS(inp).dsrScore === expected, 'got:' + CS(inp).dsrScore);
  });
});
test('DSR 70% → 0 分（否決由 ARV 處理）', () => {
  const inp = {
    income: 100000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 70000,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).dsrScore === 0, 'got:' + CS(inp).dsrScore);
});

console.log('\n── 聯徵中間檔 jcic=2 (2) ──');
test('jcic=2 計入 peopleScore（10+2+5=17）', () => {
  const inp = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 200000,
    incomeStability: 6,
    tenure: 4,
    interaction: 10,
    jcic: '2',
    membership: 5,
    collateral: '10',
    guarantorCount: 0,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [],
  };
  assert(CS(inp).peopleScore === 17, 'got:' + CS(inp).peopleScore);
});
test('jcic=2 不觸發聯徵否決', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: '2',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
  };
  assert(
    !ARV(i).vetoes.some((v) => v.includes('聯徵')),
    'got:' + JSON.stringify(ARV(i).vetoes)
  );
});

console.log('\n── applyRegulatoryVetoes (8) ──');
test('到期>75 → veto', () => {
  const i = {
    income: 80000,
    age: 72,
    years: 10,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
  };
  assert(ARV(i).vetoes.some((v) => v.includes('75')));
});
test('>7年無不動產 → veto', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 8,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    collateral: '5',
    shares: 200000,
    internalBalance: 0,
  };
  assert(ARV(i).vetoes.some((v) => v.includes('7')));
});
test('聯徵veto → veto', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: 'veto',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
  };
  assert(ARV(i).vetoes.some((v) => v.includes('聯徵')));
});
test('DTI > 70% → veto', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 60000,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
  };
  assert(ARV(i).vetoes.some((v) => v.includes('70.0%')));
});
test('用途veto → veto', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: '10',
    purpose: 'veto',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
  };
  assert(ARV(i).vetoes.some((v) => v.includes('用途')));
});
test('正常案 0 否決', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    mortgageAmount: 1_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(ARV(i).vetoes.length === 0, 'got:' + ARV(i).vetoes.join(';'));
});
test('抵押權設定金額不足放款 120% → 否決', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    mortgageAmount: 599999,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(
    ARV(i).vetoes.some((v) => v.includes('120%')),
    'got:' + ARV(i).vetoes.join(';')
  );
});
test('income=0 → postLoanDti=Infinity', () => {
  const i = {
    income: 0,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(ARV(i).postLoanDti === Infinity);
});
test('擔保品12 ≤7年 loan>shares → veto', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    collateral: '12',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(ARV(i).vetoes.some((v) => v.includes('足額股金內借款')));
});
test('擔保品12 >7年 不觸發此規則（由規則④處理）', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 8,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    collateral: '12',
    shares: 200000,
    internalBalance: 0,
  };
  const v = ARV(i).vetoes;
  assert(
    !v.some((x) => x.includes('足額股金內借款')),
    '不應觸發12規則，got:' + v.join(';')
  );
});
test('源碼：19 條否決規則（含擔保品12、年限30年、擔保放款新規則、土地上限、抵押權120%、第三人保證人、收支赤字否決、DBR 22倍否決）', () => {
  const src = fs.readFileSync(__dirname + '/core.js', 'utf8');
  const vf = src.substring(
    src.indexOf('function applyRegulatoryVetoes'),
    src.indexOf('function determineGrade')
  );
  assert(
    (vf.match(/vetoes\.push/g) || []).length === 19,
    'got:' + (vf.match(/vetoes\.push/g) || []).length
  );
});
test('月薪 3 萬申請 70 萬純信用借款 → 觸發第 19 條 DBR 22 倍否決', () => {
  const i = {
    income: 30000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 700000,
    collateral: '0',
    shares: 50000,
  };
  const v = ARV(i).vetoes;
  assert(
    v.some((x) => x.includes('22 倍')),
    '未觸發 22 倍否決，got:' + v.join(';')
  );
});
test('月薪 3 萬申請 50 萬純信用借款但已有外部無擔保負債 20 萬 → 合計 70 萬觸發 DBR 22 倍否決', () => {
  const i = {
    income: 30000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 5000,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 500000,
    collateral: '0',
    shares: 50000,
    additionalLoans: [{ monthly: 0, balance: 200000, years: 0, rate: 0 }],
  };
  const v = ARV(i).vetoes;
  assert(
    v.some((x) => x.includes('22 倍')),
    '未觸發 22 倍否決'
  );
});
test('不動產擔保與足額股金借款不受 DBR 22 倍限制', () => {
  const i1 = {
    income: 30000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 2000000,
    collateral: '10',
    appraisalValue: 5000000,
    mortgageAmount: 2400000,
    collateralZone: 'other',
    houseAge: 10,
    appraisalAge: 2,
    shares: 50000,
  };
  const v1 = ARV(i1).vetoes;
  assert(
    !v1.some((x) => x.includes('22 倍')),
    '不動產擔保不應觸發 DBR 22 否決'
  );

  const i2 = {
    income: 30000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 1000000,
    collateral: '12',
    shares: 1000000,
  };
  const v2 = ARV(i2).vetoes;
  assert(
    !v2.some((x) => x.includes('22 倍')),
    '足額股金借款不應觸發 DBR 22 否決'
  );
});
test('第三人擔保品無保證人 → 否決（辦法第 14 條）', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    collateralOwner: 'third_party',
    guarantorCount: 0,
    guarantors: [],
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    mortgageAmount: 1_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(
    ARV(i).vetoes.some((v) => v.includes('第三人')),
    'got:' + ARV(i).vetoes.join(';')
  );
});
test('第三人擔保品有保證人 → 通過第三人檢核', () => {
  const i = {
    income: 80000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 500000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    collateralOwner: 'third_party',
    guarantorCount: 1,
    guarantors: [
      {
        name: '王大明',
        income: 50000,
        debt: 0,
        type: 'member',
        unknown: false,
      },
    ],
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    mortgageAmount: 1_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(
    !ARV(i).vetoes.some((v) => v.includes('第三人')),
    'got:' + ARV(i).vetoes.join(';')
  );
});
test('年限 35 年 → veto（擔保放款最長 30 年）', () => {
  const i = {
    income: 80000,
    age: 30,
    years: 35,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 5_000_000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(
    ARV(i).vetoes.some((v) => v.includes('30 年')),
    'got:' + ARV(i).vetoes.join(';')
  );
});
test('年限 25 年 + 不動產（自用住宅）→ 不觸發年限否決', () => {
  const i = {
    income: 80000,
    age: 35,
    years: 25,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 5_000_000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    mortgageAmount: 8_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
    isSelfOccupied: true,
  };
  assert(ARV(i).vetoes.length === 0, 'got:' + ARV(i).vetoes.join(';'));
});
test('年限 25 年 + 屋齡≤20 非自用住宅 → 20 年上限否決', () => {
  const i = {
    income: 80000,
    age: 35,
    years: 25,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 5_000_000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    mortgageAmount: 8_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
    isSelfOccupied: false,
  };
  const v = ARV(i).vetoes;
  assert(
    v.some((x) => x.includes('非自用住宅') && x.includes('20 年')),
    'got:' + v.join(';')
  );
});
test('年限 21 年 + 屋齡≤20 非自用住宅 → 否決；自用住宅 → 放行', () => {
  const base = {
    income: 80000,
    age: 35,
    years: 21,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 5_000_000,
    jcic: '10',
    purpose: '10',
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    appraisalValue: 10_000_000,
    mortgageAmount: 8_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(
    ARV({ ...base, isSelfOccupied: false }).vetoes.some((x) =>
      x.includes('非自用住宅')
    ),
    '非自用應否決'
  );
  assert(
    ARV({ ...base, isSelfOccupied: true }).vetoes.length === 0,
    '自用 21 年應放行，got:' +
      ARV({ ...base, isSelfOccupied: true }).vetoes.join(';')
  );
});

console.log('\n── determineGovernanceRouting (5) ──');
test('案件被否決 → veto 層級', () => {
  const inp = { proposedLoan: 500000, shares: 100000, collateral: '0' };
  const res = { isVetoed: true };
  const gov = DGR(inp, res);
  assert(gov.level === 'veto' && gov.tag === '不予核貸');
});
test('理監事無擔保借款超過股金 → 理事會特別決議（須 2/3 出席同意）', () => {
  const inp = {
    borrowerRole: 'board',
    proposedLoan: 500000,
    internalBalance: 0,
    shares: 200000,
    collateral: '5',
  };
  const res = { isVetoed: false };
  const gov = DGR(inp, res);
  assert(
    gov.level === 'board_special' && gov.requiresBoardSpecialMajority === true
  );
  assert(gov.tag.includes('特別決議'));
});
test('職員無擔保借款在股金內 → 專職授權核放', () => {
  const inp = {
    borrowerRole: 'staff',
    proposedLoan: 100000,
    internalBalance: 0,
    shares: 200000,
    collateral: '5',
  };
  const res = { isVetoed: false };
  const gov = DGR(inp, res);
  assert(gov.level === 'staff_delegated' && gov.tag === '專職授權核放');
});
test('一般社員申請擔保放款 → 理事會決議（放款會初審後送理事會）', () => {
  const inp = {
    borrowerRole: 'member',
    proposedLoan: 3000000,
    internalBalance: 0,
    shares: 200000,
    collateral: '10',
  };
  const res = { isVetoed: false };
  const gov = DGR(inp, res);
  assert(gov.level === 'board_general' && gov.tag === '理事會決議');
});
test('一般社員申請無擔保放款超過股金 → 放款委員會審查（全數通過）', () => {
  const inp = {
    borrowerRole: 'member',
    proposedLoan: 500000,
    internalBalance: 0,
    shares: 200000,
    collateral: '5',
  };
  const res = { isVetoed: false };
  const gov = DGR(inp, res);
  assert(gov.level === 'committee' && gov.tag === '放款委員會審查');
});

console.log('\n── determineGrade (3) ──');
test('95→A / DTI 0.6', () => {
  const g = DG(95, false);
  assert(
    g.grade === 'A' && g.maxDti === 0.6,
    'got:' + g.grade + '/' + g.maxDti
  );
});
test('55→E', () => assert(DG(55, false).grade === 'E'));
test('否決→E+DTI=0', () => {
  const g = DG(95, true);
  assert(g.grade === 'E' && g.maxDti === 0, 'got:' + g.grade + '/' + g.maxDti);
});

console.log('\n── computeMaxLoan (2) ──');
test('5萬/50%/5Y/3% → ≈130萬', () => {
  const i = {
    income: 50000,
    existingDebt: 0,
    internalMonthly: 0,
    ratePercent: 3,
    years: 5,
  };
  approx(CML(i, 0.5), 1304348, 3000);
});
test('DTI=0→0', () =>
  assert(
    CML(
      {
        income: 50000,
        existingDebt: 0,
        internalMonthly: 0,
        ratePercent: 3,
        years: 5,
      },
      0
    ) === 0
  ));

console.log('\n── 整併模式：額外既有貸款納入 DSR / 否決線 (5) ──');
test('額外貸款月付計入 baseline DSR 評分', () => {
  const i = {
    income: 100000,
    existingDebt: 5000,
    internalMonthly: 5000,
    additionalLoans: [{ monthly: 10000, balance: 300000, years: 5, rate: 4 }],
    age: 40,
    years: 5,
    ratePercent: 3,
    proposedLoan: 100000,
    shares: 50000,
    collateral: '5',
    interaction: 7,
    jcic: '10',
    membership: 3,
    purpose: '10',
    career: 4,
    participation: 2,
    incomeStability: 6,
    tenure: 4,
  };
  // (5000+5000+10000)/100000 = 20% → DSR 20 分
  assert(CS(i).dsrScore === 20, 'got:' + CS(i).dsrScore);
});
test('額外貸款月付計入 70% 否決線', () => {
  const i = {
    income: 100000,
    existingDebt: 0,
    internalMonthly: 0,
    // 70000 + 新貸月付 383 = 70.4% > 70%
    additionalLoans: [{ monthly: 70000, balance: 0, years: 3, rate: 3 }],
    age: 40,
    years: 5,
    ratePercent: 3,
    proposedLoan: 20000,
    shares: 50000,
    collateral: '5',
    jcic: '10',
    purpose: '10',
    interaction: 7,
    membership: 3,
    career: 4,
    participation: 2,
    incomeStability: 6,
    tenure: 4,
  };
  const v = ARV(i).vetoes;
  assert(
    v.some((x) => x.includes('70.0%')),
    'got:' + v.join(';')
  );
});
test('額外貸款月付計入 computeMaxLoan 可貸額度', () => {
  // 無額外貸款：可貸 = (50000*0.5-0)/factor
  const base = {
    income: 50000,
    existingDebt: 0,
    internalMonthly: 0,
    ratePercent: 3,
    years: 5,
  };
  const withExt = {
    ...base,
    additionalLoans: [{ monthly: 10000, balance: 0, years: 5, rate: 3 }],
  };
  const noExt = CML(base, 0.5);
  const ext = CML(withExt, 0.5);
  assert(ext < noExt, `ext ${ext} 應小於 noExt ${noExt}`);
  approx(noExt - ext, 10000 / (1 / 60 + 0.03 / 12), 50);
});
test('整併試算：多筆既有合計（月付/餘額/月省）', () => {
  const i = {
    existingDebt: 0,
    internalMonthly: 5000,
    internalBalance: 200000,
    additionalLoans: [
      { monthly: 3000, balance: 100000, years: 3, rate: 4 },
      { monthly: 2000, balance: 50000, years: 2, rate: 5 },
    ],
    proposedLoan: 800000,
    ratePercent: 3,
    years: 7,
  };
  const cs = CCS(i);
  assert(cs.currentTotalMonthly === 10000, 'got:' + cs.currentTotalMonthly);
  assert(
    cs.consolidationLoanAmount === 1150000,
    'got:' + cs.consolidationLoanAmount
  );
  assert(cs.totalExposure === 1150000, 'got:' + cs.totalExposure);
});
test('建議增貸額度：額外貸款併入既有月付與餘額', () => {
  const i = {
    income: 100000,
    existingDebt: 0,
    internalMonthly: 10000,
    internalBalance: 300000,
    additionalLoans: [{ monthly: 5000, balance: 150000, years: 4, rate: 4 }],
    ratePercent: 3,
    years: 5,
  };
  const s = CSAL(i, 0.6);
  approx(s.consolidation, s.general + 450000, 1);
  assert(s.general > 0, 'got:' + s.general);
});
test('負值額外既有貸款 → validateInputs 擋下', () => {
  const i = {
    income: 100000,
    age: 40,
    years: 5,
    ratePercent: 3,
    proposedLoan: 100000,
    shares: 50000,
    additionalLoans: [{ monthly: -1, balance: 0, years: 3, rate: 3 }],
  };
  assert(
    VI(i).some((e) => e.includes('既有貸款')),
    'got:' + VI(i).join(';')
  );
});

console.log('\n── applyLegalCeiling (3) ──');
test('信用借款=股金+100萬', () => {
  const i = { collateral: '0', shares: 200000, internalBalance: 0, age: 40 };
  assert(ALC(i, 10_000_000) === 1_200_000, 'got:' + ALC(i, 10_000_000));
});
test('不動產上限=1000萬', () => {
  const i = {
    collateral: '10',
    shares: 200000,
    internalBalance: 0,
    age: 40,
    appraisalValue: 10_000_000,
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(ALC(i, 10_000_000) === 8_500_000);
});
test('股金內借款上限=股金（與規則⑤一致）', () => {
  const i = { collateral: '12', shares: 200000, internalBalance: 0, age: 40 };
  assert(ALC(i, 10_000_000) === 200_000, 'got:' + ALC(i, 10_000_000));
});
test('月薪 3 萬無擔保放款：受評級 DBR 倍數階梯約束 (A級 20倍/60萬, B級 15倍/45萬, C級 12倍/36萬, D級 8倍/24萬)', () => {
  const base = {
    collateral: '0',
    shares: 200000,
    internalBalance: 0,
    age: 40,
    income: 30000,
  };
  assert(
    ALC(base, 10_000_000, 'A') === 600000,
    'A 級應為 60 萬，got:' + ALC(base, 10_000_000, 'A')
  );
  assert(
    ALC(base, 10_000_000, 'B') === 450000,
    'B 級應為 45 萬，got:' + ALC(base, 10_000_000, 'B')
  );
  assert(
    ALC(base, 10_000_000, 'C') === 360000,
    'C 級應為 36 萬，got:' + ALC(base, 10_000_000, 'C')
  );
  assert(
    ALC(base, 10_000_000, 'D') === 240000,
    'D 級應為 24 萬，got:' + ALC(base, 10_000_000, 'D')
  );
});
test('getLoanLimitDetails：正確辨識 DBR 瓶頸與限制原因', () => {
  const i = {
    collateral: '0',
    shares: 50000,
    internalBalance: 0,
    existingDebt: 0,
    internalMonthly: 0,
    age: 35,
    income: 30000,
    years: 5,
    ratePercent: 3,
  };
  const d = GLLD(i, 800000, 'B');
  assert(d.finalLimit === 450000, 'B 級額度應為 45 萬');
  assert(d.primaryLimiter === 'dbr_grade_cap', '主要限制因子應為 DBR');
  assert(d.limiterText.includes('15 倍'), '應包含 15 倍說明');
});

console.log('\n── 債權保障封頂 (1) ──');
test('擔保12+5保人 protection=20 (raw 12+8+5=25→×0.8→20)、總分≤100', () => {
  const inp = {
    income: 80000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 150000,
    incomeStability: 9,
    tenure: 6,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '12',
    guarantorCount: 5,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 200000,
    guarantors: [1, 2, 3, 4, 5].map((n) => ({
      name: 'g' + n,
      income: 60000,
      debt: 0,
      type: 'member',
    })),
  };
  const r = CS(inp);
  assert(r.protectionScore === 20, 'protection got:' + r.protectionScore);
  assert(r.total <= 100, 'total got:' + r.total);
});

console.log('\n── LTV 覆蓋加成 (6) ──');
const protectionBase = {
  income: 80000,
  age: 35,
  years: 5,
  ratePercent: 3,
  existingDebt: 0,
  internalMonthly: 0,
  proposedLoan: 3000000,
  incomeStability: 9,
  tenure: 6,
  interaction: 10,
  jcic: '10',
  membership: 5,
  collateral: '10',
  guarantorCount: 0,
  guarantors: [],
  purpose: '10',
  career: 6,
  participation: 4,
  internalBalance: 0,
  shares: 200000,
};
const ltvCase = (loan, appraisal) =>
  CS({ ...protectionBase, proposedLoan: loan, appraisalValue: appraisal });
test('LTV 30%（300萬/1000萬）→ ltvBonus=3、protection=12', () => {
  const r = ltvCase(3000000, 10000000);
  assert(
    r.protectionBreakdown.ltvBonus === 3,
    'bonus got:' + r.protectionBreakdown.ltvBonus
  );
  assert(r.protectionScore === 12, 'score got:' + r.protectionScore);
});
test('LTV 60% → ltvBonus=2、protection=11', () => {
  const r = ltvCase(3000000, 5000000);
  assert(
    r.protectionBreakdown.ltvBonus === 2,
    'bonus got:' + r.protectionBreakdown.ltvBonus
  );
  assert(r.protectionScore === 11, 'score got:' + r.protectionScore);
});
test('LTV 77% → ltvBonus=0（逼近否決線不加成）', () => {
  const r = ltvCase(3000000, 3900000);
  assert(
    r.protectionBreakdown.ltvBonus === 0,
    'bonus got:' + r.protectionBreakdown.ltvBonus
  );
  assert(r.protectionScore === 10, 'score got:' + r.protectionScore);
});
test('無鑑價（appraisal=0）→ ltvBonus=0', () => {
  const r = ltvCase(3000000, 0);
  assert(
    r.protectionBreakdown.ltvBonus === 0,
    'bonus got:' + r.protectionBreakdown.ltvBonus
  );
});
test('股金內借款（collateral=12）不適用 LTV 加成', () => {
  const r = CS({
    ...protectionBase,
    collateral: '12',
    proposedLoan: 100000,
    appraisalValue: 10000000,
  });
  assert(
    r.protectionBreakdown.ltvBonus === 0,
    'bonus got:' + r.protectionBreakdown.ltvBonus
  );
});
test('LTV 邊界：50%→+3、50.01%→+2、70%→+2、70.01%→+0', () => {
  assert(ltvCase(5000000, 10000000).protectionBreakdown.ltvBonus === 3);
  assert(ltvCase(5001000, 10000000).protectionBreakdown.ltvBonus === 2);
  assert(ltvCase(7000000, 10000000).protectionBreakdown.ltvBonus === 2);
  assert(ltvCase(7001000, 10000000).protectionBreakdown.ltvBonus === 0);
});
test('雙滿案件（擔保10+LTV3+5保人8+DSR5 raw=28）→ cap 在 20', () => {
  const r = CS({
    ...protectionBase,
    collateral: '10',
    proposedLoan: 3000000,
    appraisalValue: 10000000,
    guarantorCount: 5,
    guarantors: [1, 2, 3, 4, 5].map((n) => ({
      name: 'g' + n,
      income: 60000,
      debt: 0,
      type: 'member',
    })),
  });
  assert(
    r.protectionBreakdown.ltvBonus === 3,
    'bonus got:' + r.protectionBreakdown.ltvBonus
  );
  assert(
    r.protectionBreakdown.guarantor === 8,
    'guarantor got:' + r.protectionBreakdown.guarantor
  );
  assert(
    r.protectionBreakdown.guarantorDsr === 5,
    'dsr got:' + r.protectionBreakdown.guarantorDsr
  );
  const raw =
    r.protectionBreakdown.collateral +
    r.protectionBreakdown.ltvBonus +
    r.protectionBreakdown.guarantor +
    r.protectionBreakdown.guarantorDsr;
  assert(raw === 28, 'raw got:' + raw);
  assert(raw * 0.8 > 20, 'raw×0.8 should exceed cap');
  assert(r.protectionScore === 20, 'score got:' + r.protectionScore);
});

// ============================================================
// 115 年度生活支出與現金流收支評估測試
// ============================================================
console.log('\n── 115 年度生活支出與現金流收支 (8) ──');

test('115 年度各縣市最低生活費常數檢核', () => {
  assert(REGIONAL_MIN_LIVING_COST_115.taipei === 20744, 'taipei 20744');
  assert(REGIONAL_MIN_LIVING_COST_115.new_taipei === 17750, 'new_taipei 17750');
  assert(REGIONAL_MIN_LIVING_COST_115.taoyuan === 17186, 'taoyuan 17186');
  assert(REGIONAL_MIN_LIVING_COST_115.kaohsiung === 16970, 'kaohsiung 16970');
  assert(REGIONAL_MIN_LIVING_COST_115.taichung === 16431, 'taichung 16431');
  assert(REGIONAL_MIN_LIVING_COST_115.tainan === 15515, 'tainan 15515');
  assert(
    REGIONAL_MIN_LIVING_COST_115.taiwan_province === 15515,
    'taiwan_province 15515'
  );
  assert(
    REGIONAL_MIN_LIVING_COST_115.kinmen_lienchiang === 15173,
    'kinmen_lienchiang 15173'
  );
  assert(DEFAULT_LIVING_EXPENSE === 17750, 'default 17750');
  assert(JUDICIAL_LIVING_MULTIPLIER === 1.2, 'multiplier 1.2');
});

test('computeCashFlow：基本生活費與受扶養親屬支出計算', () => {
  // 1. 本人 17,750，無扶養
  const cf1 = CCF(
    {
      income: 50000,
      existingDebt: 5000,
      internalMonthly: 0,
      livingExpense: 17750,
      dependents: 0,
    },
    5750
  );
  assert(
    cf1.totalLivingExpenses === 17750,
    'cf1 living got:' + cf1.totalLivingExpenses
  );
  assert(
    cf1.totalMonthlyPayment === 10750,
    'cf1 payment got:' + cf1.totalMonthlyPayment
  );
  assert(
    cf1.netSurplusPostLoan === 50000 - 10750 - 17750,
    'cf1 surplus got:' + cf1.netSurplusPostLoan
  );
  assert(cf1.netSurplusPostLoan === 21500, 'surplus 21500');

  // 2. 本人 17,750，扶養 2 人（預設 50% = 8,875/人，合計 17,750），總生活費 35,500
  const cf2 = CCF(
    {
      income: 60000,
      existingDebt: 5000,
      internalMonthly: 0,
      livingExpense: 17750,
      dependents: 2,
    },
    10000
  );
  assert(
    cf2.totalLivingExpenses === 35500,
    'cf2 living got:' + cf2.totalLivingExpenses
  );
  assert(
    cf2.totalMonthlyPayment === 15000,
    'cf2 payment got:' + cf2.totalMonthlyPayment
  );
  assert(
    cf2.netSurplusPostLoan === 60000 - 15000 - 35500,
    'cf2 surplus got:' + cf2.netSurplusPostLoan
  );
  assert(cf2.netSurplusPostLoan === 9500, 'surplus 9500');
});

test('收支赤字否決 (第18條)：核貸後入不敷出觸發否決', () => {
  // 月收 30,000，生活費 17,750，既有負債 5,000，申請 100 萬/5年/3% (月付 19,166.67)
  // 總支出 = 19,166.67 + 5,000 + 17,750 = 41,916.67 > 30,000（赤字 11,917）
  const inp = {
    income: 30000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 5000,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 1000000,
    shares: 1000000,
    collateral: '5',
    livingExpense: 17750,
    dependents: 0,
  };
  const res = ARV(inp);
  assert(
    res.vetoes.some((v) => v.includes('收支赤字') || v.includes('入不敷出')),
    '應觸發收支赤字否決，got:' + res.vetoes.join(';')
  );
});

test('收支平衡充裕：不觸發赤字否決', () => {
  const inp = {
    income: 50000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 5000,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 300000,
    shares: 200000,
    collateral: '5',
    livingExpense: 17750,
    dependents: 0,
  };
  const res = ARV(inp);
  assert(
    !res.vetoes.some((v) => v.includes('收支赤字')),
    '不應觸發赤字否決，got:' + res.vetoes.join(';')
  );
});

test('可貸額度受生活支出限制 (雙重天花板)', () => {
  // 月收入 50,000，A 級 (maxDti 0.6，5年 3%)
  // 若無生活費限制：maxAvailablePmt = 50000 * 0.6 = 30000 → 可貸約 156.5 萬
  // 若生活費 35,000：maxAvailablePmt = 50000 - 35000 = 15000 → 可貸約 78.2 萬
  const inpNoLiving = {
    income: 50000,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    livingExpense: 0,
  };
  const maxLoanNoLiving = CML(inpNoLiving, 0.6);
  approx(maxLoanNoLiving, 1565217, 100);

  const inpWithLiving = {
    income: 50000,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    livingExpense: 35000,
  };
  const maxLoanWithLiving = CML(inpWithLiving, 0.6);
  approx(maxLoanWithLiving, 782608, 100);
  assert(maxLoanWithLiving < maxLoanNoLiving, '生活支出應降低額度');
});

test('扶養親屬增加 → 生活總支出上升 → 額度進一步受約束', () => {
  const base = {
    income: 60000,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    livingExpense: 17750,
    dependents: 0,
  };
  const loanDep0 = CML(base, 0.6);
  const withDep = { ...base, dependents: 3 }; // 3 扶養人
  const loanDep3 = CML(withDep, 0.6);
  assert(loanDep3 < loanDep0, '扶養親屬增加應減少可貸額度');
});

test('validateInputs：生活支出、扶養人數、扶養每人支出負值阻擋', () => {
  const err1 = VI({
    income: 50000,
    years: 5,
    proposedLoan: 100000,
    age: 30,
    livingExpense: -1000,
  });
  assert(
    err1.some((e) => e.includes('livingExpense') && e.includes('負值')),
    'livingExpense 負值 got:' + err1.join(';')
  );

  const err2 = VI({
    income: 50000,
    years: 5,
    proposedLoan: 100000,
    age: 30,
    dependents: -1,
  });
  assert(
    err2.some((e) => e.includes('dependents') && e.includes('負值')),
    'dependents 負值 got:' + err2.join(';')
  );

  const err3 = VI({
    income: 50000,
    years: 5,
    proposedLoan: 100000,
    age: 30,
    dependentExpense: -500,
  });
  assert(
    err3.some((e) => e.includes('dependentExpense') && e.includes('負值')),
    'dependentExpense 負值 got:' + err3.join(';')
  );
});

test('validateInputsByField：生活支出欄位錯誤訊息分組', () => {
  const fe = VIBF({
    income: 50000,
    years: 5,
    proposedLoan: 100000,
    age: 30,
    livingExpense: -500,
    dependents: -2,
    dependentExpense: -300,
  });
  assert(
    fe.livingExpense && fe.livingExpense.includes('不可為負值'),
    'fe.livingExpense got:' + fe.livingExpense
  );
  assert(
    fe.dependents && fe.dependents.includes('不可為負值'),
    'fe.dependents got:' + fe.dependents
  );
  assert(
    fe.dependentExpense && fe.dependentExpense.includes('不可為負值'),
    'fe.dependentExpense got:' + fe.dependentExpense
  );
});

console.log('\n── 所得認列折成 (Haircut) 與保證人資力過濾 (6) ──');

test('getEffectiveIncome：依據收入型態折算實質有效月收入', () => {
  assert(GEI({ income: 60000, incomeStability: 9 }) === 60000, '9: 100%');
  assert(GEI({ income: 60000, incomeStability: 6 }) === 51000, '6: 85%');
  assert(GEI({ income: 60000, incomeStability: 3 }) === 42000, '3: 70%');
  assert(GEI({ income: 60000, incomeStability: 1 }) === 30000, '1: 50%');
  assert(GEI({ income: 0, incomeStability: 9 }) === 0, '0 income');
});

test('所得折成連動 DBR 22 倍否決線：申報月薪 4 萬現金收入（實質 2 萬）申請 50 萬觸發否決', () => {
  const inp = {
    income: 40000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 500000,
    incomeStability: 1, // 現金收入 50% 折成 → 實質月入 20,000 元 → DBR 22 上限 440,000 元
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '0',
    shares: 50000,
  };
  const res = ARV(inp);
  assert(
    res.vetoes.some((v) => v.includes('22 倍上限') || v.includes('DBR')),
    '應觸發 DBR 22 否決，got: ' + res.vetoes.join('; ')
  );
});

test('所得折成連動 70% 負債比否決線：非固定收入受實質負債比約束', () => {
  // 申報 50000，佣金計酬 70% → 實質 35000
  // 月付 25000 → 25000 / 35000 = 71.4% > 70% → 否決
  // 若未折成 25000 / 50000 = 50% 本應通過
  const inp = {
    income: 50000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 10000,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 800000, // 月付約 15333 + 10000 = 25333
    incomeStability: 3, // 70% → 35000
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    appraisalValue: 2000000,
    mortgageAmount: 1000000,
    shares: 100000,
  };
  const res = ARV(inp);
  assert(
    res.vetoes.some((v) => v.includes('70.0%') || v.includes('總負債比')),
    '應觸發 70% 總負債比否決，got: ' + res.vetoes.join('; ')
  );
});

test('所得折成連動可貸額度天花板：折數越低額度越保守', () => {
  const base = {
    income: 60000,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    livingExpense: 17750,
    dependents: 0,
    incomeStability: 9, // 100%
  };
  const limit100 = CML(base, 0.5);
  const limit85 = CML({ ...base, incomeStability: 6 }, 0.5); // 85%
  const limit70 = CML({ ...base, incomeStability: 3 }, 0.5); // 70%
  const limit50 = CML({ ...base, incomeStability: 1 }, 0.5); // 50%

  assert(
    limit100 > limit85 && limit85 > limit70 && limit70 > limit50,
    `額度應隨折成遞減: 100%=${limit100}, 85%=${limit85}, 70%=${limit70}, 50%=${limit50}`
  );
});

test('保證人資力過濾：高負債 (DSR >= 65%) 排除加分，合格者正常加分', () => {
  const inp = {
    income: 60000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    incomeStability: 9,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 2,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [
      {
        name: '優良社員保人',
        income: 60000,
        debt: 10000, // DSR = 16.7% < 30% → DSR +5
        type: 'member', // weight 1.0
        unknown: false,
      },
      {
        name: '高負債保人',
        income: 40000,
        debt: 30000, // DSR = 75% >= 65% → 排除 (weight 0)
        type: 'member',
        unknown: false,
      },
    ],
  };
  const res = CS(inp);
  // 有效人數 = 1.0 (高負債排除) → guarantorScore = 3
  // validDsrs: [10000/60000=0.167] → guarantorDsrScore = 5
  // rawProtectionScore = 12 + 3 + 5 = 20 → ×0.8 = 16
  assert(res.protectionScore === 16, 'got:' + res.protectionScore);
  assert(
    res.protectionBreakdown.guarantor === 3,
    'guarantor score should be 3'
  );
  assert(
    res.protectionBreakdown.guarantorDsr === 5,
    'guarantor DSR score should be 5'
  );
});

test('保證人債務不詳：權重折半認列且 DSR 給 0 分', () => {
  const inp = {
    income: 60000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    incomeStability: 9,
    tenure: 4,
    interaction: 10,
    jcic: '10',
    membership: 5,
    collateral: '10',
    guarantorCount: 2,
    purpose: '10',
    career: 6,
    participation: 4,
    internalBalance: 0,
    shares: 100000,
    guarantors: [
      {
        name: '不詳社員保人1',
        income: 50000,
        debt: 0,
        type: 'member',
        unknown: true,
      },
      {
        name: '不詳社員保人2',
        income: 50000,
        debt: 0,
        type: 'member',
        unknown: true,
      },
    ],
  };
  const res = CS(inp);
  // 兩位社員不詳: 1.0*0.5 + 1.0*0.5 = 1.0 → round 1 → guarantorScore = 3
  // DSR = 0
  // raw = 12 + 3 + 0 = 15 → ×0.8 = 12
  assert(res.protectionScore === 12, 'got:' + res.protectionScore);
  assert(
    res.protectionBreakdown.guarantor === 3,
    'guarantor score should be 3'
  );
  assert(
    res.protectionBreakdown.guarantorDsr === 0,
    'guarantor DSR score should be 0'
  );
});

console.log('\n── 授信優化與防呆測試 (4) ──');
test('社外無擔保負債總餘額獨立計算：月薪 3 萬申貸 30 萬＋社外餘額 40 萬（月付 8000）合計 70 萬觸發 DBR 22 否決', () => {
  const inp = {
    income: 30000,
    age: 35,
    years: 5,
    ratePercent: 3,
    existingDebt: 8000,
    externalUnsecuredDebt: 400000,
    internalMonthly: 0,
    internalBalance: 0,
    proposedLoan: 300000,
    collateral: '0',
    shares: 50000,
  };
  const res = ARV(inp);
  assert(
    res.vetoes.some((v) => v.includes('22 倍') || v.includes('無擔保負債總額')),
    '應觸發 DBR 22 否決，got: ' + res.vetoes.join('; ')
  );
});

test('送審核決層級文字簡明無重複字樣', () => {
  const committeeGov = DGR(
    {
      borrowerRole: 'member',
      proposedLoan: 500000,
      shares: 100000,
      collateral: '5',
    },
    { isVetoed: false }
  );
  assert(
    committeeGov.authority === '出席委員全數通過',
    'got:' + committeeGov.authority
  );

  const boardSpecialGov = DGR(
    {
      borrowerRole: 'board',
      proposedLoan: 500000,
      shares: 100000,
      collateral: '5',
    },
    { isVetoed: false }
  );
  assert(
    boardSpecialGov.authority === '須 2/3 出席理事同意',
    'got:' + boardSpecialGov.authority
  );

  const staffGov = DGR(
    {
      borrowerRole: 'member',
      proposedLoan: 100000,
      shares: 200000,
      collateral: '12',
    },
    { isVetoed: false }
  );
  assert(
    staffGov.authority === '專職核放・10 日內追認',
    'got:' + staffGov.authority
  );
});

test('pmt() 基礎防呆：利率 0% 能正常計算首期均攤', () => {
  const pmtZeroRate = PMT(300000, 0, 5);
  assert(pmtZeroRate === 5000, 'got:' + pmtZeroRate);
});

test('驗證器阻擋社外無擔保負債總餘額為負值', () => {
  const errs = VI({
    income: 50000,
    age: 30,
    years: 5,
    proposedLoan: 100000,
    externalUnsecuredDebt: -1000,
  });
  assert(
    errs.some(
      (e) => e.includes('externalUnsecuredDebt') || e.includes('不可為負值')
    ),
    'got:' + errs.join('; ')
  );
});

// ============================================================
// 100-人分布迴歸測試：coherent 輸入快照
// 偵測日後微調公式時分布劇烈漂移（A 級從 30% 掉到 5% 等）
// 範圍為「常態合理區間」：小幅漂移通過，劇烈漂移才失敗
// ============================================================
console.log('\n── 100-人分布迴歸測試 (1) ──');

test('coherent 100-case 分布快照（A/B/C/D/E/否決在合理區間）', () => {
  // 簡單 LCG PRNG（保證可重現）
  let _s = 0x12345;
  const rng = () => {
    _s = (_s * 1103515245 + 12345) & 0x7fffffff;
    return _s / 0x7fffffff;
  };
  const ri = (a, b) => Math.floor(a + rng() * (b - a + 1));
  const rc = (arr) => arr[Math.floor(rng() * arr.length)];

  // 與 simulate_100_coherent.js 對齊的 8 種 persona
  const PERSONAS = {
    elite() {
      return {
        age: ri(25, 45),
        income: ri(60000, 120000),
        years: rc([3, 5, 7, 10]),
        ratePercent: rc([2.0, 2.5, 3.0]),
        proposedLoan: ri(100000, 1000000),
        existingDebt: 0,
        internalMonthly: 0,
        internalBalance: 0,
        shares: ri(50000, 200000),
        incomeStability: 9,
        tenure: rc([4, 6]),
        interaction: 10,
        jcic: '10',
        membership: rc([3, 5]),
        collateral: rc(['12', '10']),
        purpose: '10',
        career: 6,
        participation: rc([3, 4]),
      };
    },
    normal() {
      return {
        age: ri(28, 55),
        income: ri(35000, 70000),
        years: rc([3, 5, 7]),
        ratePercent: rc([2.5, 3.0, 3.5]),
        proposedLoan: ri(100000, 800000),
        existingDebt: ri(0, 5000),
        internalMonthly: ri(0, 3000),
        internalBalance: ri(0, 50000),
        shares: ri(30000, 100000),
        incomeStability: rc([6, 9]),
        tenure: rc([2, 4, 6]),
        interaction: rc([7, 10]),
        jcic: rc(['10', '5']),
        membership: rc([3, 5]),
        collateral: rc(['5', '12', '10']),
        purpose: '10',
        career: rc([3, 4, 6]),
        participation: rc([2, 3, 4]),
      };
    },
    selfEmployed() {
      return {
        age: ri(30, 60),
        income: ri(40000, 100000),
        years: rc([3, 5, 7]),
        ratePercent: rc([3.0, 3.5, 4.0]),
        proposedLoan: ri(200000, 1500000),
        existingDebt: ri(0, 10000),
        internalMonthly: ri(0, 5000),
        internalBalance: ri(0, 100000),
        shares: ri(20000, 80000),
        incomeStability: rc([1, 3]),
        tenure: rc([1, 2, 4]),
        interaction: rc([3, 7]),
        jcic: rc(['10', '5', '2']),
        membership: rc([1, 3, 5]),
        collateral: rc(['5', '10', '0']),
        purpose: rc(['7', '10']),
        career: rc([2, 3]),
        participation: rc([1, 2, 3]),
      };
    },
    borderline() {
      return {
        age: ri(35, 60),
        income: ri(30000, 50000),
        years: rc([3, 5, 7]),
        ratePercent: rc([3.0, 4.0, 5.0]),
        proposedLoan: ri(300000, 2000000),
        existingDebt: ri(10000, 25000),
        internalMonthly: ri(3000, 8000),
        internalBalance: ri(0, 200000),
        shares: ri(10000, 50000),
        incomeStability: rc([3, 6]),
        tenure: rc([2, 4]),
        interaction: rc([3, 7]),
        jcic: rc(['5', '2']),
        membership: rc([1, 3]),
        collateral: rc(['0', '5']),
        purpose: rc(['7', '10']),
        career: rc([2, 3, 4]),
        participation: rc([1, 2]),
      };
    },
    senior() {
      const age = ri(55, 72);
      return {
        age,
        income: ri(30000, 70000),
        years: ri(1, Math.max(1, 75 - age)),
        ratePercent: rc([2.5, 3.0]),
        proposedLoan: ri(100000, 500000),
        existingDebt: ri(0, 5000),
        internalMonthly: ri(0, 3000),
        internalBalance: 0,
        shares: ri(50000, 200000),
        incomeStability: rc([6, 9]),
        tenure: rc([4, 6]),
        interaction: 10,
        jcic: '10',
        membership: 5,
        collateral: '12',
        purpose: '10',
        career: rc([4, 6]),
        participation: rc([3, 4]),
      };
    },
    jcicWarn() {
      return {
        age: ri(30, 50),
        income: ri(35000, 60000),
        years: rc([3, 5]),
        ratePercent: rc([3.0, 4.0]),
        proposedLoan: ri(200000, 800000),
        existingDebt: ri(5000, 15000),
        internalMonthly: 0,
        internalBalance: 0,
        shares: ri(20000, 80000),
        incomeStability: rc([3, 6]),
        tenure: rc([2, 4]),
        interaction: rc([3, 7]),
        jcic: rc(['2', '5']),
        membership: rc([1, 3]),
        collateral: rc(['5', '10']),
        purpose: '10',
        career: rc([3, 4]),
        participation: rc([2, 3]),
      };
    },
    hardVeto() {
      const isJcic = rng() < 0.5;
      return {
        age: ri(25, 60),
        income: ri(30000, 80000),
        years: rc([3, 5]),
        ratePercent: rc([3.0, 4.0]),
        proposedLoan: ri(200000, 800000),
        existingDebt: 0,
        internalMonthly: 0,
        internalBalance: 0,
        shares: ri(20000, 100000),
        incomeStability: 6,
        tenure: 4,
        interaction: 7,
        jcic: isJcic ? 'veto' : '10',
        purpose: isJcic ? '10' : 'veto',
        membership: 3,
        collateral: '5',
        career: 3,
        participation: 2,
      };
    },
    consolidation() {
      return {
        age: ri(35, 60),
        income: ri(40000, 80000),
        years: rc([5, 7]),
        ratePercent: rc([2.5, 3.0]),
        proposedLoan: ri(500000, 2000000),
        existingDebt: ri(0, 10000),
        internalMonthly: ri(5000, 15000),
        internalBalance: ri(100000, 500000),
        shares: ri(50000, 200000),
        incomeStability: rc([6, 9]),
        tenure: rc([2, 4, 6]),
        interaction: 10,
        jcic: '10',
        membership: rc([3, 5]),
        collateral: rc(['5', '10', '12']),
        purpose: '10',
        career: rc([4, 6]),
        participation: rc([2, 3]),
      };
    },
  };

  // 對齊 distribute：collateral=10 需補 appraisal 欄位
  const coherent = (p) => {
    if (
      p.collateral === '10' &&
      (!p.appraisalValue || p.appraisalValue === 0)
    ) {
      p.appraisalValue = p.proposedLoan * 1.3;
      p.mortgageAmount = Math.max(p.proposedLoan * 1.2, 100_000);
      p.collateralZone = 'residential_commercial_educational';
      p.houseAge = ri(0, 25);
      p.appraisalAge = ri(0, 8);
    }
    // collateral=12 但 loan > shares → 降級
    if (p.collateral === '12' && p.proposedLoan > p.shares) {
      if (p.proposedLoan <= p.shares * 2) p.collateral = '5';
      else {
        p.collateral = '10';
        p.appraisalValue = p.proposedLoan * 1.3;
        p.mortgageAmount = Math.max(p.proposedLoan * 1.2, 100_000);
        p.collateralZone = 'residential_commercial_educational';
        p.houseAge = ri(0, 20);
        p.appraisalAge = ri(0, 8);
      }
    }
    return p;
  };

  const MIX = [
    ['elite', 30],
    ['normal', 25],
    ['selfEmployed', 15],
    ['borderline', 10],
    ['senior', 8],
    ['jcicWarn', 5],
    ['hardVeto', 4],
    ['consolidation', 3],
  ];

  const results = [];
  for (let i = 0; i < 100; i++) {
    const total = MIX.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    let name = MIX[0][0];
    for (const [n, w] of MIX) {
      r -= w;
      if (r <= 0) {
        name = n;
        break;
      }
    }
    const c = coherent(PERSONAS[name]());
    const s = CS(c);
    const v = ARV(c);
    const g = DG(s.total, v.vetoes.length > 0);
    results.push({ grade: g.grade, veto: v.vetoes.length });
  }

  const cnt = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let vetoCount = 0;
  results.forEach((r) => {
    cnt[r.grade] = (cnt[r.grade] || 0) + 1;
    if (r.veto > 0) vetoCount++;
  });
  const passed = results.filter((r) => r.grade !== 'E' && r.veto === 0).length;

  // 合理區間（小幅漂移通過，劇烈漂移才失敗）
  // 對齊 simulate_100_coherent.js 實測分布（允許 ±10 隨機漂移，考量非固定所得折成後之風控收緊）
  const RANGE = {
    A: [0, 10], // 0–10%
    B: [20, 40], // 20–40%
    C: [15, 30], // 15–30%
    D: [5, 20], // 5–20%
    E: [20, 40], // 20–40%
    veto: [10, 35], // 10–35% (含非固定收入折成風控)
    passed: [55, 80], // 55–80%
  };
  const inRange = (n, [lo, hi]) => n >= lo && n <= hi;
  const summary = `A=${cnt.A} B=${cnt.B} C=${cnt.C} D=${cnt.D} E=${cnt.E} 否決=${vetoCount} 通過=${passed}`;
  assert(inRange(cnt.A, RANGE.A), 'A 級超出範圍 ' + RANGE.A + '%: ' + summary);
  assert(inRange(cnt.B, RANGE.B), 'B 級超出範圍 ' + RANGE.B + '%: ' + summary);
  assert(inRange(cnt.C, RANGE.C), 'C 級超出範圍 ' + RANGE.C + '%: ' + summary);
  assert(inRange(cnt.D, RANGE.D), 'D 級超出範圍 ' + RANGE.D + '%: ' + summary);
  assert(inRange(cnt.E, RANGE.E), 'E 級超出範圍 ' + RANGE.E + '%: ' + summary);
  assert(inRange(vetoCount, RANGE.veto), '否決超出範圍: ' + summary);
  assert(inRange(passed, RANGE.passed), '通過率超出範圍: ' + summary);
});

// ============================================================
console.log('\n' + '='.repeat(44));
console.log(
  '  PASS: ' +
    passed +
    '  |  FAIL: ' +
    failed +
    '  |  TOTAL: ' +
    (passed + failed)
);
console.log('='.repeat(44) + '\n');
process.exit(failed > 0 ? 1 : 0);
