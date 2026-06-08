// ============================================================
// 自動化測試 — Node.js vm 沙箱執行 index.html 核心邏輯
// ============================================================
const fs = require('fs');
const vm = require('vm');

// 讀取 JS
let html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const s = html.indexOf('<script>') + '<script>'.length;
const e = html.lastIndexOf('</script>');
let js = html.substring(s, e);

// 沙箱（完整 DOM + BOM mock）
const ctx = {
  console: console,
  document: {
    getElementById(id) { return null; },
    querySelectorAll(sel) { return []; },
    querySelector(sel) { return null; },
    addEventListener(evt, fn) {},
    createElement(tag) {
      return { className:'', innerHTML:'', setAttribute(){}, appendChild(){} };
    },
    createTextNode(t) { return t; },
    body: {},
    head: {},
  },
  window: {
    print() {},
    scrollTo() {},
    scrollBy() {},
  },
  localStorage: {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  },
  sessionStorage: {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = v; },
  },
  location: { reload() {}, href:'', assign() {}, replace() {} },
  alert(msg) {},
  confirm(msg) { return true; },
  Math: Math, Date: Date, String: String, Number: Number,
  Array: Array, Object: Object, JSON: JSON, RegExp: RegExp,
  parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN,
  setTimeout: setTimeout, setInterval: setInterval, clearTimeout: clearTimeout, clearInterval: clearInterval,
  Event: class {}, CustomEvent: class {}, HTMLElement: class {},
  Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
  navigator: { userAgent: 'test', language: 'zh-TW' },
  screen: { width: 1920, height: 1080 },
  self: undefined, top: undefined, parent: undefined,
  performance: { now() { return 0; } },
  requestAnimationFrame(fn) { setTimeout(fn, 0); },
  cancelAnimationFrame() {},
  fetch() { return Promise.resolve({ json:()=>Promise.resolve({}) }); },
};

// 讓 window 指回 self
ctx.self = ctx;
ctx.window.document = ctx.document;
ctx.window.localStorage = ctx.localStorage;
ctx.window.location = ctx.location;

// 執行 JS
const wrapped = `(function(global) { ${js} })`;
try {
  vm.runInNewContext(wrapped, ctx)(ctx);
} catch (err) {
  // 忽略 DOMContentLoaded 內的型別錯誤（mock DOM 無法完全模擬）
  if (err.message && err.message.includes('addEventListener')) {
    // 重試：只抽取函數定義
  } else {
    console.error('Bootstrap error:', err.message, '\n');
  }
}

// 從 ctx 取出核心函數
const { computeScore, applyRegulatoryVetoes, determineGrade, computeMaxLoan, applyLegalCeiling, validateInputs, validateInputsByField, pmt, formatAmount, escapeHtml } = ctx;

// 如果上面的 vm 執行失敗（DOMContentLoaded 炸了），直接用 Function 抽取純函數
function extractPureFunctions(jsCode) {
  // 取得所有 toplevel function/const 定義
  const fn = {};
  const all = new Function('global', `
    const document={getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:()=>{},createElement:()=>({appendChild(){},setAttribute(){}}),body:{},head:{}};
    const localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
    const window=document;
    const alert=()=>{}, confirm=()=>true;
    const location={reload(){}};
    ${jsCode}
    return { computeScore, applyRegulatoryVetoes, determineGrade, computeMaxLoan, applyLegalCeiling, validateInputs, validateInputsByField, pmt, formatAmount, escapeHtml, saveFormDraft, loadFormDraft, clearFormDraft };
  `);
  return all({});
}

// 檢查是否 ctx 已有函數，否則用 Function 抽取
if (typeof ctx.computeScore !== 'function') {
  const fns = extractPureFunctions(js);
  Object.assign(ctx, fns);
}

const { computeScore: CS, applyRegulatoryVetoes: ARV, determineGrade: DG, computeMaxLoan: CML, applyLegalCeiling: ALC, validateInputs: VI, validateInputsByField: VIBF, pmt: PMT, formatAmount: FA, escapeHtml: EH } = ctx;

