// ============================================================
// DOM 輔助
// ============================================================
const $ = id => document.getElementById(id);

// ============================================================
// 解析與驗證輸入（DOM 關聯部分）
// ============================================================
function parseInputs() {
    return {
        memberId:       $('memberId').value.trim(),
        appDate:        $('appDate').value,
        income:         parseFloat($('income').value) || 0,
        age:            parseInt($('age').value) || 0,
        existingDebt:   parseFloat($('existing_debt').value) || 0,
        internalMonthly:parseFloat($('internal_monthly').value) || 0,
        internalBalance:parseFloat($('internal_balance').value) || 0,
        proposedLoan:   parseFloat($('loan').value) || 0,
        years:          parseInt($('years').value) || 0,
        ratePercent:    parseFloat($('rate').value) || 0,
        shares:         parseFloat($('shares').value) || 0,
        incomeStability:parseInt($('incomeStability').value) || 0,
        tenure:         parseInt($('tenure').value) || 0,
        interaction:    parseInt($('interaction').value) || 0,
        jcic:           $('jcic').value,
        membership:     parseInt($('membership').value) || 0,
        collateral:     $('collateral').value,
        guarantorCount:  parseInt($('guarantor_count').value) || 0,
        guarantors: Array.from(document.querySelectorAll('.guarantor-row')).map(row => ({
            name: row.querySelector('.g-name').value.trim(),
            income: parseFloat(row.querySelector('.g-income').value) || 0,
            debt: parseFloat(row.querySelector('.g-debt').value) || 0,
        })),
        purpose:        $('purpose').value,
        career:         parseInt($('career').value) || 0,
        participation:  parseInt($('participation').value) || 0,
    };
}

// ============================================================
// Inline 驗證 UI
// ============================================================

// 為指定 input 旁的 error-msg span 設定文字；無 error 時隱藏
function setFieldError(inputEl, msg) {
    if (!inputEl) return;
    if (msg) {
        inputEl.classList.add('has-error');
        let span = inputEl.nextElementSibling;
        while (span && !span.classList?.contains('error-msg')) {
            span = span.nextElementSibling;
        }
        if (!span || !span.classList?.contains('error-msg')) {
            // 找最近一個 form-group 內的 error-msg（相容保證人動態 row）
            const group = inputEl.closest('.form-group');
            if (group) {
                span = group.querySelector('.error-msg');
            }
        }
        if (span) {
            span.textContent = msg;
            span.style.display = 'block';
        }
    } else {
        inputEl.classList.remove('has-error');
        const group = inputEl.closest('.form-group');
        if (group) {
            const span = group.querySelector('.error-msg');
            if (span) { span.textContent = ''; span.style.display = 'none'; }
        }
    }
}

function clearAllFieldErrors() {
    document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    document.querySelectorAll('.error-msg').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
}

function applyFieldErrors(fieldErrors) {
    // 主表單欄位
    const idMap = {
        income: 'income',
        existing_debt: 'existing_debt',
        internal_monthly: 'internal_monthly',
        internal_balance: 'internal_balance',
        loan: 'loan',
        shares: 'shares',
        years: 'years',
        rate: 'rate',
        age: 'age',
    };
    Object.keys(idMap).forEach(key => {
        const el = $(idMap[key]);
        if (el) setFieldError(el, fieldErrors[key] || '');
    });
    // 保證人動態欄位
    document.querySelectorAll('.guarantor-row').forEach((row, i) => {
        setFieldError(row.querySelector('.g-name'), fieldErrors[`g_name_${i}`] || '');
        setFieldError(row.querySelector('.g-income'), fieldErrors[`g_income_${i}`] || '');
        setFieldError(row.querySelector('.g-debt'), fieldErrors[`g_debt_${i}`] || '');
    });
}

function getFirstErrorElement(fieldErrors) {
    const order = ['income','age','years','loan','rate','shares','existing_debt','internal_monthly','internal_balance'];
    for (const k of order) {
        if (fieldErrors[k]) {
            return $(k);
        }
    }
    // 保證人
    const rows = document.querySelectorAll('.guarantor-row');
    for (let i = 0; i < rows.length; i++) {
        if (fieldErrors[`g_name_${i}`] || fieldErrors[`g_income_${i}`] || fieldErrors[`g_debt_${i}`]) {
            return rows[i];
        }
    }
    return null;
}

