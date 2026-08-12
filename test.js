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
test('保證人全部不詳：guarantorDsrScore=0（不計入滿分 5）', () => {
  const inp = {
    income: 60000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    incomeStability: 6,
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
  // 加權: 1.0 + 0.7 + 1.0 = 2.7 → round 3 → +6 (新表)
  // guarantorDsrScore: 0 (全部不詳,validDsrs 空)
  // rawProtectionScore = 12 + 6 + 0 = 18 → ×0.8 = 14.4 → round → 14
  assert(CS(inp).protectionScore === 14, 'got:' + CS(inp).protectionScore);
});
test('保證人混合（2 不詳 + 1 揭露）：只採計揭露者的 DSR', () => {
  // 三位非社員保證人，加權 0.7×3=2.1→round 2 → +6 保障基礎
  // 揭露者 debt=40000, income=40000 → DSR=1.0 → +1（最壞情況）
  // 不詳 2 位被排除
  const inp = {
    income: 60000,
    age: 40,
    years: 5,
    ratePercent: 3,
    existingDebt: 0,
    internalMonthly: 0,
    proposedLoan: 300000,
    incomeStability: 6,
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
        income: 40000,
        debt: 40000,
        type: 'non_member',
        unknown: false,
      },
      { name: 'C', income: 60000, debt: 0, type: 'member', unknown: true },
    ],
  };
  // 加權: 1.0 + 0.7 + 1.0 = 2.7 → round 3 → +6 (新表)
  // DSR: 只看 B, max = 40000/40000 = 1.0 → +1
  // rawProtectionScore = 12 + 6 + 1 = 19 → ×0.8 = 15.2 → round → 15
  assert(CS(inp).protectionScore === 15, 'got:' + CS(inp).protectionScore);
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
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(ARV(i).vetoes.length === 0, 'got:' + ARV(i).vetoes.join(';'));
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
test('源碼：15 條否決規則（含擔保品12、年限30年、擔保放款新規則、土地上限）', () => {
  const src = fs.readFileSync(__dirname + '/core.js', 'utf8');
  const vf = src.substring(
    src.indexOf('function applyRegulatoryVetoes'),
    src.indexOf('function determineGrade')
  );
  assert(
    (vf.match(/vetoes\.push/g) || []).length === 15,
    'got:' + (vf.match(/vetoes\.push/g) || []).length
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
test('年限 25 年 + 不動產 → 不觸發年限否決', () => {
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
    collateralZone: 'residential_commercial_educational',
    houseAge: 10,
    appraisalAge: 3,
  };
  assert(ARV(i).vetoes.length === 0, 'got:' + ARV(i).vetoes.join(';'));
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
      p.appraisalValue = Math.max(p.proposedLoan * 1.3, 5_000_000);
      p.collateralZone = 'residential_commercial_educational';
      p.houseAge = ri(0, 25);
      p.appraisalAge = ri(0, 8);
    }
    // collateral=12 但 loan > shares → 降級
    if (p.collateral === '12' && p.proposedLoan > p.shares) {
      if (p.proposedLoan <= p.shares * 2) p.collateral = '5';
      else {
        p.collateral = '10';
        p.appraisalValue = Math.max(p.proposedLoan * 1.3, 5_000_000);
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
  // 對齊 simulate_100_coherent.js 實測分布（允許 ±10 隨機漂移）
  const RANGE = {
    A: [0, 10], // 0–10%
    B: [20, 40], // 20–40%
    C: [15, 30], // 15–30%
    D: [5, 20], // 5–20%
    E: [20, 40], // 20–40%
    veto: [10, 25], // 10–25%
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
