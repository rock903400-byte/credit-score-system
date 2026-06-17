// Simulation of 1000 random user inputs for the credit scoring system
// This script loads core.js in a VM context and runs core logic functions.
const fs = require('fs');
const vm = require('vm');

// Load core.js source
const coreSrc = fs.readFileSync(__dirname + '/core.js', 'utf8');

// Minimal sandbox needed for core.js
const ctx = {
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
};
vm.runInNewContext(coreSrc, ctx);

const {
  computeScore,
  applyRegulatoryVetoes,
  determineGrade,
  computeMaxLoan,
  applyLegalCeiling,
  computeSuggestedAdditionalLoan,
} = ctx;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function randomInput() {
  const income = randInt(20000, 200000);
  const age = randInt(18, 80);
  const years = randInt(1, 35);
  const ratePercent = randInt(1, 20);
  const existingDebt = randInt(0, 50000);
  const internalMonthly = randInt(0, 30000);
  const internalBalance = randInt(0, 200000);
  const proposedLoan = randInt(100000, 5000000);
  const incomeStability = randInt(0, 10);
  const tenure = randInt(0, 10);
  const interaction = randInt(-20, 10);
  const jcic = randChoice(['0', '1', '2', '3', '4', '5', 'veto']);
  const membership = randInt(0, 10);
  const collateral = randChoice(['0', '5', '10', '12']);
  const guarantorCount = randInt(0, 5);
  const purpose = randChoice(['0', '1', '2', '3', 'veto']);
  const career = randInt(0, 10);
  const participation = randInt(0, 10);
  const shares = randInt(50000, 2000000);

  const guarantors = [];
  for (let i = 0; i < guarantorCount; i++) {
    guarantors.push({
      name: 'G' + i,
      income: randInt(10000, 120000),
      debt: randInt(0, 50000),
      type: randChoice(['member', 'non_member']),
    });
  }

  const input = {
    income,
    age,
    years,
    ratePercent,
    existingDebt,
    internalMonthly,
    internalBalance,
    proposedLoan,
    incomeStability,
    tenure,
    interaction,
    jcic,
    membership,
    collateral,
    guarantorCount,
    guarantors,
    purpose,
    career,
    participation,
    shares,
  };

  if (collateral === '10') {
    input.appraisalValue = randInt(500000, 20000000);
    input.collateralZone = randChoice([
      'residential_commercial_educational',
      'other',
    ]);
    input.houseAge = randInt(0, 40);
    input.appraisalAge = randInt(0, 12);
  }

  return input;
}

const stats = {
  totalScore: 0,
  totalCount: 0,
  gradeCounts: { A: 0, B: 0, C: 0, D: 0, E: 0 },
  vetoCount: 0,
  exceptions: 0,
};

for (let i = 0; i < 1000; i++) {
  const inp = randomInput();
  try {
    const scoreObj = computeScore(inp);
    const { vetoes } = applyRegulatoryVetoes(inp);
    const isVetoed = vetoes.length > 0;
    const gradeObj = determineGrade(scoreObj.total, isVetoed);

    stats.totalScore += scoreObj.total;
    stats.totalCount++;
    if (isVetoed) stats.vetoCount++;
    const g = gradeObj.grade;
    stats.gradeCounts[g] = (stats.gradeCounts[g] || 0) + 1;
  } catch (e) {
    console.error('Simulation exception', e);
    stats.exceptions++;
  }
}

console.log('--- Simulation Summary (1000 users) ---');
console.log(
  'Average total score:',
  (stats.totalScore / stats.totalCount).toFixed(2)
);
console.log('Grade distribution:', stats.gradeCounts);
console.log('Number of vetoed cases:', stats.vetoCount);
console.log('Exceptions encountered:', stats.exceptions);