// ============================================================
// 動態保證人列 & 擔保品聯動（A2, B2）
// ============================================================
function renderGuarantorRows(count) {
    count = Math.min(count, MAX_GUARANTORS);
    const container = $('guarantorList');
    const existingRows = container.querySelectorAll('.guarantor-row');
    const existingData = Array.from(existingRows).map(row => ({
        name: row.querySelector('.g-name').value,
        income: row.querySelector('.g-income').value,
        debt: row.querySelector('.g-debt').value,
    }));
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const d = existingData[i] || { name: '', income: '', debt: '' };
        const r = document.createElement('div');
        r.className = 'guarantor-row';
        r.innerHTML =
            '<div class="form-group">' +
                '<label>保證人姓名</label>' +
                '<input type="text" class="g-name" placeholder="姓名（如：王大成）" value="' + escapeHtml(d.name) + '">' +
                '<span class="error-msg"></span>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>月收入 (元)</label>' +
                '<input type="number" class="g-income" placeholder="例如：50000" min="0" value="' + d.income + '">' +
                '<span class="input-preview g-income-preview"></span>' +
                '<span class="error-msg"></span>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>既有債務月付 (元)</label>' +
                '<input type="number" class="g-debt" placeholder="0" min="0" value="' + d.debt + '">' +
                '<span class="input-preview g-debt-preview"></span>' +
                '<span class="error-msg"></span>' +
            '</div>';
        container.appendChild(r);
    }
    bindGuarantorPreviews();
}

function bindGuarantorPreviews() {
    document.querySelectorAll('.guarantor-row').forEach(row => {
        const incomeInput = row.querySelector('.g-income');
        const debtInput = row.querySelector('.g-debt');
        const incomePreview = row.querySelector('.g-income-preview');
        const debtPreview = row.querySelector('.g-debt-preview');
        const updateIncome = () => { incomePreview.innerText = formatAmount(parseFloat(incomeInput.value) || 0); };
        const updateDebt = () => { debtPreview.innerText = formatAmount(parseFloat(debtInput.value) || 0); };
        incomeInput.addEventListener('input', updateIncome);
        debtInput.addEventListener('input', updateDebt);
        updateIncome();
        updateDebt();
    });
}

function updateCollateralByYears() {
    const yearsVal = parseInt($('years').value) || 0;
    const collateralEl = $('collateral');
    const lockMsg = $('collateralLockMsg');
    for (let i = 0; i < collateralEl.options.length; i++) {
        collateralEl.options[i].disabled = (yearsVal > LONG_TERM_YEARS && collateralEl.options[i].value !== '10');
    }
    if (yearsVal > LONG_TERM_YEARS) {
        if (collateralEl.value !== '10') {
            collateralEl.value = '10';
        }
        lockMsg.style.display = 'block';
    } else {
        lockMsg.style.display = 'none';
    }
    // 擔保放款一般上限 20 年，屋齡 20 年內自用住宅放寬至 30 年；>30 由法規否決擋下
    const yearsHint = $('yearsHint');
    if (yearsHint) {
        yearsHint.style.display = (yearsVal > SECURED_YEARS_STANDARD && yearsVal <= MAX_SECURED_YEARS) ? 'block' : 'none';
    }
}

