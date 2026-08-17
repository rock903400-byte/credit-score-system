// Simulate 10,000 random loan cases using core.js logic
// This script mirrors simulate_1000.js but runs 10x more iterations.
const fs = require('fs');
const vm = require('vm');

// Load core.js (pure business logic)
const coreJs = fs.readFileSync(__dirname + '/core.js', 'utf8');

// Sandbox similar to test.js
const sandbox = {
  console,
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

vm.runInNewContext(coreJs, sandbox);
const { computeScore, applyRegulatoryVetoes } = sandbox;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const errors = [];
const results = [];

// Run 10,000 iterations
for (let i = 0; i < 10000; i++) {
  const income = randInt(20000, 200000);
  const years = randInt(1, 30);
  const ratePercent = randInt(0, 15);
  const age = randInt(18, 80);
  const existingDebt = randInt(0, Math.floor(income * 0.7));
  const internalMonthly = randInt(0, Math.floor(income * 0.3));
  const proposedLoan = randInt(50000, Math.min(10_000_000, income * years * 5));
  const incomeStability = randInt(0, 10);
  const tenure = randInt(0, 10);
  const interaction = randInt(-20, 20);
  const jcicValues = [
    '10',
    '9',
    '8',
    '7',
    '6',
    '5',
    '4',
    '3',
    '2',
    '1',
    'veto',
  ];
  const jcic = randChoice(jcicValues);
  const membership = randInt(0, 5);
  const collateralOptions = ['0', '5', '10', '12'];
  const collateral = randChoice(collateralOptions);
  const guarantorCount = randInt(0, 5);
  const guarantors = [];
  for (let g = 0; g < guarantorCount; g++) {
    const gName = `g${g}`;
    const gIncome = randInt(20000, 100000);
    const gDebt = randInt(0, Math.floor(gIncome * 0.5));
    const gType = randChoice(['member', 'non_member']);
    const gUnknown = Math.random() < 0.1;
    guarantors.push({
      name: gName,
      income: gIncome,
      debt: gUnknown ? 0 : gDebt,
      type: gType,
      unknown: gUnknown,
    });
  }
  const purpose = randChoice([
    '10',
    '9',
    '8',
    '7',
    '6',
    '5',
    '4',
    '3',
    '2',
    '1',
    'veto',
  ]);
  const career = randInt(0, 10);
  const participation = randInt(0, 10);
  const internalBalance = randInt(0, 200000);
  const shares = randInt(0, 500000);
  const appraisalValue = randInt(0, 20000000);
  const mortgageAmount =
    collateral === '10' ? Math.max(proposedLoan * 1.2, 100000) : 0;
  const collateralZone = randChoice([
    'residential_commercial_educational',
    'other',
  ]);
  const houseAge = randInt(0, 30);
  const appraisalAge = randInt(0, 15);
  const collateralKind = randChoice(['building', 'land']);
  const collateralOwner = randChoice(['self', 'third_party']);
  const borrowerRole = randChoice(['member', 'board', 'staff']);

  const input = {
    borrowerRole,
    income,
    years,
    ratePercent,
    age,
    existingDebt,
    internalMonthly,
    proposedLoan,
    incomeStability,
    tenure,
    interaction,
    jcic,
    membership,
    collateral,
    collateralKind,
    collateralOwner,
    guarantorCount,
    guarantors,
    purpose,
    career,
    participation,
    internalBalance,
    shares,
    appraisalValue,
    mortgageAmount,
    collateralZone,
    houseAge,
    appraisalAge,
  };

  try {
    const score = computeScore(input);
    const veto = applyRegulatoryVetoes(input);
    results.push({ score, veto });
  } catch (e) {
    errors.push({ index: i, error: e.message, input });
  }
}

console.log(`Simulation completed: ${results.length} cases processed.`);
if (errors.length) {
  console.error(`Encountered ${errors.length} errors. Sample:`);
  console.error(JSON.stringify(errors.slice(0, 5), null, 2));
}
process.exit(errors.length ? 1 : 0);