// ============================================================
// 測試執行器
// ============================================================
let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; process.stdout.write('  \x1b[32mPASS\x1b[0m: ' + name + '\n'); }
  catch(e) { failed++; process.stdout.write('  \x1b[31mFAIL\x1b[0m: ' + name + '\n         ' + e.message.substring(0,160) + '\n'); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function approx(a, b, tol, m) {
  tol = tol || 0.001;
  if (Math.abs(a - b) > tol) throw new Error((m || '') + ': expected ~' + b + ', got ' + a);
}

// ============================================================
// 測試開始
// ============================================================

console.log('\n── PMT 公式 (3) ──');
test('100萬/5年/3% ≈ 17969', () => approx(PMT(1_000_000,3,5), 17968.7, 1));
test('r=0 分期 120萬/10年 = 1萬/月', () => approx(PMT(120_000,0,10), 1000, 0.01));
test('100萬/7年/2.5% 在合理範圍', () => { const p = PMT(1_000_000,2.5,7); assert(p>10000 && p<14000, 'got:'+p.toFixed(0)); });

console.log('\n── formatAmount / escapeHtml (4) ──');
test('45000 → 4.5 萬元', () => assert(FA(45000)==='4.5 萬元'));
test('10000000 → 1000 萬元', () => assert(FA(10_000_000)==='1000 萬元'));
test('0 → 空字串', () => assert(FA(0)===''));
test('<script> → escaped', () => assert(EH('<script>')==='&lt;script&gt;'));

console.log('\n── validateInputs (5) ──');
test('空輸入 ≥4 錯誤', () => {
  const i = { income:0,years:0,proposedLoan:0,age:0,existingDebt:0,internalMonthly:0,internalBalance:0,ratePercent:0,shares:0,guarantors:[] };
  assert(VI(i).length >= 4, 'got:'+VI(i).length);
});
test('正常輸入 0 錯誤', () => {
  const i = { income:50000,years:5,proposedLoan:300000,age:40,existingDebt:5000,internalMonthly:2000,internalBalance:0,ratePercent:3,shares:50000,guarantors:[] };
  assert(VI(i).length === 0, 'got:'+VI(i).length);
});
test('負值觸發阻擋', () => {
  const i = { income:-500,years:5,proposedLoan:300000,age:40,existingDebt:0,internalMonthly:0,internalBalance:0,ratePercent:3,shares:50000,guarantors:[] };
  assert(VI(i).some(e=>e.includes('負值')));
});
test('未滿18歲警告', () => {
  const i = { income:50000,years:5,proposedLoan:300000,age:16,existingDebt:0,internalMonthly:0,internalBalance:0,ratePercent:3,shares:50000,guarantors:[] };
  assert(VI(i).some(e=>e.includes('18')));
});
test('利率>20%警告', () => {
  const i = { income:50000,years:5,proposedLoan:300000,age:40,existingDebt:0,internalMonthly:0,internalBalance:0,ratePercent:25,shares:50000,guarantors:[] };
  assert(VI(i).some(e=>e.includes('20')));
});

console.log('\n── validateInputsByField (2) ──');
test('多欄位錯誤分組', () => {
  const i = { income:0,years:0,proposedLoan:0,age:0,existingDebt:-1,internalMonthly:-1,internalBalance:0,ratePercent:25,shares:-1,guarantors:[] };
  const fe = VIBF(i);
  ['income','years','loan','age','existing_debt','rate','shares'].forEach(k=>assert(fe[k],'缺'+k+'錯誤'));
});
test('保證人錯誤', () => {
  const i = { income:50000,years:5,proposedLoan:300000,age:40,existingDebt:0,internalMonthly:0,internalBalance:0,ratePercent:3,shares:50000,guarantors:[{name:'',income:0,debt:-100}],guarantorCount:1 };
  const fe = VIBF(i);
  assert(fe.g_name_0 && fe.g_income_0 && fe.g_debt_0, '缺保證人欄位錯誤');
});

console.log('\n── computeScore (3) ──');
test('優質借款人 ≥ 90 分', () => {
  const inp = {
    income:80000,age:35,years:5,ratePercent:3,
    existingDebt:0,internalMonthly:0,proposedLoan:400000,
    stability:15,interaction:10,jcic:'10',membership:5,
    collateral:'12',guarantorCount:1,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:200000,
    guarantors:[{name:'a',income:60000,debt:0}]
  };
  assert(CS(inp).total >= 90, 'got:'+CS(inp).total);
});
test('不良借款人 < 60', () => {
  const inp = {
    income:30000,age:60,years:10,ratePercent:5,
    existingDebt:15000,internalMonthly:5000,proposedLoan:200000,
    stability:5,interaction:-20,jcic:'veto',membership:1,
    collateral:'0',guarantorCount:0,purpose:'7',career:2,participation:1,
    internalBalance:0,shares:10000,guarantors:[]
  };
  assert(CS(inp).total < 60, 'got:'+CS(inp).total);
});
test('年齡罰分 65-70 到期 = -5', () => {
  const inp = {
    income:50000,age:66,years:3,ratePercent:3,
    existingDebt:0,internalMonthly:0,proposedLoan:200000,
    stability:10,interaction:10,jcic:'10',membership:5,
    collateral:'10',guarantorCount:0,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:100000,guarantors:[]
  };
  assert(CS(inp).ageScore === -5, 'got:'+CS(inp).ageScore);
});
test('年齡罰分 65 到期 = 0', () => {
  const inp = { income:50000,age:62,years:3,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:200000,
    stability:10,interaction:10,jcic:'10',membership:5,collateral:'10',guarantorCount:0,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:100000,guarantors:[] };
  assert(CS(inp).ageScore === 0, 'got:'+CS(inp).ageScore);
});
test('年齡罰分 70 到期 = -5', () => {
  const inp = { income:50000,age:67,years:3,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:200000,
    stability:10,interaction:10,jcic:'10',membership:5,collateral:'10',guarantorCount:0,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:100000,guarantors:[] };
  assert(CS(inp).ageScore === -5, 'got:'+CS(inp).ageScore);
});
test('年齡罰分 71 到期 = -10', () => {
  const inp = { income:50000,age:68,years:3,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:200000,
    stability:10,interaction:10,jcic:'10',membership:5,collateral:'10',guarantorCount:0,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:100000,guarantors:[] };
  assert(CS(inp).ageScore === -10, 'got:'+CS(inp).ageScore);
});
test('年齡罰分 75 到期 = -10 (否決在 ARV 是 >75)', () => {
  const inp = { income:50000,age:72,years:3,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:200000,
    stability:10,interaction:10,jcic:'10',membership:5,collateral:'10',guarantorCount:0,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:100000,guarantors:[] };
  assert(CS(inp).ageScore === -10, 'got:'+CS(inp).ageScore);
});
test('年齡罰分 76 到期 = -10 (否決在 ARV)', () => {
  const inp = { income:50000,age:73,years:3,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:200000,
    stability:10,interaction:10,jcic:'10',membership:5,collateral:'10',guarantorCount:0,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:100000,guarantors:[] };
  assert(CS(inp).ageScore === -10, 'got:'+CS(inp).ageScore);
});
test('income=0 回傳零分物件', () => {
  const inp = { income:0,age:40,years:5,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:500000,
    stability:10,interaction:10,jcic:'10',membership:5,collateral:'10',guarantorCount:0,purpose:'10',career:6,participation:4,
    internalBalance:0,shares:200000,guarantors:[] };
  const r = CS(inp);
  assert(r.total===0 && r.dsr===0 && r.dsrScore===0 && r.ageScore===0, 'got:'+JSON.stringify(r));
});

console.log('\n── applyRegulatoryVetoes (8) ──');
test('到期>75 → veto', () => {
  const i = { income:80000,age:72,years:10,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:500000,collateral:'10',shares:200000,internalBalance:0 };
  assert(ARV(i).vetoes.some(v=>v.includes('75')));
});
test('>7年無不動產 → veto', () => {
  const i = { income:80000,age:40,years:8,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:500000,collateral:'5',shares:200000,internalBalance:0 };
  assert(ARV(i).vetoes.some(v=>v.includes('7')));
});
test('聯徵veto → veto', () => {
  const i = { income:80000,age:40,years:5,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:500000,jcic:'veto',purpose:'10',collateral:'10',shares:200000,internalBalance:0 };
  assert(ARV(i).vetoes.some(v=>v.includes('聯徵')));
});
test('用途veto → veto', () => {
  const i = { income:80000,age:40,years:5,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:500000,jcic:'10',purpose:'veto',collateral:'10',shares:200000,internalBalance:0 };
  assert(ARV(i).vetoes.some(v=>v.includes('用途')));
});
test('正常案 0 否決', () => {
  const i = { income:80000,age:40,years:5,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:500000,jcic:'10',purpose:'10',collateral:'10',shares:200000,internalBalance:0 };
  assert(ARV(i).vetoes.length === 0, 'got:'+ARV(i).vetoes.join(';'));
});
test('income=0 → postLoanDti=Infinity', () => {
  const i = { income:0,age:40,years:5,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:500000,collateral:'10',shares:200000,internalBalance:0 };
  assert(ARV(i).postLoanDti === Infinity);
});
test('擔保品12 ≤7年 loan>shares → veto', () => {
  const i = { income:80000,age:40,years:5,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:300000,collateral:'12',shares:200000,internalBalance:0 };
  assert(ARV(i).vetoes.some(v=>v.includes('足額股金內借款')));
});
test('擔保品12 >7年 不觸發此規則（由規則④處理）', () => {
  const i = { income:80000,age:40,years:8,ratePercent:3,existingDebt:0,internalMonthly:0,proposedLoan:300000,collateral:'12',shares:200000,internalBalance:0 };
  const v = ARV(i).vetoes;
  assert(!v.some(x=>x.includes('足額股金內借款')), '不應觸發12規則，got:'+v.join(';'));
});
test('源碼：8 條否決規則（含擔保品12）', () => {
  const src = fs.readFileSync(__dirname + '/index.html','utf8');
  const vf = src.substring(src.indexOf('function applyRegulatoryVetoes'), src.indexOf('function determineGrade'));
  assert((vf.match(/vetoes\.push/g)||[]).length === 8, 'got:'+(vf.match(/vetoes\.push/g)||[]).length);
});

console.log('\n── determineGrade (3) ──');
test('95→A / DTI 0.6', () => { const g=DG(95,false); assert(g.grade==='A'&&g.maxDti===0.60, 'got:'+g.grade+'/'+g.maxDti); });
test('55→E', () => assert(DG(55,false).grade==='E'));
test('否決→E+DTI=0', () => { const g=DG(95,true); assert(g.grade==='E'&&g.maxDti===0, 'got:'+g.grade+'/'+g.maxDti); });

console.log('\n── computeMaxLoan (2) ──');
test('5萬/50%/5Y/3% → ≈139萬', () => { const i={income:50000,existingDebt:0,internalMonthly:0,ratePercent:3,years:5}; approx(CML(i,0.50),1393545,3000); });
test('DTI=0→0', () => assert(CML({income:50000,existingDebt:0,internalMonthly:0,ratePercent:3,years:5},0)===0));

console.log('\n── applyLegalCeiling (2) ──');
test('信用借款=股金+100萬', () => { const i={collateral:'0',shares:200000,internalBalance:0,age:40}; assert(ALC(i,10_000_000)===1_200_000, 'got:'+ALC(i,10_000_000)); });
test('不動產上限=1000萬', () => { const i={collateral:'10',shares:200000,internalBalance:0,age:40}; assert(ALC(i,10_000_000)===10_000_000); });

// ============================================================
console.log('\n' + '='.repeat(44));
console.log('  PASS: ' + passed + '  |  FAIL: ' + failed + '  |  TOTAL: ' + (passed+failed));
console.log('='.repeat(44) + '\n');
process.exit(failed > 0 ? 1 : 0);