// ============================================================
// UI 渲染
// ============================================================
function renderDashboard(result) {
    const { input, scoreDetail, isVetoed, vetoes, grade, maxDti, maxLoanLimit, postLoanDti, totalExposure, shareMult, statusText } = result;

    // 顯示數字與指針一致 clamp 0–100（總分理論值可能因扣分為負）
    const scoreClamped = Math.max(0, Math.min(100, scoreDetail.total));
    $('gaugeScoreVal').textContent = scoreClamped;
    // SVG gauge 填色與進度
    const gaugeEl = $('gaugeFill');
    const gaugeCircumference = 2 * Math.PI * 58;  // ≈ 364.4
    const gaugeOffset = gaugeCircumference * (1 - scoreClamped / 100);
    gaugeEl.setAttribute('stroke-dasharray', String(gaugeCircumference));
    gaugeEl.setAttribute('stroke-dashoffset', String(gaugeOffset));
    const gradeEl = $('resGrade');
    gradeEl.innerText = grade;
    const gradeColors  = { A:'#2e7d32', B:'#00695c', C:'#e65100', D:'#bf360c', E:'#c62828' };
    const gradeBgs     = { A:'#e8f5e9', B:'#e0f2f1', C:'#fff3e0', D:'#fbe9e7', E:'#ffebee' };
    const gradeBorders = { A:'#c8e6c9', B:'#b2dfdb', C:'#ffe0b2', D:'#ffccbc', E:'#ffcdd2' };
    gradeEl.style.color = gradeColors[grade] || '#000051';
    const gradeCard = gradeEl.closest('.result-stat');
    gradeCard.style.backgroundColor = gradeBgs[grade] || '#fff';
    gradeCard.style.borderColor = gradeBorders[grade] || '#edf2f7';
    gaugeEl.setAttribute('stroke', gradeColors[grade] || '#1a237e');

    $('resLimit').innerText = Math.round(maxLoanLimit).toLocaleString('zh-TW');
    $('resTotalDti').innerText = (postLoanDti * 100).toFixed(1);
    $('resMaxDtiTxt').innerText = (maxDti * 100);
    $('resMaxDtiTxt2').innerText = (maxDti * 100);
    $('resShareMult').innerText = shareMult !== null ? shareMult.toFixed(1) : '—';
    $('resTotalExposure').innerText = totalExposure.toLocaleString('zh-TW');
    // [FIX 2.1] 加上 age > 0 判斷，避免 0 / 負數年齡誤觸發未成年人警告
    $('minorWarn').style.display = (input.age > 0 && input.age < 18 && !isVetoed) ? 'block' : 'none';

    // 股金 / 擔保品提示（[FIX 6.3] 改用 CSS class）
    const shareHint = $('shareHint');
    if (input.shares > 0) {
        let hintMsg = '';
        let hintType = '';
        let conflict = '';
        if (input.collateral === '12' && input.proposedLoan > input.shares) {
            conflict = '申請金額超過股金餘額，不符合「足額股金內借款」條件，請重新確認擔保品欄位。';
        } else if (input.collateral === '5' && input.proposedLoan > input.shares * 2) {
            conflict = '申請金額超過股金 2 倍，不符合「股金 2 倍內」條件，請重新確認擔保品欄位。';
        } else if (input.collateral === '0' && input.proposedLoan <= input.shares) {
            conflict = '申請金額未超過股金，可能符合「足額股金內借款」，請確認擔保品欄位設定。';
        }
        if (conflict) {
            hintType = 'error';
            hintMsg = `擔保品設定矛盾：${conflict}`;
        } else if (input.collateral === '10') {
            hintType = 'info';
            hintMsg = `股金參考：申請額為股金的 ${shareMult !== null ? shareMult.toFixed(1) : '—'} 倍，擔保品為足額不動產，不受股金倍數限制。`;
        } else if (input.proposedLoan <= input.shares) {
            hintType = 'success';
            hintMsg = '股金確認：申請金額未超過股金餘額，符合「足額股金內借款」條件。';
        } else if (input.proposedLoan <= input.shares * 2) {
            hintType = 'warn';
            hintMsg = `股金確認：申請金額為股金的 ${shareMult.toFixed(1)} 倍，屬「股金 2 倍內」範圍。`;
        } else {
            hintType = 'error';
            hintMsg = `股金確認：申請金額已超過股金的 2 倍（目前 ${shareMult.toFixed(1)} 倍），屬純信用借款，請確認擔保品設定。`;
        }
        // A3: >7 year overrides share hint
        if (input.years > LONG_TERM_YEARS && input.collateral !== '10') {
            hintType = 'error';
            hintMsg = `貸款年限 ${input.years} 年超過 ${LONG_TERM_YEARS} 年，不得僅以股金或信用方式辦理，須改為足額不動產抵押。`;
        }
        shareHint.className = `hint hint-${hintType}`;
        shareHint.innerText = hintMsg;
        shareHint.style.display = 'block'; // 必須清掉 index.html 的 inline display:none，class 蓋不過 inline
    } else {
        shareHint.style.display = 'none';
    }

    // 評分組成（5P）— computeScore 已回傳各面向分數，這裡只負責渲染
    const breakdown = [
        ['bd_ability',     scoreDetail.dsrScore + scoreDetail.stability, 35],
        ['bd_credit',      scoreDetail.peopleScore,                      25],
        ['bd_protection',  scoreDetail.protectionScore,                  20],
        ['bd_purpose',     scoreDetail.purposeScore,                     10],
        ['bd_perspective', scoreDetail.perspectiveScore,                 10],
    ];
    breakdown.forEach(([id, val, max]) => {
        const pct = Math.max(0, Math.min(100, (val / max) * 100)); // peopleScore 可為負，bar 寬 clamp 0
        $(id).style.width = pct + '%';
        $(id + '_val').textContent = val;
    });
    const bdAge = $('bd_age_val');
    bdAge.textContent = scoreDetail.ageScore === 0 ? '—' : `${scoreDetail.ageScore} 分`;
    bdAge.classList.toggle('neg', scoreDetail.ageScore < 0);

    // 狀態訊息（[FIX 1.3] 否決清單以 <ul> 累積呈現）
    const statusEl = $('resStatus');
    statusEl.className = 'status-msg';
    if (isVetoed) {
        statusEl.innerHTML = `🚫 系統判定：不予核貸<ul class="veto-list">${vetoes.map(v => `<li>${v}</li>`).join('')}</ul>`;
        statusEl.classList.add('status-fail');
    } else if (grade === 'E') {
        statusEl.innerHTML = '⚠️ 評分不足 60 分，請專職/幹部審慎評估';
        statusEl.classList.add('status-fail');
    } else if (postLoanDti > maxDti) {
        statusEl.innerHTML = `❌ 額度超限：預計月負擔 (${(postLoanDti*100).toFixed(1)}%) 超過本級上限 (${(maxDti*100).toFixed(0)}%)`;
        statusEl.classList.add('status-warn');
    } else {
        statusEl.innerHTML = '✅ 信用良好且負擔合理，評分供專職/幹部裁量參考';
        statusEl.classList.add('status-pass');
    }

    // 進度條（[FIX 5.4] 顏色相對 DTI；[FIX 5.5] DTI>100% 溢出提示）
    const fillWidthPercent = Math.min(postLoanDti * 100, 100);
    const progressFill = $('progressFill');
    progressFill.style.width = fillWidthPercent + '%';
    if (maxDti <= 0) {
        progressFill.style.backgroundColor = '#f44336';
    } else {
        const ratio = postLoanDti / maxDti;
        if (ratio < 0.7)      progressFill.style.backgroundColor = '#4caf50';
        else if (ratio <= 1.0) progressFill.style.backgroundColor = '#ffeb3b';
        else                  progressFill.style.backgroundColor = '#f44336';
    }
    // [FIX 5.3] E 級隱藏 marker
    const markerEl = $('progressLimit');
    if (maxDti > 0) {
        markerEl.classList.remove('hidden');
        markerEl.style.left = (maxDti * 100) + '%';
    } else {
        markerEl.classList.add('hidden');
    }
    // [FIX 5.5] DTI > 100% 顯示溢出警示
    const overflowBadge = $('dtiOverflowBadge');
    if (postLoanDti > 1.0) {
        overflowBadge.style.display = 'inline-block';
        overflowBadge.innerText = `超 ${(postLoanDti * 100 - 100).toFixed(1)}% 點`;
    } else {
        overflowBadge.style.display = 'none';
    }

    // [FIX 1.2] 預核章依狀態切換
    $('sealText').innerText = result.sealText;
    const sealEl = $('printSeal');
    sealEl.classList.remove('system-seal-pass', 'system-seal-fail', 'system-seal-warn');
    sealEl.classList.add(`system-seal-${result.sealType}`);

    $('resultCard').style.display = 'block';
    $('btnPrint').style.display = 'block';
    $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPrintReport(result) {
    const { input, scoreDetail, isVetoed, vetoes, grade, maxDti, maxLoanLimit, postLoanDti, totalExposure, shareMult, ageAtMaturity, statusText } = result;

    // [FIX 3.3] 報表 ID 改為序號制
    const today = new Date();
    const ymd = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const seq = getReportSeq();
    $('reportId').innerText = `CU-${ymd}-${String(seq).padStart(4,'0')}`;
    $('printDate').innerText = today.toLocaleString('zh-TW');
    $('printAppDate').innerText = input.appDate || '—';

    // [FIX 3.2] 案件基本資訊
    $('p_memberId').innerText = input.memberId || '—';
    $('p_income').innerText = input.income.toLocaleString('zh-TW') + ' 元';
    $('p_existing').innerText = input.existingDebt.toLocaleString('zh-TW') + ' 元';
    $('p_internal').innerText = `${input.internalMonthly.toLocaleString('zh-TW')} 元 / 餘額 ${input.internalBalance.toLocaleString('zh-TW')} 元（在本社借款總金額：${totalExposure.toLocaleString('zh-TW')} 元）`;
    $('p_loan_details').innerText = `${input.proposedLoan.toLocaleString('zh-TW')} 元 / ${input.years} 年 / ${input.ratePercent}% （借款人現齡 ${input.age} 歲，還款到期年齡 ${ageAtMaturity} 歲）`;
    $('p_shares_info').innerText = input.shares > 0
        ? `${input.shares.toLocaleString('zh-TW')} 元 / 倍數 ${shareMult.toFixed(1)} 倍`
        : '未填寫';

    // [FIX 1.8] 5P 明細使用語意化 ID
    const stabText = $('incomeStability').options[$('incomeStability').selectedIndex].text;
    const tenText = $('tenure').options[$('tenure').selectedIndex].text;
    $('p_stability').innerText = stabText + ' / ' + tenText;
    $('p_interaction').innerText = $('interaction').options[$('interaction').selectedIndex].text;
    $('p_jcic').innerText = $('jcic').options[$('jcic').selectedIndex].text;
    $('p_collateral').innerText = $('collateral').options[$('collateral').selectedIndex].text;
    if (input.guarantors && input.guarantors.length > 0) {
        let html = '<table class="print-table" style="margin-top:5px;"><tr><th>保證人</th><th>月收入</th><th>既有債務月付</th><th>DSR</th></tr>';
        input.guarantors.forEach(g => {
            const dsr = g.income > 0 ? ((g.debt / g.income) * 100).toFixed(1) + '%' : '—';
            html += '<tr><td>' + (escapeHtml(g.name) || '—') + '</td><td>' + g.income.toLocaleString('zh-TW') + ' 元</td><td>' + g.debt.toLocaleString('zh-TW') + ' 元</td><td>' + dsr + '</td></tr>';
        });
        html += '</table>';
        $('p_guarantor_print').innerHTML = html;
    } else {
        $('p_guarantor_print').innerText = '無';
    }
    $('p_purpose').innerText = $('purpose').options[$('purpose').selectedIndex].text;
    $('p_career_print').innerText = $('career').options[$('career').selectedIndex].text;
    $('p_participation_print').innerText = $('participation').options[$('participation').selectedIndex].text;

    // 5P 各面向分數
    $('p_score_ability').innerText = scoreDetail.dsrScore + scoreDetail.stability;
    $('p_score_credit').innerText = scoreDetail.peopleScore;
    $('p_score_protection').innerText = scoreDetail.protectionScore;
    $('p_score_purpose').innerText = scoreDetail.purposeScore;
    $('p_score_perspective').innerText = scoreDetail.perspectiveScore;
    $('p_score_age').innerText = scoreDetail.ageScore === 0
        ? `無（還款到期年齡 ${ageAtMaturity} 歲）`
        : `${scoreDetail.ageScore} 分（還款到期年齡 ${ageAtMaturity} 歲）`;

    // 評估結果
    $('p_grade').innerText = grade;
    $('p_score').innerText = Math.max(0, Math.min(100, scoreDetail.total));
    $('p_dti').innerText = (postLoanDti * 100).toFixed(1);
    $('p_maxdti').innerText = (maxDti * 100);
    $('p_limit').innerText = Math.round(maxLoanLimit).toLocaleString('zh-TW');
    // [FIX 3.4] 列印狀態去 emoji
    $('p_status').innerText = stripEmoji(statusText);

    $('p_grade2').innerText = grade;
    $('p_maxdti2').innerText = (maxDti * 100);
}

// ============================================================
// 主流程
// ============================================================
function calculateLoan() {
    try {
    // 擔保品聯動保險：確保之前年的變更已同步（若未失焦）
    updateCollateralByYears();
    const input = parseInputs();

    // [FIX 4.1] 輸入驗證（含負值防呆）
    const errors = validateInputs(input);
    if (errors.length > 0) {
        const fieldErrors = validateInputsByField(input);
        clearAllFieldErrors();
        applyFieldErrors(fieldErrors);
        $('resultCard').style.display = 'none';
        $('btnPrint').style.display = 'none';
        const firstEl = getFirstErrorElement(fieldErrors);
        if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    clearAllFieldErrors();

    // 評分
    const scoreDetail = computeScore(input);

    // [FIX 1.3] 法規否決（累積所有觸發原因）
    const { vetoes, newLoanMonthlyPmt, postLoanDti } = applyRegulatoryVetoes(input);
    const isVetoed = vetoes.length > 0;

    // 等級
    const { grade, maxDti } = determineGrade(scoreDetail.total, isVetoed);

    // 可貸額度（[FIX 1.1] 用 PMT 公式反推）
    let maxLoanLimit = computeMaxLoan(input, maxDti);
    maxLoanLimit = applyLegalCeiling(input, maxLoanLimit);

    // 衍生變數
    const ageAtMaturity = input.age + input.years;
    const totalExposure = input.internalBalance + input.proposedLoan;
    const shareMult = input.shares > 0 ? (input.proposedLoan / input.shares) : null;

    // 狀態文字（純文字版，供列印去 emoji）
    let statusText, sealText, sealType;
    if (isVetoed) {
        statusText = `不予核貸：${vetoes.join('；')}`;
        sealText = '不予核貸';
        sealType = 'fail';
    } else if (grade === 'E') {
        statusText = '評分不足 60 分，請專職/幹部審慎評估';
        sealText = '專職審核';
        sealType = 'fail';
    } else if (postLoanDti > maxDti) {
        statusText = `額度超限：預計月負擔 (${(postLoanDti*100).toFixed(1)}%) 超過本級上限 (${(maxDti*100).toFixed(0)}%)`;
        sealText = '額度超限';
        sealType = 'warn';
    } else {
        statusText = '信用良好且負擔合理，評分供專職/幹部裁量參考';
        sealText = '評分完成';
        sealType = 'pass';
    }

    const result = {
        input, scoreDetail, isVetoed, vetoes, grade, maxDti, maxLoanLimit,
        newLoanMonthlyPmt, postLoanDti, totalExposure, shareMult, ageAtMaturity,
        statusText, sealText, sealType
    };

    renderDashboard(result);
    renderPrintReport(result);
    } catch(e) { console.error('calculateLoan error:', e); alert('計算過程發生錯誤，請檢查輸入資料。\n' + e.message); }
}

// ============================================================
// 初始化
// ============================================================
const FORM_DRAFT_KEY = 'cu_form_draft';
const FORM_DRAFT_FIELDS = [
    'memberId','appDate','income','age','existing_debt','internal_monthly','internal_balance',
    'loan','years','rate','shares','incomeStability','tenure','interaction','jcic','membership',
    'collateral','guarantor_count','purpose','career','participation'
];

function saveFormDraft() {
    try {
        const data = {};
        FORM_DRAFT_FIELDS.forEach(id => {
            const el = $(id);
            if (el) data[id] = el.value;
        });
        // 保證人動態欄位
        const guarantors = Array.from(document.querySelectorAll('.guarantor-row')).map(row => ({
            name: row.querySelector('.g-name').value,
            income: row.querySelector('.g-income').value,
            debt: row.querySelector('.g-debt').value,
        }));
        data._guarantors = guarantors;
        localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage 不可用時略過 */ }
}

function loadFormDraft() {
    try {
        const raw = localStorage.getItem(FORM_DRAFT_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        FORM_DRAFT_FIELDS.forEach(id => {
            if (data[id] !== undefined) {
                const el = $(id);
                if (el) el.value = data[id];
            }
        });
        // 重建保證人 row（會清空再 render 一次）
        const gCount = parseInt($('guarantor_count').value) || 0;
        renderGuarantorRows(gCount);
        // 還原保證人資料
        if (Array.isArray(data._guarantors) && data._guarantors.length > 0) {
            const rows = document.querySelectorAll('.guarantor-row');
            data._guarantors.forEach((g, i) => {
                if (i >= rows.length) return;
                const r = rows[i];
                if (g.name !== undefined)   r.querySelector('.g-name').value   = g.name;
                if (g.income !== undefined) r.querySelector('.g-income').value = g.income;
                if (g.debt !== undefined)   r.querySelector('.g-debt').value   = g.debt;
            });
            bindGuarantorPreviews();
        }
        updateCollateralByYears();
        return true;
    } catch (e) {
        return false;
    }
}

function clearFormDraft() {
    try { localStorage.removeItem(FORM_DRAFT_KEY); } catch (e) { /* noop */ }
}

document.addEventListener('DOMContentLoaded', () => {
    // 申請日期預設今天
    const appDate = $('appDate');
    if (appDate && !appDate.value) {
        const t = new Date();
        appDate.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }

    // 金額欄位即時預覽
    const moneyFields = ['income', 'existing_debt', 'internal_monthly', 'internal_balance', 'loan', 'shares'];
    moneyFields.forEach(id => {
        const input = $(id);
        const preview = $('preview_' + id);
        if (!input || !preview) return;
        const update = () => {
            const val = parseFloat(input.value) || 0;
            preview.innerText = formatAmount(val);
        };
        input.addEventListener('input', update);
        update();
    });

    // 動態保證人列初始化
    const guarantorCountEl = $('guarantor_count');
    renderGuarantorRows(parseInt(guarantorCountEl.value) || 0);
    guarantorCountEl.addEventListener('change', () => {
        renderGuarantorRows(parseInt(guarantorCountEl.value) || 0);
        saveFormDraft();
    });

    // 擔保品聯動：年限變更時
    $('years').addEventListener('change', updateCollateralByYears);
    $('collateral').addEventListener('change', updateCollateralByYears);
    updateCollateralByYears();

    // 草稿自動存：所有欄位的 input/change 事件
    FORM_DRAFT_FIELDS.forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('input', saveFormDraft);
        el.addEventListener('change', saveFormDraft);
    });
    // 保證人動態欄位：事件委派到容器
    const guarantorList = $('guarantorList');
    if (guarantorList) {
        guarantorList.addEventListener('input', saveFormDraft);
        guarantorList.addEventListener('change', saveFormDraft);
    }

    // 頁面載入時還原草稿（若存在）
    loadFormDraft();

    // 清除草稿按鈕
    const clearBtn = $('clearDraftBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('確定要清除已填寫的草稿並重置表單？')) {
                clearFormDraft();
                location.reload();
            }
        });
    }

    // 區塊折疊（滑鼠 + 鍵盤無障礙）
    document.querySelectorAll('.card.collapsible .section-title').forEach(title => {
        const card = title.closest('.card.collapsible');
        const panel = title.nextElementSibling;

        title.setAttribute('role', 'button');
        title.setAttribute('tabindex', '0');
        title.setAttribute('aria-expanded', String(!card.classList.contains('collapsed')));
        if (!panel.id) panel.id = 'panel-' + Math.random().toString(36).slice(2);
        title.setAttribute('aria-controls', panel.id);

        const toggle = () => {
            const isCollapsed = card.classList.toggle('collapsed');
            title.setAttribute('aria-expanded', String(!isCollapsed));
        };

        title.addEventListener('click', toggle);
        title.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
    });
});
