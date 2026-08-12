// ============================================================
// DOM 輔助
// ============================================================
const $ = (id) => document.getElementById(id);

// C1：金額欄位千分位處理（[FIX 7.x] type=text 後需自帶格式）
// 讀取時去逗號；寫入時加逗號
const parseAmount = (id) =>
  parseFloat(String($(id).value).replace(/,/g, '')) || 0;
function formatAmountInput(el) {
  if (!el) return;
  const originalValue = el.value;
  const originalPos = el.selectionStart;

  // 計算游標前非數字字元的個數（例如逗號）
  const beforeCommas = (
    originalValue.substring(0, originalPos).match(/,/g) || []
  ).length;
  const digitsBefore = originalPos - beforeCommas;

  const cleaned = originalValue.replace(/[^\d]/g, '');
  if (!cleaned) {
    el.value = '';
    return;
  }
  const num = parseInt(cleaned, 10) || 0;
  const formatted = num.toLocaleString('en-US');
  el.value = formatted;

  // 計算新游標位置，使其對應相同的數字字元數
  let newPos = 0;
  let digitCount = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] >= '0' && formatted[i] <= '9') {
      digitCount++;
    }
    newPos++;
    if (digitCount === digitsBefore) {
      break;
    }
  }
  el.setSelectionRange(newPos, newPos);
}

// ============================================================
// Modal 無障礙：focus trap + Esc 關閉 + scroll lock + focus 還原
// ============================================================
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let _modalReturnFocus = null;
let _modalEscHandler = null;
let _modalTrapHandler = null;

function getFocusable(modalEl) {
  return Array.from(modalEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

function openModal(modalEl) {
  if (!modalEl) return;
  _modalReturnFocus = document.activeElement;
  modalEl.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // focus 第一個可聚焦元素
  const focusable = getFocusable(modalEl);
  if (focusable.length > 0) focusable[0].focus();

  // Esc 關閉
  _modalEscHandler = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeModal(modalEl);
    }
  };
  document.addEventListener('keydown', _modalEscHandler);

  // focus trap
  _modalTrapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const items = getFocusable(modalEl);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !modalEl.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !modalEl.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
  modalEl.addEventListener('keydown', _modalTrapHandler);
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.style.display = 'none';
  document.body.style.overflow = '';
  if (_modalEscHandler) {
    document.removeEventListener('keydown', _modalEscHandler);
    _modalEscHandler = null;
  }
  if (_modalTrapHandler) {
    modalEl.removeEventListener('keydown', _modalTrapHandler);
    _modalTrapHandler = null;
  }
  if (_modalReturnFocus && typeof _modalReturnFocus.focus === 'function') {
    _modalReturnFocus.focus();
    _modalReturnFocus = null;
  }
}

// ============================================================
// 解析與驗證輸入（DOM 關聯部分）
// ============================================================
// ============================================================
// 操作列：必填計數 + 未確認下拉標示
// ============================================================

// UI 層的「必填」比 core.js 的 validateInputs 嚴一點：後者只擋
// income/years/proposedLoan，但 age/rate/shares 沒填會讓結果失真。
// 這裡只做計數與導引，不阻擋計算。
const REQUIRED_FIELD_IDS = ['income', 'age', 'loan', 'years', 'rate', 'shares'];

// 9 個評分用下拉的預設 <option> 全是最優選項（合計約 40 分）。
// 沒被確認過就送出，系統會安靜地給出樂觀分數 —— 故標記並計數。
const SCORING_SELECT_IDS = [
  'incomeStability',
  'tenure',
  'interaction',
  'jcic',
  'membership',
  'collateral',
  'purpose',
  'career',
  'participation',
];
const SCORING_SELECT_LABELS = {
  incomeStability: '收入穩定性',
  tenure: '現職年資',
  interaction: '社內往來',
  jcic: '聯徵紀錄',
  membership: '入社年資',
  collateral: '擔保品設定',
  purpose: '借款用途',
  career: '職業前景',
  participation: '社務參與度',
};

function isFieldFilled(el) {
  return !!el && String(el.value).trim() !== '';
}

// 折疊狀態的唯一入口：class 與 aria-expanded 必須成對更新，
// 否則讀屏軟體會回報與畫面相反的狀態。
function setCardCollapsed(card, collapsed) {
  if (!card) return;
  card.classList.toggle('collapsed', collapsed);
  const title = card.querySelector('.section-title');
  if (title) title.setAttribute('aria-expanded', String(!collapsed));
}

// 「未確認」= 從未被確認過 **且** 仍停在系統預設值。
// 第二個條件讓警語永遠為真：值已經不是預設值時，「維持系統預設值」就是假的。
// 也讓本次改動之前存的舊草稿（沒有 _touchedSelects）不會被整批誤標。
function getUntouchedSelects() {
  return SCORING_SELECT_IDS.map((id) => $(id)).filter(
    (el) =>
      el &&
      el.dataset.untouched === 'true' &&
      el.value === el.dataset.defaultValue
  );
}

// 在 label 尾端掛「未確認」pill，並給 select 一條虛線邊
function applyUntouchedStyling(el) {
  const untouched =
    el.dataset.untouched === 'true' && el.value === el.dataset.defaultValue;
  el.classList.toggle('select-untouched', untouched);
  const group = el.closest('.form-group');
  const label = group && group.querySelector('label');
  if (!label) return;
  let pill = label.querySelector('.untouched-pill');
  if (untouched) {
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'untouched-pill';
      pill.textContent = '未確認';
      label.appendChild(pill);
    }
  } else if (pill) {
    pill.remove();
  }
}

function markSelectTouched(el) {
  if (!el || el.dataset.untouched !== 'true') return;
  el.dataset.untouched = 'false';
  applyUntouchedStyling(el);
  // 呼叫端不只有 change handler（updateCollateralByYears、草稿還原、範例案件
  // 都會呼叫），晶片計數必須跟著走，否則會與結論條的提醒數字互相矛盾。
  updateActionBar();
}

function initScoringSelects() {
  SCORING_SELECT_IDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    // 在草稿還原前記下出廠預設值，之後才判斷得出「是否仍停在預設」
    el.dataset.defaultValue = el.value;
    el.dataset.untouched = 'true';
    el.dataset.scoreLabel = SCORING_SELECT_LABELS[id] || id;
    applyUntouchedStyling(el);
    el.addEventListener('change', () => {
      markSelectTouched(el);
      updateActionBar();
      // FORM_DRAFT_FIELDS 的 saveFormDraft 在本監聽器之前綁定，那次存檔
      // 讀到的還是舊的 untouched 狀態 → 必須在標記後再存一次
      saveFormDraft();
    });
  });
}

// 草稿還原是直接寫 el.value，不會經過 markSelectTouched，
// 因此標示要在還原後整批重算一次（舊草稿沒有 _touchedSelects 時尤其重要）。
function refreshScoringSelectMarks() {
  SCORING_SELECT_IDS.forEach((id) => {
    const el = $(id);
    if (el) applyUntouchedStyling(el);
  });
}

function updateActionBar() {
  const total = REQUIRED_FIELD_IDS.length;
  const filled = REQUIRED_FIELD_IDS.filter((id) => isFieldFilled($(id))).length;
  const reqChip = $('chipRequired');
  const reqCount = $('chipRequiredCount');
  if (reqCount) reqCount.innerText = `${filled}/${total}`;
  if (reqChip) {
    reqChip.classList.toggle('chip-done', filled === total);
    reqChip.classList.toggle('chip-todo', filled < total);
  }

  const untouched = getUntouchedSelects().length;
  const unChip = $('chipUnconfirmed');
  const unCount = $('chipUnconfirmedCount');
  if (unCount) unCount.innerText = String(untouched);
  if (unChip) {
    unChip.classList.toggle('chip-done', untouched === 0);
    unChip.classList.toggle('chip-todo', untouched > 0);
  }
}

// 點晶片 → 跳到第一個還沒處理的欄位
function focusFirstPending(kind) {
  const el =
    kind === 'required'
      ? REQUIRED_FIELD_IDS.map((id) => $(id)).find((e) => !isFieldFilled(e))
      : getUntouchedSelects()[0];
  if (!el) return;
  setCardCollapsed(el.closest('.card.collapsible'), false);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

// ============================================================
// 本社常用參數（年限／利率）— 與草稿分開存，清草稿不會清掉
// ============================================================
const PREFS_KEY = 'cu_prefs';
const PREF_FIELD_IDS = ['years', 'rate'];

function savePrefs() {
  try {
    const data = {};
    PREF_FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) data[id] = el.value;
    });
    localStorage.setItem(PREFS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('本社預設值儲存失敗', e);
    return false;
  }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 只填空欄位 —— 草稿永遠優先於本社預設值
function applyPrefsToEmptyFields() {
  const prefs = loadPrefs();
  if (!prefs) return;
  let applied = false;
  PREF_FIELD_IDS.forEach((id) => {
    const el = $(id);
    if (!el || isFieldFilled(el) || !prefs[id]) return;
    el.value = prefs[id];
    applied = true;
    const group = el.closest('.form-group');
    if (group && !group.querySelector('.pref-hint')) {
      const hint = document.createElement('div');
      hint.className = 'pref-hint';
      hint.textContent = '已帶入本社預設值';
      group.appendChild(hint);
    }
    // 使用者一旦改成別的值，提示就不再成立，必須撤掉
    el.addEventListener('input', () => {
      if (el.value !== prefs[id]) clearPrefHint(el);
    });
  });
  // 程式設值不觸發 change，年限→擔保品的連動必須手動補跑；
  // 否則本社預設年限 >7 年時，擔保品停在「足額股金內」、鑑估欄位不出現，
  // 按下計算才被靜默改成不動產，鑑估價值 0 → 可貸額度算成 0。
  if (applied) {
    updateCollateralByYears();
    updateShareHintLive();
  }
}

function clearPrefHint(el) {
  const group = el && el.closest('.form-group');
  const hint = group && group.querySelector('.pref-hint');
  if (hint) hint.remove();
}

function parseInputs() {
  const consolidationMode = $('consolidationMode').checked;
  return {
    consolidationMode,
    memberId: $('memberId').value.trim(),
    appDate: $('appDate').value,
    income: parseAmount('income'),
    age: parseInt($('age').value) || 0,
    existingDebt: parseAmount('existing_debt'),
    internalMonthly: parseAmount('internal_monthly'),
    internalBalance: parseAmount('internal_balance'),
    internalMonthly2: consolidationMode ? parseAmount('internal_monthly2') : 0,
    internalBalance2: consolidationMode ? parseAmount('internal_balance2') : 0,
    internalYears2: consolidationMode ? parseAmount('internal_years2') : 0,
    internalRate2: consolidationMode ? parseAmount('internal_rate2') : 0,
    proposedLoan: parseAmount('loan'),
    years: parseInt($('years').value) || 0,
    ratePercent: parseFloat($('rate').value) || 0,
    shares: parseAmount('shares'),
    incomeStability: parseInt($('incomeStability').value) || 0,
    tenure: parseInt($('tenure').value) || 0,
    interaction: parseInt($('interaction').value) || 0,
    jcic: $('jcic').value,
    membership: parseInt($('membership').value) || 0,
    collateral: $('collateral').value,
    appraisalValue: parseAmount('appraisalValue'),
    collateralZone: $('collateralZone').value,
    houseAge: parseInt($('houseAge').value) || 0,
    appraisalAge: parseInt($('appraisalAge').value) || 0,
    guarantorCount: parseInt($('guarantor_count').value) || 0,
    guarantors: Array.from(document.querySelectorAll('.guarantor-row')).map(
      (row) => ({
        name: row.querySelector('.g-name').value.trim(),
        income:
          parseFloat(
            String(row.querySelector('.g-income').value).replace(/,/g, '')
          ) || 0,
        debt:
          parseFloat(
            String(row.querySelector('.g-debt').value).replace(/,/g, '')
          ) || 0,
        type: row.querySelector('.g-type').value,
        unknown: row.querySelector('.g-unknown')?.checked || false,
      })
    ),
    purpose: $('purpose').value,
    career: parseInt($('career').value) || 0,
    participation: parseInt($('participation').value) || 0,
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
      if (span) {
        span.textContent = '';
        span.style.display = 'none';
      }
    }
  }
}

function clearAllFieldErrors() {
  document
    .querySelectorAll('.has-error')
    .forEach((el) => el.classList.remove('has-error'));
  document.querySelectorAll('.error-msg').forEach((el) => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

function applyFieldErrors(fieldErrors) {
  // 主表單欄位
  const idMap = {
    income: 'income',
    existing_debt: 'existing_debt',
    internal_monthly: 'internal_monthly',
    internal_balance: 'internal_balance',
    internal_monthly_2: 'internal_monthly2',
    internal_balance_2: 'internal_balance2',
    internal_years_2: 'internal_years2',
    internal_rate_2: 'internal_rate2',
    loan: 'loan',
    shares: 'shares',
    years: 'years',
    rate: 'rate',
    age: 'age',
    appraisalValue: 'appraisalValue',
    houseAge: 'houseAge',
    appraisalAge: 'appraisalAge',
  };
  Object.keys(idMap).forEach((key) => {
    const el = $(idMap[key]);
    if (el) setFieldError(el, fieldErrors[key] || '');
  });
  // 保證人動態欄位
  document.querySelectorAll('.guarantor-row').forEach((row, i) => {
    setFieldError(
      row.querySelector('.g-name'),
      fieldErrors[`g_name_${i}`] || ''
    );
    setFieldError(
      row.querySelector('.g-income'),
      fieldErrors[`g_income_${i}`] || ''
    );
    setFieldError(
      row.querySelector('.g-debt'),
      fieldErrors[`g_debt_${i}`] || ''
    );
  });
}

function getFirstErrorElement(fieldErrors) {
  const order = [
    'income',
    'age',
    'years',
    'loan',
    'rate',
    'shares',
    'existing_debt',
    'internal_monthly',
    'internal_balance',
  ];
  for (const k of order) {
    if (fieldErrors[k]) {
      return $(k);
    }
  }
  // 保證人
  const rows = document.querySelectorAll('.guarantor-row');
  for (let i = 0; i < rows.length; i++) {
    if (
      fieldErrors[`g_name_${i}`] ||
      fieldErrors[`g_income_${i}`] ||
      fieldErrors[`g_debt_${i}`]
    ) {
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
  const existingData = Array.from(existingRows).map((row) => ({
    name: row.querySelector('.g-name').value,
    income: row.querySelector('.g-income').value,
    debt: row.querySelector('.g-debt').value,
    type: row.querySelector('.g-type')
      ? row.querySelector('.g-type').value
      : 'non_member',
    unknown: row.querySelector('.g-unknown')
      ? row.querySelector('.g-unknown').checked
      : false,
  }));
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const d = existingData[i] || {
      name: '',
      income: '',
      debt: '',
      type: 'non_member',
      unknown: false,
    };
    const r = document.createElement('div');
    r.className = 'guarantor-row';
    r.innerHTML =
      '<div class="form-group">' +
      '<label>保證人類型 <span style="font-size: 11px; font-weight: normal; color: #666; margin-left: 5px;">(社員全重/非社員 0.7 倍)</span></label>' +
      '<select class="g-type">' +
      '<option value="member" ' +
      (d.type === 'member' ? 'selected' : '') +
      '>社員保證人 (加權 1.0)</option>' +
      '<option value="non_member" ' +
      (d.type === 'non_member' ? 'selected' : '') +
      '>非社員保證人 (加權 0.7)</option>' +
      '</select>' +
      '<span class="error-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>保證人姓名</label>' +
      '<input type="text" class="g-name" placeholder="姓名（如：王大成）" value="' +
      escapeHtml(d.name) +
      '">' +
      '<span class="error-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>月收入 (元)</label>' +
      '<input type="number" class="g-income" placeholder="例如：50000" min="0" value="' +
      d.income +
      '">' +
      '<span class="input-preview g-income-preview"></span>' +
      '<span class="error-msg"></span>' +
      '</div>' +
      '<div class="form-group form-group-checkbox-guarantor">' +
      '<label class="g-unknown-placeholder" style="margin-bottom: 10px; visibility: hidden; height: 1.55em; display: block;">&nbsp;</label>' +
      '<label class="g-unknown-label">' +
      '<input type="checkbox" class="g-unknown" ' +
      (d.unknown ? 'checked' : '') +
      '> 債務不詳（未查證）' +
      '</label>' +
      '<small style="color: var(--text-muted); display:block; margin-top:4px;">' +
      '勾選後該保證人不會納入保證人 債務比率(DSR)評分，' +
      '並於報表註記「債務未查證」。' +
      '</small>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>既有債務月付 (元)</label>' +
      '<input type="number" class="g-debt" placeholder="0" min="0" value="' +
      (d.unknown ? '' : d.debt) +
      '"' +
      (d.unknown ? ' disabled' : '') +
      '>' +
      '<span class="input-preview g-debt-preview"></span>' +
      '<span class="error-msg"></span>' +
      '</div>';
    container.appendChild(r);
  }
  bindGuarantorPreviews();
  updateGuarantorWeightHint();
}

// 加權保證人數即時回饋（與 core.js GUARANTOR_TYPE_WEIGHT + GUARANTOR_SCORE_TABLE 同邏輯）
const G_WEIGHT = { member: 1.0, non_member: 0.7 };
const G_SCORE_TABLE = { 0: 0, 1: 3, 2: 5, 3: 6, 4: 7, 5: 8 };
function updateGuarantorWeightHint() {
  const el = $('guarantorWeightHint');
  if (!el) return;
  const rows = document.querySelectorAll('.guarantor-row');
  if (rows.length === 0) {
    el.innerText = '';
    return;
  }
  let weighted = 0;
  let m = 0;
  let nm = 0;
  rows.forEach((row) => {
    const t = row.querySelector('.g-type')?.value || 'non_member';
    if (t === 'member') {
      weighted += G_WEIGHT.member;
      m++;
    } else {
      weighted += G_WEIGHT.non_member;
      nm++;
    }
  });
  const effective = Math.round(weighted);
  const score = G_SCORE_TABLE[effective] || 0;
  const parts = [];
  if (m > 0) parts.push(`${m} 社員`);
  if (nm > 0) parts.push(`${nm} 非社員`);
  let unknownCount = 0;
  rows.forEach((row) => {
    const cb = row.querySelector('.g-unknown');
    if (cb && cb.checked) unknownCount++;
  });
  let suffix = '';
  if (unknownCount > 0) {
    suffix = `（${unknownCount} 位不詳，不納入保證人債務比率(DSR)）`;
  }
  el.innerText = `${parts.join(' + ')} → 加權 ${weighted.toFixed(1)} 人 ≈ ${effective} 人 → 保障項 +${score} 分${suffix}`;
}

function bindGuarantorPreviews() {
  document.querySelectorAll('.guarantor-row').forEach((row) => {
    const incomeInput = row.querySelector('.g-income');
    const debtInput = row.querySelector('.g-debt');
    const typeSelect = row.querySelector('.g-type');
    const incomePreview = row.querySelector('.g-income-preview');
    const debtPreview = row.querySelector('.g-debt-preview');
    const updateIncome = () => {
      incomePreview.innerText = formatAmount(
        parseFloat(incomeInput.value) || 0
      );
    };
    const updateDebt = () => {
      debtPreview.innerText = formatAmount(parseFloat(debtInput.value) || 0);
    };
    const updateType = () => {
      const isMember = typeSelect.value === 'member';
      const debtInput = row.querySelector('.g-debt');
      const debtPreview = row.querySelector('.g-debt-preview');
      const unknownCb = row.querySelector('.g-unknown');
      // 社員／非社員皆可手填債務月付；社員可填其在本社既有債務，非社員可填其社外債務
      // 債務不詳時維持 disabled（草稿還原後 bindGuarantorPreviews 呼叫此函式會被覆蓋）
      debtInput.disabled = !!(unknownCb && unknownCb.checked);
      debtInput.placeholder = isMember
        ? '該社員在本社的既有債務月付'
        : '該保證人之社外債務月付';
      debtPreview.innerText = formatAmount(parseFloat(debtInput.value) || 0);
    };
    incomeInput.addEventListener('input', updateIncome);
    debtInput.addEventListener('input', updateDebt);
    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        updateType();
        updateGuarantorWeightHint();
      });
    }
    // 債務不詳 checkbox：勾選時清空並 disable 債務欄；取消時還原
    const unknownCheckbox = row.querySelector('.g-unknown');
    if (unknownCheckbox) {
      const applyUnknown = () => {
        if (unknownCheckbox.checked) {
          debtInput.value = '';
          debtInput.disabled = true;
          debtPreview.innerText = '';
        } else {
          debtInput.disabled = false;
          if (typeSelect) {
            const isMember = typeSelect.value === 'member';
            debtInput.placeholder = isMember
              ? '該社員在本社的既有債務月付'
              : '該保證人之社外債務月付';
          }
        }
        updateGuarantorWeightHint();
        saveFormDraft();
      };
      unknownCheckbox.addEventListener('change', applyUnknown);
    }
    updateIncome();
    updateDebt();
    if (typeSelect) updateType();
  });
}

// ============================================================
// 即時股金 / 擔保品提示（B1：輸入時即時檢查，不需按計算才看）
// 從 DOM 直接取值；複用 renderDashboard 中的 hint 邏輯
// ============================================================
function updateShareHintLive() {
  const shareHint = $('shareHint');
  if (!shareHint) return;
  const shares = parseAmount('shares');
  if (shares <= 0) {
    shareHint.style.display = 'none';
    return;
  }
  const proposedLoan = parseAmount('loan');
  const collateral = $('collateral').value;
  const years = parseFloat($('years').value) || 0;
  const shareMult = shares > 0 ? proposedLoan / shares : null;

  let hintMsg = '';
  let hintType = '';
  let conflict = '';
  if (collateral === '12' && proposedLoan > shares) {
    conflict =
      '申請金額超過股金餘額，不符合「足額股金內借款」條件，請重新確認擔保品欄位。';
  } else if (collateral === '5' && proposedLoan > shares * 2) {
    conflict =
      '申請金額超過股金 2 倍，不符合「股金 2 倍內」條件，請重新確認擔保品欄位。';
  } else if (collateral === '0' && proposedLoan > 0 && proposedLoan <= shares) {
    conflict =
      '申請金額未超過股金，可能符合「足額股金內借款」，請確認擔保品欄位設定。';
  }
  if (conflict) {
    hintType = 'error';
    hintMsg = `擔保品設定矛盾：${conflict}`;
  } else if (collateral === '10') {
    hintType = 'info';
    hintMsg = `股金參考：申請額為股金的 ${shareMult !== null ? shareMult.toFixed(1) : '—'} 倍，擔保品為足額不動產，不受股金倍數限制。`;
  } else if (proposedLoan > 0 && proposedLoan <= shares) {
    hintType = 'success';
    hintMsg = '股金確認：申請金額未超過股金餘額，符合「足額股金內借款」條件。';
  } else if (proposedLoan > 0 && proposedLoan <= shares * 2) {
    hintType = 'warn';
    hintMsg = `股金確認：申請金額為股金的 ${shareMult.toFixed(1)} 倍，屬「股金 2 倍內」範圍。`;
  } else if (proposedLoan > 0) {
    hintType = 'error';
    hintMsg = `股金確認：申請金額已超過股金的 2 倍（目前 ${shareMult.toFixed(1)} 倍），屬純信用借款，請確認擔保品設定。`;
  } else {
    hintType = 'info';
    hintMsg = '股金參考：請填入申請金額以檢查股金倍數。';
  }
  if (years > LONG_TERM_YEARS && collateral !== '10') {
    hintType = 'error';
    hintMsg = `貸款年限 ${years} 年超過 ${LONG_TERM_YEARS} 年，不得僅以股金或信用方式辦理，須改為足額不動產抵押。`;
  }
  shareHint.className = `hint hint-${hintType}`;
  shareHint.innerText = hintMsg;
  shareHint.style.display = 'block';
}

function updateCollateralByYears() {
  const yearsVal = parseInt($('years').value) || 0;
  const collateralEl = $('collateral');
  const lockMsg = $('collateralLockMsg');
  for (let i = 0; i < collateralEl.options.length; i++) {
    collateralEl.options[i].disabled =
      yearsVal > LONG_TERM_YEARS && collateralEl.options[i].value !== '10';
  }
  if (yearsVal > LONG_TERM_YEARS) {
    if (collateralEl.value !== '10') {
      collateralEl.value = '10';
    }
    // 系統依法規強制指定，等同已確認，不該再標「未確認」
    markSelectTouched(collateralEl);
    lockMsg.style.display = 'block';
  } else {
    lockMsg.style.display = 'none';
  }
  // 擔保放款一般上限 20 年，屋齡 20 年內自用住宅放寬至 30 年；>30 由法規否決擋下
  const yearsHint = $('yearsHint');
  if (yearsHint) {
    yearsHint.style.display =
      yearsVal > SECURED_YEARS_STANDARD && yearsVal <= MAX_SECURED_YEARS
        ? 'block'
        : 'none';
  }
  // 顯示/隱藏擔保放款相關欄位
  const isSecuredLoan = collateralEl.value === '10';
  const appraisalGroup = $('collateralAppraisalGroup');
  const zoneGroup = $('collateralZoneGroup');
  const houseAgeGroup = $('houseAgeGroup');
  const appraisalAgeGroup = $('appraisalAgeGroup');
  if (isSecuredLoan) {
    appraisalGroup.style.display = 'block';
    zoneGroup.style.display = 'block';
    houseAgeGroup.style.display = 'block';
    appraisalAgeGroup.style.display = 'block';
  } else {
    appraisalGroup.style.display = 'none';
    zoneGroup.style.display = 'none';
    houseAgeGroup.style.display = 'none';
    appraisalAgeGroup.style.display = 'none';
  }
}

// ============================================================
// UI 渲染
// ============================================================
function animateScore(targetScore) {
  const scoreValEl = $('gaugeScoreVal');
  if (!scoreValEl) return;
  if (navigator.webdriver) {
    scoreValEl.textContent = String(targetScore);
    return;
  }
  const start = 0;
  const duration = 1200; // 1.2s to match the SVG circle transition
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(start + (targetScore - start) * easeProgress);
    scoreValEl.textContent = String(current);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

// ============================================================
// 結論條（A/B/C 三級分流純屬顯示，額度一律採系統原始輸出）
// ============================================================

// 系統 A~E 五級 → 社內作業三級。對應《社員信用評級落地評估》第二節映射表。
const TRIAGE_MAP = {
  A: { tag: 'A 級', text: '快速審核核貸流程，額度較具彈性' },
  B: { tag: 'B 級', text: '標準對保審核流程，定期追蹤還款紀錄' },
  C: { tag: 'B 級', text: '標準對保審核流程，定期追蹤還款紀錄' },
  D: {
    tag: 'C 級',
    text: '嚴謹對保、補強連帶保證人或實體擔保品，並經第二位審核人覆核簽章',
  },
  E: {
    tag: 'C 級',
    text: '嚴謹對保、補強連帶保證人或實體擔保品，並經第二位審核人覆核簽章',
  },
};
const TRIAGE_VETOED = {
  tag: 'C 級',
  text: '案件已遭否決，一律列入 C 級優先列管；如仍要送件須經第二位審核人覆核簽章',
};

function renderVerdictBar(result) {
  const { grade, scoreDetail, maxLoanLimit, postLoanDti, maxDti, isVetoed } =
    result;
  const bar = $('verdictBar');
  if (!bar) return;

  $('verdictText').innerText = result.sealText;
  $('resGrade').innerText = grade;
  $('verdictScore').innerText = String(
    Math.max(0, Math.min(100, scoreDetail.total))
  );
  $('resLimit').innerText = Math.round(maxLoanLimit).toLocaleString('zh-TW');
  $('resTotalDti').innerText = (postLoanDti * 100).toFixed(1);
  $('resMaxDtiTxt').innerText = maxDti * 100;

  bar.classList.remove('verdict-pass', 'verdict-warn', 'verdict-fail');
  bar.classList.add(`verdict-${result.sealType}`);

  const triage = isVetoed ? TRIAGE_VETOED : TRIAGE_MAP[grade] || TRIAGE_VETOED;
  $('verdictTriage').innerHTML =
    `建議流程：<span class="triage-tag">${escapeHtml(triage.tag)}</span>${escapeHtml(triage.text)}`;

  // 未確認提醒：9 個評分下拉若還維持系統預設值，分數會偏樂觀
  const untouched = getUntouchedSelects();
  const note = $('verdictUnconfirmed');
  if (untouched.length > 0) {
    note.innerText = `⚠️ 本次評分有 ${untouched.length} 項評估選項（${untouched
      .map((el) => el.dataset.scoreLabel || el.id)
      .join('、')}）維持系統預設值，請確認是否符合實際情況。`;
    note.classList.add('show');
  } else {
    note.classList.remove('show');
  }
}

function renderDashboard(result) {
  $('resultCard').style.display = 'block';
  $('btnPrint').style.display = 'block';
  $('resultCard').offsetHeight; // Force layout reflow for transitions

  const {
    input,
    scoreDetail,
    isVetoed,
    vetoes,
    grade,
    maxDti,
    postLoanDti,
    totalExposure,
    shareMult,
    statusText,
  } = result;

  // 顯示數字與指針一致 clamp 0–100（總分理論值可能因扣分為負）
  const scoreClamped = Math.max(0, Math.min(100, scoreDetail.total));
  animateScore(scoreClamped);
  // SVG gauge 填色與進度
  const gaugeEl = $('gaugeFill');
  const gaugeCircumference = 2 * Math.PI * 58; // ≈ 364.4
  const gaugeOffset = gaugeCircumference * (1 - scoreClamped / 100);
  gaugeEl.setAttribute('stroke-dasharray', String(gaugeCircumference));
  gaugeEl.setAttribute('stroke-dashoffset', String(gaugeOffset));
  const gradeColors = {
    A: '#2e7d32',
    B: '#00695c',
    C: '#e65100',
    D: '#bf360c',
    E: '#c62828',
  };
  gaugeEl.setAttribute('stroke', gradeColors[grade] || '#1a237e');

  // 結論條（#resGrade / #resLimit / #resTotalDti / #resMaxDtiTxt 都住在裡面）
  renderVerdictBar(result);

  $('resTotalDti2').innerText = (postLoanDti * 100).toFixed(1);
  $('resMaxDtiTxt3').innerText = maxDti * 100;
  $('resMaxDtiTxt2').innerText = maxDti * 100;
  $('resShareMult').innerText = shareMult !== null ? shareMult.toFixed(1) : '—';
  $('resTotalExposure').innerText = totalExposure.toLocaleString('zh-TW');
  // [FIX 2.1] 加上 age > 0 判斷，避免 0 / 負數年齡誤觸發未成年人警告
  $('minorWarn').style.display =
    input.age > 0 && input.age < 18 && !isVetoed ? 'block' : 'none';

  // 股金 / 擔保品提示（[FIX 6.3] 改用 CSS class）
  const shareHint = $('shareHint');
  if (input.shares > 0) {
    let hintMsg = '';
    let hintType = '';
    let conflict = '';
    if (input.collateral === '12' && input.proposedLoan > input.shares) {
      conflict =
        '申請金額超過股金餘額，不符合「足額股金內借款」條件，請重新確認擔保品欄位。';
    } else if (
      input.collateral === '5' &&
      input.proposedLoan > input.shares * 2
    ) {
      conflict =
        '申請金額超過股金 2 倍，不符合「股金 2 倍內」條件，請重新確認擔保品欄位。';
    } else if (input.collateral === '0' && input.proposedLoan <= input.shares) {
      conflict =
        '申請金額未超過股金，可能符合「足額股金內借款」，請確認擔保品欄位設定。';
    }
    if (conflict) {
      hintType = 'error';
      hintMsg = `擔保品設定矛盾：${conflict}`;
    } else if (input.collateral === '10') {
      hintType = 'info';
      hintMsg = `股金參考：申請額為股金的 ${shareMult !== null ? shareMult.toFixed(1) : '—'} 倍，擔保品為足額不動產，不受股金倍數限制。`;
    } else if (input.proposedLoan <= input.shares) {
      hintType = 'success';
      hintMsg =
        '股金確認：申請金額未超過股金餘額，符合「足額股金內借款」條件。';
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
    ['bd_ability', scoreDetail.dsrScore + scoreDetail.stability, 35],
    ['bd_credit', scoreDetail.peopleScore, 25],
    ['bd_protection', scoreDetail.protectionScore, 20],
    ['bd_purpose', scoreDetail.purposeScore, 10],
    ['bd_perspective', scoreDetail.perspectiveScore, 10],
  ];
  breakdown.forEach(([id, val, max]) => {
    const pct = Math.max(0, Math.min(100, (val / max) * 100)); // peopleScore 可為負，bar 寬 clamp 0
    $(id).style.width = pct + '%';
    $(id + '_val').textContent = val;
  });
  const bdAge = $('bd_age_val');
  bdAge.textContent =
    scoreDetail.ageScore === 0 ? '—' : `${scoreDetail.ageScore} 分`;
  bdAge.classList.toggle('neg', scoreDetail.ageScore < 0);

  // 狀態訊息（[FIX 1.3] 否決清單以 <ul> 累積呈現）
  const statusEl = $('resStatus');
  statusEl.className = 'status-msg';
  if (isVetoed) {
    statusEl.innerHTML = `🚫 系統判定：不予核貸<ul class="veto-list">${vetoes.map((v) => `<li>${v}</li>`).join('')}</ul>`;
    statusEl.classList.add('status-fail');
  } else if (grade === 'E') {
    statusEl.innerHTML = '⚠️ 評分不足 60 分，請專職/幹部審慎評估';
    statusEl.classList.add('status-fail');
  } else if (postLoanDti > maxDti) {
    statusEl.innerHTML = `❌ 額度超限：預計月負擔 (${(postLoanDti * 100).toFixed(1)}%) 超過本級上限 (${(maxDti * 100).toFixed(0)}%)`;
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
    if (ratio < 0.7) progressFill.style.backgroundColor = '#4caf50';
    else if (ratio <= 1.0) progressFill.style.backgroundColor = '#ffeb3b';
    else progressFill.style.backgroundColor = '#f44336';
  }
  // [FIX 5.3] E 級隱藏 marker
  const markerEl = $('progressLimit');
  if (maxDti > 0) {
    markerEl.classList.remove('hidden');
    markerEl.style.left = maxDti * 100 + '%';
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
  sealEl.classList.remove(
    'system-seal-pass',
    'system-seal-fail',
    'system-seal-warn'
  );
  sealEl.classList.add(`system-seal-${result.sealType}`);

  // 保證人「債務不詳」警示
  const unknownWarn = $('unknownGuarantorWarn');
  if (unknownWarn) {
    const unknownCount = (input.guarantors || []).filter(
      (g) => g.unknown
    ).length;
    if (unknownCount > 0) {
      $('unknownGuarantorCount').innerText = String(unknownCount);
      unknownWarn.style.display = 'block';
    } else {
      unknownWarn.style.display = 'none';
    }
  }

  // 顯示建議增貸額度
  if (result.suggestedLoan) {
    const suggested = result.suggestedLoan;
    let html = '';
    if (suggested.general > 0) {
      html += `一般增貸額度：${formatAmount(suggested.general)} (月付約 ${pmt(suggested.general, input.ratePercent, input.years).toFixed(0)} 元)<br>`;
    }
    if (suggested.consolidation > 0 && input.consolidationMode) {
      html += `整併現有貸款後可貸額度：${formatAmount(suggested.consolidation)} (月付約 ${pmt(suggested.consolidation, input.ratePercent, input.years).toFixed(0)} 元)<br>`;
    }
    if (html) {
      $('suggestedLoanText').innerHTML = html;
      $('suggestedLoanBox').style.display = 'block';
    } else {
      if (isVetoed) {
        $('suggestedLoanText').innerHTML =
          '<span class="status-warn">⚠️ 案件已被否決，無建議額度</span>';
        $('suggestedLoanBox').style.display = 'block';
      } else if (grade === 'E') {
        $('suggestedLoanText').innerHTML =
          '<span class="status-warn">⚠️ 評分等級 E 無建議額度，請提升評分後重新試算</span>';
        $('suggestedLoanBox').style.display = 'block';
      } else {
        $('suggestedLoanBox').style.display = 'none';
      }
    }
  } else {
    $('suggestedLoanBox').style.display = 'none';
  }

  // 顯示整併貸款試算
  if (result.consolidationScenario && input.consolidationMode) {
    const cs = result.consolidationScenario;
    let html = `現狀月付：${formatAmount(cs.currentTotalMonthly)}<br>`;
    html += `整併後月付：${formatAmount(cs.consolidationMonthly)}<br>`;
    let savingsText =
      cs.monthlySavings === 0
        ? '0 元'
        : (cs.monthlySavings > 0 ? '+ ' : '- ') +
          formatAmount(Math.abs(cs.monthlySavings));
    html += `月省/增：<span class="${cs.monthlySavings >= 0 ? 'status-pass' : 'status-warn'}">${savingsText}</span><br>`;
    html += `整併後貸款金額：${formatAmount(cs.consolidationLoanAmount)}<br>`;
    html += `整併後總借款餘額：${formatAmount(cs.totalExposure)}<br>`;
    html += `<span style="font-size: 11px; color: #666; display: inline-block; margin-top: 5px;">* 註：基準 債務比率(DSR)評分係以整併前現況月付金計算；本試算僅供整併效益評估參考。</span>`;
    $('consolidationText').innerHTML = html;
    $('consolidationBox').style.display = 'block';
  } else {
    $('consolidationBox').style.display = 'none';
  }

  // === 決策說明強化（獨立 try/catch，不影響既有功能）===
  try {
    renderRadarChart(scoreDetail, grade);
  } catch (e) {
    console.warn('雷達圖跳過', e);
  }

  try {
    renderStrengthsWeaknesses(scoreDetail);
  } catch (e) {
    console.warn('強弱項跳過', e);
  }

  try {
    renderSuggestions(scoreDetail, input, isVetoed, grade, vetoes);
  } catch (e) {
    console.warn('改善建議跳過', e);
  }

  // 顯示 insightCard（至少一個 sub-section 有內容才顯示）
  const insightCard = document.getElementById('insightCard');
  if (insightCard) {
    const hasContent =
      (
        (document.getElementById('strengthWeaknessArea') &&
          document.getElementById('strengthWeaknessArea').innerHTML) ||
        ''
      ).trim() ||
      (
        (document.getElementById('suggestionArea') &&
          document.getElementById('suggestionArea').innerHTML) ||
        ''
      ).trim();
    insightCard.style.display = hasContent ? 'block' : 'none';
  }

  $('resultCard').style.display = 'block';
  $('btnPrint').style.display = 'block';
  $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 決策說明強化輔助函式
function renderRadarChart(scoreDetail, grade) {
  try {
    const container = document.getElementById('radarChartContainer');
    if (!container) return;
    const svg = document.getElementById('radarSvg');
    if (!svg) return;

    // Clear svg
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const cx = 120;
    const cy = 120;
    const R_MAX = 80;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const createSvgElement = (tag, attrs = {}) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [key, val] of Object.entries(attrs)) {
        el.setAttribute(key, val);
      }
      return el;
    };

    const getCoords = (index, radius) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        angle: angle,
      };
    };

    const dimensions = [
      {
        label: '還款能力',
        score: scoreDetail.dsrScore + scoreDetail.stability,
        max: 35,
      },
      { label: '借款人信用', score: scoreDetail.peopleScore, max: 25 },
      { label: '債權保障', score: scoreDetail.protectionScore, max: 20 },
      { label: '資金用途', score: scoreDetail.purposeScore, max: 10 },
      { label: '未來展望', score: scoreDetail.perspectiveScore, max: 10 },
    ];

    // Draw background grid pentagons (25%, 50%, 75%, 100%)
    const gridLevels = [20, 40, 60, 80];
    gridLevels.forEach((rLevel) => {
      const points = Array.from({ length: 5 }, (_, idx) => {
        const c = getCoords(idx, rLevel);
        return `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
      }).join(' ');

      const isOuter = rLevel === 80;
      const poly = createSvgElement('polygon', {
        points: points,
        fill: 'none',
        stroke: isOuter ? '#cbd5e1' : '#e2e8f0',
        'stroke-width': '1',
        'stroke-dasharray': isOuter ? 'none' : '3,3',
      });
      svg.appendChild(poly);
    });

    // Draw 5 axes lines
    for (let i = 0; i < 5; i++) {
      const c = getCoords(i, R_MAX);
      const line = createSvgElement('line', {
        x1: cx,
        y1: cy,
        x2: c.x.toFixed(1),
        y2: c.y.toFixed(1),
        stroke: '#cbd5e1',
        'stroke-width': '1',
      });
      svg.appendChild(line);
    }

    // Draw labels & scores
    dimensions.forEach((dim, idx) => {
      const labelRadius = 96;
      const coords = getCoords(idx, labelRadius);
      const angle = coords.angle;

      let anchor = 'middle';
      let dy1 = '0.35em';
      const cosVal = Math.cos(angle);
      const sinVal = Math.sin(angle);

      if (Math.abs(cosVal) < 0.1) {
        anchor = 'middle';
        dy1 = sinVal < 0 ? '-0.5em' : '1.1em';
      } else if (cosVal > 0) {
        anchor = 'start';
        dy1 = sinVal < 0 ? '-0.1em' : '0.7em';
      } else {
        anchor = 'end';
        dy1 = sinVal < 0 ? '-0.1em' : '0.7em';
      }

      const textNode = createSvgElement('text', {
        x: coords.x.toFixed(1),
        y: coords.y.toFixed(1),
        'text-anchor': anchor,
        'font-size': '10.5',
        'font-weight': '600',
        fill: '#334155',
        style: 'font-family: inherit;',
      });

      const tspanLabel = createSvgElement('tspan', {
        x: coords.x.toFixed(1),
        dy: dy1,
      });
      tspanLabel.textContent = dim.label;

      const tspanScore = createSvgElement('tspan', {
        x: coords.x.toFixed(1),
        dy: '1.2em',
        'font-size': '9.5',
        'font-weight': 'normal',
        fill: '#64748b',
      });
      tspanScore.textContent = `${dim.score}/${dim.max}`;

      textNode.appendChild(tspanLabel);
      textNode.appendChild(tspanScore);
      svg.appendChild(textNode);
    });

    // Draw value polygon
    const GRADE_COLORS = {
      A: '#2e7d32',
      B: '#00695c',
      C: '#e65100',
      D: '#bf360c',
      E: '#c62828',
    };
    const color = GRADE_COLORS[grade] || '#2e7d32';

    const valPoints = dimensions
      .map((dim, idx) => {
        const pct = Math.min(100, Math.max(0, (dim.score / dim.max) * 100));
        const rVal = (pct / 100) * R_MAX;
        const c = getCoords(idx, rVal);
        return `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
      })
      .join(' ');

    const valPoly = createSvgElement('polygon', {
      points: valPoints,
      fill: color + '22', // transparent fill (approx 13% opacity)
      stroke: color,
      'stroke-width': '2',
    });
    svg.appendChild(valPoly);

    // Draw small circles at value vertices
    dimensions.forEach((dim, idx) => {
      const pct = Math.min(100, Math.max(0, (dim.score / dim.max) * 100));
      const rVal = (pct / 100) * R_MAX;
      const c = getCoords(idx, rVal);
      const circle = createSvgElement('circle', {
        cx: c.x.toFixed(1),
        cy: c.y.toFixed(1),
        r: '3.5',
        fill: color,
        stroke: '#ffffff',
        'stroke-width': '1',
      });
      svg.appendChild(circle);
    });

    // Set legend text
    const legend = document.getElementById('radarLegend');
    if (legend) {
      legend.textContent = `5P 面向達成率示意圖（等級 ${grade || '-'}）`;
    }

    container.style.display = 'block';
  } catch (e) {
    console.warn('雷達圖渲染失敗', e);
  }
}

function renderStrengthsWeaknesses(scoreDetail) {
  try {
    const area = document.getElementById('strengthWeaknessArea');
    if (!area) return;

    const dimensions = [
      {
        key: '還款能力',
        score: scoreDetail.dsrScore + scoreDetail.stability,
        max: 35,
      },
      { key: '借款人信用', score: scoreDetail.peopleScore, max: 25 },
      { key: '債權保障', score: scoreDetail.protectionScore, max: 20 },
      { key: '資金用途', score: scoreDetail.purposeScore, max: 10 },
      { key: '未來展望', score: scoreDetail.perspectiveScore, max: 10 },
    ];

    const list = dimensions.map((d) => ({
      ...d,
      pct: d.score / d.max,
    }));

    // Sort to find highest and lowest
    list.sort((a, b) => b.pct - a.pct);

    const highest = list[0];
    const lowest = list[list.length - 1];

    let html = '';

    // Strong point
    html += `
      <div class="sw-row sw-strength">
        <span class="sw-badge">↑ 強項</span>
        <span>${highest.key}：${highest.score}/${highest.max}（${Math.round(highest.pct * 100)}%）</span>
      </div>
    `;

    // Weak point
    html += `
      <div class="sw-row sw-weakness">
        <span class="sw-badge">↓ 待加強</span>
        <span>${lowest.key}：${lowest.score}/${lowest.max}（${Math.round(lowest.pct * 100)}%）</span>
      </div>
    `;

    // Age adjustment
    if (scoreDetail.ageScore !== 0) {
      const ageVal = parseInt(document.getElementById('age').value) || 0;
      const yearsVal = parseInt(document.getElementById('years').value) || 0;
      const ageAtMaturity = ageVal + yearsVal;
      html += `
        <div class="sw-row sw-weakness">
          <span class="sw-badge">↓ 待加強</span>
          <span>年齡調整：${scoreDetail.ageScore} 分（還款到期 ${ageAtMaturity} 歲）</span>
        </div>
      `;
    }

    area.innerHTML = html;
  } catch (e) {
    console.warn('強弱項渲染失敗', e);
  }
}

function renderSuggestions(scoreDetail, input, isVetoed, grade, vetoes) {
  try {
    const area = document.getElementById('suggestionArea');
    if (!area) return;

    let list = [];

    if (isVetoed) {
      const rawVetoes = vetoes || [];
      rawVetoes.forEach((veto) => {
        let text = '';
        if (veto.includes('負債比') || veto.includes('DTI')) {
          text =
            '若要過件，須降低申貸金額或增加借款人月收入，以降低核貸後總負債比至 70% 以下';
        } else if (veto.includes('未成年')) {
          text = '若要過件，未成年借款額度須調降至股金餘額以內';
        } else if (
          veto.includes('信用借款總額') ||
          veto.includes('信用借款法定上限')
        ) {
          text =
            '若要過件，信用借款額度須調降至股金 + 100 萬以下，或提供足額不動產擔保';
        } else if (veto.includes('自然人放款')) {
          text = '若要過件，申請金額須調降至自然人放款上限（1,000 萬元）以內';
        } else if (veto.includes('不動產抵押為擔保')) {
          text =
            '若要過件，年限超過 7 年須提供足額不動產擔保，或將年限縮減至 7 年以下';
        } else if (
          veto.includes('最長期限 30 年') ||
          veto.includes('超過最長期限')
        ) {
          text = '若要過件，貸款年限不得超過 30 年，須縮減年限';
        } else if (
          veto.includes('足額股金內借款') &&
          veto.includes('不得超過股金餘額')
        ) {
          text =
            '若要過件，足額股金內借款之申請金額不得超過股金餘額，或將擔保品改為信用或不動產';
        } else if (veto.includes('聯徵')) {
          text = '若要過件，須釐清並排除聯徵紀錄之嚴重瑕疵（拒絕往來或強執）';
        } else if (veto.includes('資金用途')) {
          text = '若要過件，資金用途須具正當性，避免高風險或投機用途';
        } else if (veto.includes('到期年齡') && veto.includes('超過 75')) {
          text = '若要過件，還款到期年齡不得超過 75 歲，須縮短年限或更換借款人';
        } else if (veto.includes('成數(LTV)')) {
          text =
            '若要過件，擔保放款金額不得超過鑑估價值之法定成數上限，須調降申貸金額或提高鑑估值';
        } else if (veto.includes('屋齡') && veto.includes('年限上限')) {
          text =
            '若要過件，屋齡超過 20 年之擔保放款年限上限為 20 年，須縮短貸款年限';
        } else if (veto.includes('鑑價報告已逾')) {
          text = '若要過件，擔保品鑑價報告已逾 10 年，須重新辦理鑑價';
        } else {
          text = `若要過件，須改善此法規限制：${veto}`;
        }
        list.push({ text, gain: null });
      });
    } else {
      if (grade === 'E') {
        list.push({
          text: '總分低於 60，最快提升方式為降低負債比或增加保障',
          gain: null,
        });
      }

      const baselineDsr = scoreDetail.dsr;
      const dsrScore = scoreDetail.dsrScore;
      const stability = scoreDetail.stability;
      const guarantorCount = input.guarantorCount;
      const collateral = input.collateral;
      const membership = input.membership;
      const interaction = input.interaction;
      const perspectiveScore = scoreDetail.perspectiveScore;
      const ageAtMaturity = input.age + input.years;
      const incomeStability = input.incomeStability;
      const purposeScore = scoreDetail.purposeScore;

      let candidates = [];

      // 3. baselineDsr >= 0.5 (dsrScore <= 10)
      if (baselineDsr >= 0.5) {
        candidates.push({
          text: `降低負債比（目前 ${(baselineDsr * 100).toFixed(1)}%），若能降至 50% 以下可 +13 分`,
          gain: 13,
        });
      }
      // 4. baselineDsr >= 0.4 (dsrScore <= 16)
      if (baselineDsr >= 0.4) {
        candidates.push({
          text: `降低負債比（目前 ${(baselineDsr * 100).toFixed(1)}%），若能降至 40% 以下可 +20 分`,
          gain: 20,
        });
      }
      // 5. (dsrScore + stability) < 25
      if (dsrScore + stability < 25) {
        candidates.push({
          text: '提升收入穩定性或降低既有債務可提高還款能力',
          gain: 10,
        });
      }
      // 6. guarantorCount === 0
      if (guarantorCount === 0) {
        candidates.push({
          text: '增加一位保證人可獲得 +3 分保障加分',
          gain: 3,
        });
      }
      // 7. guarantorCount > 0 && guarantorCount < 5
      if (guarantorCount > 0 && guarantorCount < 5) {
        const potentialProtectionGain = Math.max(
          1,
          20 - scoreDetail.protectionScore
        );
        candidates.push({
          text: `增加保證人數或改為社員保證人可提高保障分數（最高 +${potentialProtectionGain} 分）`,
          gain: potentialProtectionGain,
        });
      }
      // 8. collateral === '0'
      if (collateral === '0') {
        candidates.push({
          text: '提供擔保品（不動產抵押或股金內借款）最高可獲 +12 分',
          gain: 12,
        });
      }
      // 9. collateral === '5'
      if (collateral === '5') {
        candidates.push({
          text: '以股金或足額不動產設定最高可獲 +12 分（目前 +5）',
          gain: 7,
        });
      }
      // 10. membership < 5
      if (membership < 5) {
        candidates.push({
          text: '長期穩定儲蓄（5 年以上）可提升社員往來評分',
          gain: 3,
        });
      }
      // 11. interaction < 10
      if (interaction < 10) {
        candidates.push({
          text: '增加與社內互動往來（如經常性儲蓄）可提升信用評分',
          gain: 5,
        });
      }
      // 12. perspectiveScore < 8
      if (perspectiveScore < 8) {
        candidates.push({
          text: '穩定職業發展與社內參與有助提升未來展望評分',
          gain: 4,
        });
      }
      // 13. ageAtMaturity > 65
      if (ageAtMaturity > 65) {
        const agePenaltyAbs = Math.abs(scoreDetail.ageScore);
        if (agePenaltyAbs > 0) {
          candidates.push({
            text: `縮短貸款年限（目前到期 ${ageAtMaturity} 歲）可避免年齡扣分`,
            gain: agePenaltyAbs,
          });
        }
      }
      // 14. incomeStability < 9
      if (incomeStability < 9) {
        candidates.push({
          text: '提升收入穩定性可提高還款能力評分',
          gain: 5,
        });
      }
      // 15. purposeScore < 8
      if (purposeScore < 8) {
        candidates.push({
          text: '選擇正當資金用途可獲得更高評分',
          gain: 4,
        });
      }

      // Sort candidates by gain descending
      candidates.sort((a, b) => b.gain - a.gain);

      if (grade === 'E') {
        const topCandidates = candidates.slice(0, 2);
        list = list.concat(topCandidates);
      } else {
        list = candidates.slice(0, 3);
      }
    }

    // Build HTML
    let html = '';
    if (list.length > 0) {
      list.forEach((s) => {
        html += `
          <div class="suggestion-item">
            <span class="suggestion-icon">💡</span>
            <span class="suggestion-text">${s.text}</span>
            ${s.gain !== null && s.gain !== undefined ? `<span class="suggestion-gain">+${s.gain} 分*</span>` : ''}
          </div>
        `;
      });
      const hasGain = list.some((s) => s.gain !== null && s.gain !== undefined);
      if (hasGain) {
        html += `<div class="suggestion-disclaimer">* 實際加分依整體狀況而定</div>`;
      }
    }

    area.innerHTML = html;
  } catch (e) {
    console.warn('改善建議渲染失敗', e);
  }
}

function renderPrintReport(result) {
  const {
    input,
    scoreDetail,
    isVetoed,
    vetoes,
    grade,
    maxDti,
    maxLoanLimit,
    postLoanDti,
    totalExposure,
    shareMult,
    ageAtMaturity,
    statusText,
  } = result;

  // [FIX 3.3] 報表 ID 改為序號制
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const seq = getReportSeq();
  $('reportId').innerText = `CU-${ymd}-${String(seq).padStart(4, '0')}`;
  $('printDate').innerText = today.toLocaleString('zh-TW');
  $('printAppDate').innerText = input.appDate || '—';

  // [FIX 3.2] 案件基本資訊
  $('p_memberId').innerText = input.memberId || '—';
  $('p_income').innerText = input.income.toLocaleString('zh-TW') + ' 元';
  $('p_existing').innerText =
    input.existingDebt.toLocaleString('zh-TW') + ' 元';
  $('p_internal').innerText =
    `${input.internalMonthly.toLocaleString('zh-TW')} 元 / 餘額 ${input.internalBalance.toLocaleString('zh-TW')} 元（在本社借款總金額：${totalExposure.toLocaleString('zh-TW')} 元）`;
  $('p_loan_details').innerText =
    `${input.proposedLoan.toLocaleString('zh-TW')} 元 / ${input.years} 年 / ${input.ratePercent}% （借款人現齡 ${input.age} 歲，還款到期年齡 ${ageAtMaturity} 歲）`;
  $('p_shares_info').innerText =
    input.shares > 0
      ? `${input.shares.toLocaleString('zh-TW')} 元 / 倍數 ${shareMult.toFixed(1)} 倍`
      : '未填寫';

  // 擔保品鑑估資訊（僅擔保放款 collateral=10 時顯示）
  const collateralDetailRow = $('p_collateral_detail_row');
  if (collateralDetailRow) {
    if (input.collateral === '10') {
      const appraisal = input.appraisalValue || 0;
      const zone = input.collateralZone || 'other';
      const ltvPct = (LTV_RATIOS[zone] || LTV_RATIOS.other) * 100;
      const ltvCeiling = Math.floor(
        appraisal * (LTV_RATIOS[zone] || LTV_RATIOS.other)
      );
      const zoneText =
        zone === 'residential_commercial_educational'
          ? '住宅/商業/文教區'
          : '其他區段';
      $('p_collateral_detail').innerText =
        `鑑估價值 ${appraisal.toLocaleString('zh-TW')} 元 / ${zoneText} / 貸款成數(LTV) ${ltvPct}% / 上限 ${ltvCeiling.toLocaleString('zh-TW')} 元` +
        `（屋齡 ${input.houseAge || 0} 年 / 鑑價報告 ${input.appraisalAge || 0} 年）`;
      collateralDetailRow.style.display = '';
    } else {
      collateralDetailRow.style.display = 'none';
    }
  }

  // 整併資訊（僅在整併模式且有第二筆資料時顯示於案件基本資料表）
  const consolidationRow = $('p_consolidation_row');
  if (consolidationRow) {
    if (
      result.consolidationScenario &&
      input.consolidationMode &&
      (input.internalMonthly2 > 0 || input.internalBalance2 > 0)
    ) {
      const cs = result.consolidationScenario;
      const savingsVal = cs.monthlySavings;
      const savingsStr =
        savingsVal === 0 ? '0 元' : formatAmount(Math.abs(savingsVal));
      $('p_consolidation_info').innerText =
        `現狀月付 ${formatAmount(cs.currentTotalMonthly)} / 整併後月付 ${formatAmount(cs.consolidationMonthly)} / ` +
        `月${savingsVal >= 0 ? '省' : '增'} ${savingsStr}`;
      consolidationRow.style.display = '';
    } else {
      consolidationRow.style.display = 'none';
    }
  }

  // [FIX 1.8] 5P 明細使用語意化 ID
  // 取 select 顯示文字；若 value 不在 options（草稿值與當前選項不符）則回退為 '—'
  const selText = (id) => {
    const el = $(id);
    if (!el || el.selectedIndex < 0) return '—';
    const opt = el.options[el.selectedIndex];
    return opt ? opt.text : '—';
  };
  const stabText = selText('incomeStability');
  const tenText = selText('tenure');
  $('p_stability').innerText = stabText + ' / ' + tenText;
  $('p_interaction').innerText = selText('interaction');
  $('p_jcic').innerText = selText('jcic');
  $('p_collateral').innerText = selText('collateral');
  if (input.guarantors && input.guarantors.length > 0) {
    let html =
      '<table class="print-table" style="margin-top:5px;"><tr><th>保證人</th><th>月收入</th><th>既有債務月付</th><th>債務比率(DSR)</th></tr>';
    let unknownCount = 0;
    input.guarantors.forEach((g) => {
      const isUnknown = !!g.unknown;
      if (isUnknown) unknownCount++;
      const dsrCell = isUnknown
        ? '— <span style="color:#d32f2f;">(債務未查證)</span>'
        : g.income > 0
          ? ((g.debt / g.income) * 100).toFixed(1) + '%'
          : '—';
      const debtCell = isUnknown
        ? '<span style="color:#d32f2f;">未查證</span>'
        : g.debt.toLocaleString('zh-TW') + ' 元';
      html +=
        '<tr><td>' +
        (escapeHtml(g.name) || '—') +
        (isUnknown ? ' <span style="color:#d32f2f;">(債務未查證)</span>' : '') +
        '</td><td>' +
        g.income.toLocaleString('zh-TW') +
        ' 元</td><td>' +
        debtCell +
        '</td><td>' +
        dsrCell +
        '</td></tr>';
    });
    html += '</table>';
    if (unknownCount > 0) {
      html +=
        '<div style="margin-top:6px; padding:6px; background:#fff3e0; border-left:3px solid #ff9800; font-size:12px;">' +
        '註：共 ' +
        unknownCount +
        ' 位保證人未揭露既有債務，已自保證人債務比率(DSR)計算排除；' +
        '實際核貸時請另覓佐證或要求保證人提供債務證明。' +
        '</div>';
    }
    $('p_guarantor_print').innerHTML = html;
  } else {
    $('p_guarantor_print').innerText = '無';
  }
  $('p_purpose').innerText = selText('purpose');
  $('p_career_print').innerText = selText('career');
  $('p_participation_print').innerText = selText('participation');

  // 5P 各面向分數
  $('p_score_ability').innerText = scoreDetail.dsrScore + scoreDetail.stability;
  $('p_score_credit').innerText = scoreDetail.peopleScore;
  $('p_score_protection').innerText = scoreDetail.protectionScore;
  $('p_score_purpose').innerText = scoreDetail.purposeScore;
  $('p_score_perspective').innerText = scoreDetail.perspectiveScore;
  $('p_score_age').innerText =
    scoreDetail.ageScore === 0
      ? `無（還款到期年齡 ${ageAtMaturity} 歲）`
      : `${scoreDetail.ageScore} 分（還款到期年齡 ${ageAtMaturity} 歲）`;

  // 評估結果
  $('p_grade').innerText = grade;
  $('p_score').innerText = Math.max(0, Math.min(100, scoreDetail.total));
  $('p_dti').innerText = (postLoanDti * 100).toFixed(1);
  $('p_maxdti').innerText = maxDti * 100;
  $('p_limit').innerText = Math.round(maxLoanLimit).toLocaleString('zh-TW');
  // [FIX 3.4] 列印狀態去 emoji
  $('p_status').innerText = stripEmoji(statusText);

  $('p_grade2').innerText = grade;
  $('p_maxdti2').innerText = maxDti * 100;

  // 列印建議增貸額度
  if (result.suggestedLoan) {
    const suggested = result.suggestedLoan;
    let html = '';
    if (suggested.general > 0) {
      html += `一般增貸額度：${formatAmount(suggested.general)} (月付約 ${pmt(suggested.general, input.ratePercent, input.years).toFixed(0)} 元)<br>`;
    }
    if (suggested.consolidation > 0 && input.consolidationMode) {
      html += `整併現有貸款後可貸額度：${formatAmount(suggested.consolidation)} (月付約 ${pmt(suggested.consolidation, input.ratePercent, input.years).toFixed(0)} 元)<br>`;
    }
    if (html) {
      $('p_suggested_loan').innerHTML = html;
      $('p_suggested_loan').style.display = 'block';
    } else {
      if (isVetoed) {
        $('p_suggested_loan').innerHTML = '案件已被否決，無建議額度';
        $('p_suggested_loan').style.display = 'block';
      } else if (grade === 'E') {
        $('p_suggested_loan').innerHTML =
          '評分等級 E 無建議額度，請提升評分後重新試算';
        $('p_suggested_loan').style.display = 'block';
      } else {
        $('p_suggested_loan').style.display = 'none';
      }
    }
  } else {
    $('p_suggested_loan').style.display = 'none';
  }

  // 列印整併貸款試算
  if (result.consolidationScenario && input.consolidationMode) {
    const cs = result.consolidationScenario;
    let html = `現狀月付：${formatAmount(cs.currentTotalMonthly)}<br>`;
    html += `整併後月付：${formatAmount(cs.consolidationMonthly)}<br>`;
    let savingsText =
      cs.monthlySavings === 0
        ? '0 元'
        : (cs.monthlySavings > 0 ? '+ ' : '- ') +
          formatAmount(Math.abs(cs.monthlySavings));
    html += `月省/增：${savingsText}<br>`;
    html += `整併後貸款金額：${formatAmount(cs.consolidationLoanAmount)}<br>`;
    html += `整併後總借款餘額：${formatAmount(cs.totalExposure)}`;
    $('p_consolidation_print').innerHTML = html;
    $('p_consolidation_print').style.display = 'block';
  } else {
    $('p_consolidation_print').style.display = 'none';
  }
}

// ============================================================
// 結果過期狀態管理
// ============================================================
let lastCalculatedAt = null;
let isResultStale = false;

function markResultStale() {
  const card = $('resultCard');
  // 初始隱藏來自 style.css 的 `.result-card { display: none }`，沒有 inline
  // style，用 card.style.display 判斷不到 → 首次計算前改欄位就會讓常駐在
  // 操作列的 #btnCalc 閃橘框說「結果已過期」，但根本還沒算過。
  if (!card || getComputedStyle(card).display === 'none' || isResultStale)
    return;
  isResultStale = true;
  card.classList.add('stale');
  $('btnCalc').classList.add('btn-stale');
  const banner = $('staleBanner');
  if (banner) banner.style.display = 'block';
  const ts = $('calcTimestamp');
  if (ts && lastCalculatedAt) {
    ts.textContent =
      '計算時間 ' + formatTime(lastCalculatedAt) + '（資料已變更）';
    ts.classList.add('stale');
  }
}

function clearResultStale() {
  isResultStale = false;
  $('resultCard').classList.remove('stale');
  $('btnCalc').classList.remove('btn-stale');
  const banner = $('staleBanner');
  if (banner) banner.style.display = 'none';
  const ts = $('calcTimestamp');
  if (ts) ts.classList.remove('stale');
}

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function setCalcLoading(loading) {
  const btn = $('btnCalc');
  // 只換 label，保留 .kbd-hint（舊版直接覆寫 innerHTML，第一次計算後
  // Ctrl+Enter 提示就永久消失了）
  const label = btn.querySelector('.btn-calc-label');
  if (loading) {
    btn.disabled = true;
    btn.classList.add('loading');
    if (label)
      label.innerHTML =
        '<span class="spinner" aria-hidden="true"></span>計算中…';
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    if (label) label.textContent = '開始授信評分';
  }
}

// ============================================================
// 主流程
// ============================================================
function calculateLoan() {
  setCalcLoading(true);
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
      if (firstEl)
        firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    clearAllFieldErrors();

    // 評分
    const scoreDetail = computeScore(input);

    // [FIX 1.3] 法規否決（累積所有觸發原因）
    const { vetoes, newLoanMonthlyPmt, postLoanDti } =
      applyRegulatoryVetoes(input);
    const isVetoed = vetoes.length > 0;

    // 等級
    const { grade, maxDti } = determineGrade(scoreDetail.total, isVetoed);

    // 可貸額度（[FIX 1.1] 用 PMT 公式反推）
    let maxLoanLimit = computeMaxLoan(input, maxDti);
    maxLoanLimit = applyLegalCeiling(input, maxLoanLimit);

    // 衍生變數
    const ageAtMaturity = input.age + input.years;
    const totalExposure =
      input.internalBalance + input.internalBalance2 + input.proposedLoan;
    const shareMult =
      input.shares > 0 ? input.proposedLoan / input.shares : null;

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
      statusText = `額度超限：預計月負擔 (${(postLoanDti * 100).toFixed(1)}%) 超過本級上限 (${(maxDti * 100).toFixed(0)}%)`;
      sealText = '額度超限';
      sealType = 'warn';
    } else {
      statusText = '信用良好且負擔合理，評分供專職/幹部裁量參考';
      sealText = '評分完成';
      sealType = 'pass';
    }

    // 計算建議增貸額度
    const suggestedLoan = computeSuggestedAdditionalLoan(
      input,
      maxDti,
      input.internalMonthly2,
      input.internalBalance2
    );

    // 計算整併貸款試算
    const consolidationScenario = computeConsolidationScenario(
      input,
      input.internalMonthly2,
      input.internalBalance2,
      input.internalYears2,
      input.internalRate2
    );

    const result = {
      input,
      scoreDetail,
      isVetoed,
      vetoes,
      grade,
      maxDti,
      maxLoanLimit,
      newLoanMonthlyPmt,
      postLoanDti,
      totalExposure,
      shareMult,
      ageAtMaturity,
      statusText,
      sealText,
      sealType,
      suggestedLoan,
      consolidationScenario,
    };

    renderDashboard(result);
    renderPrintReport(result);
    lastCalculatedAt = new Date();
    clearResultStale();
    const ts = $('calcTimestamp');
    if (ts) ts.textContent = '計算時間 ' + formatTime(lastCalculatedAt);
  } catch (e) {
    console.error('calculateLoan error:', e);
    alert('計算過程發生錯誤，請檢查輸入資料。\n' + e.message);
  } finally {
    setCalcLoading(false);
  }
}

// ============================================================
// 初始化
// ============================================================
const FORM_DRAFT_KEY = 'cu_form_draft';
const FORM_DRAFT_FIELDS = [
  'memberId',
  'appDate',
  'income',
  'age',
  'existing_debt',
  'internal_monthly',
  'internal_balance',
  'internal_monthly2',
  'internal_balance2',
  'internal_years2',
  'internal_rate2',
  'loan',
  'years',
  'rate',
  'shares',
  'incomeStability',
  'tenure',
  'interaction',
  'jcic',
  'membership',
  'collateral',
  'appraisalValue',
  'collateralZone',
  'houseAge',
  'appraisalAge',
  'guarantor_count',
  'purpose',
  'career',
  'participation',
];

function saveFormDraft() {
  try {
    const data = {};
    FORM_DRAFT_FIELDS.forEach((id) => {
      const el = $(id);
      if (el) data[id] = el.value;
    });
    // 整併模式 checkbox（value 無法反映 checked 狀態，需另存）
    const cm = $('consolidationMode');
    if (cm) data._consolidationMode = cm.checked;
    // 保證人動態欄位
    const guarantors = Array.from(
      document.querySelectorAll('.guarantor-row')
    ).map((row) => ({
      name: row.querySelector('.g-name').value,
      income: row.querySelector('.g-income').value,
      debt: row.querySelector('.g-debt').value,
      type: row.querySelector('.g-type')
        ? row.querySelector('.g-type').value
        : 'non_member',
      unknown: row.querySelector('.g-unknown')
        ? row.querySelector('.g-unknown').checked
        : false,
    }));
    data._guarantors = guarantors;
    // 已確認過的評分下拉（重整後不該又變回「未確認」）
    data._touchedSelects = SCORING_SELECT_IDS.filter((id) => {
      const el = $(id);
      return el && el.dataset.untouched !== 'true';
    });
    localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(data));
  } catch (e) {
    /* localStorage 不可用時略過 */
  }
}

function loadFormDraft() {
  try {
    const raw = localStorage.getItem(FORM_DRAFT_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    FORM_DRAFT_FIELDS.forEach((id) => {
      if (data[id] !== undefined) {
        const el = $(id);
        if (el) el.value = data[id];
      }
    });
    // 還原整併模式 checkbox
    if (typeof data._consolidationMode === 'boolean') {
      const cm = $('consolidationMode');
      if (cm) cm.checked = data._consolidationMode;
    }
    // 還原「已確認」的評分下拉
    if (Array.isArray(data._touchedSelects)) {
      data._touchedSelects.forEach((id) => markSelectTouched($(id)));
    }
    // 重建保證人 row（會清空再 render 一次）
    const gCount = parseInt($('guarantor_count').value) || 0;
    renderGuarantorRows(gCount);
    // 還原保證人資料
    if (Array.isArray(data._guarantors) && data._guarantors.length > 0) {
      const rows = document.querySelectorAll('.guarantor-row');
      data._guarantors.forEach((g, i) => {
        if (i >= rows.length) return;
        const r = rows[i];
        if (g.name !== undefined) r.querySelector('.g-name').value = g.name;
        if (g.income !== undefined)
          r.querySelector('.g-income').value = g.income;
        if (g.debt !== undefined) r.querySelector('.g-debt').value = g.debt;
        if (g.type !== undefined && r.querySelector('.g-type'))
          r.querySelector('.g-type').value = g.type;
        if (g.unknown !== undefined) {
          const cb = r.querySelector('.g-unknown');
          if (cb) {
            cb.checked = !!g.unknown;
            const debtEl = r.querySelector('.g-debt');
            if (debtEl) {
              debtEl.disabled = !!g.unknown;
              if (g.unknown) debtEl.value = '';
            }
          }
        }
      });
      bindGuarantorPreviews();
      updateGuarantorWeightHint();
    }
    updateGuarantorWeightHint();
    updateCollateralByYears();
    // C1：草稿還原後套用千分位（程式設值不觸發 input 事件）
    [
      'income',
      'existing_debt',
      'internal_monthly',
      'internal_balance',
      'internal_monthly2',
      'internal_balance2',
      'loan',
      'shares',
      'appraisalValue',
    ].forEach((id) => formatAmountInput($(id)));
    // 還原整併模式 toggle 後，第二筆貸款欄位群組也要同步顯示
    if ($('consolidationMode').checked) {
      [
        'internal2Group',
        'internalBalance2Group',
        'internalYears2Group',
        'internalRate2Group',
      ].forEach((id) => {
        const g = $(id);
        if (g) g.style.display = 'block';
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}

function clearFormDraft() {
  try {
    localStorage.removeItem(FORM_DRAFT_KEY);
  } catch (e) {
    /* noop */
  }
}

// ============================================================
// 範例案件：一鍵看完整輸出，降低第一次使用的理解成本
// ============================================================
const SAMPLE_CASE = {
  memberId: 'A00123 王小明（範例）',
  income: '50000',
  age: '40',
  existing_debt: '5000',
  internal_monthly: '0',
  internal_balance: '0',
  loan: '300000',
  years: '5',
  rate: '3',
  shares: '50000',
  incomeStability: '6',
  tenure: '4',
  interaction: '7',
  jcic: '10',
  membership: '3',
  collateral: '5',
  purpose: '10',
  career: '4',
  participation: '2',
};

// SAMPLE_CASE 沒列到、但會影響評分或列印的欄位，載入前一律歸零。
// 否則前一位社員的保證人姓名／整併設定會混進「範例」，
// 保證人又計入 protectionScore，示範案件每次結果都不一樣。
const SAMPLE_RESET = {
  internal_monthly2: '',
  internal_balance2: '',
  internal_years2: '',
  internal_rate2: '',
  appraisalValue: '',
  houseAge: '',
  appraisalAge: '',
  guarantor_count: '0',
};

function loadSampleCase() {
  if (
    !confirm('載入範例案件會覆蓋目前表單內容，確定要繼續嗎？（草稿會被取代）')
  ) {
    return;
  }
  Object.entries(SAMPLE_RESET).forEach(([id, v]) => {
    const el = $(id);
    if (el) el.value = v;
  });
  const zone = $('collateralZone');
  if (zone) zone.value = 'other';
  const cm = $('consolidationMode');
  if (cm && cm.checked) {
    cm.checked = false;
    [
      'internal2Group',
      'internalBalance2Group',
      'internalYears2Group',
      'internalRate2Group',
    ].forEach((gid) => {
      const g = $(gid);
      if (g) g.style.display = 'none';
    });
  }
  renderGuarantorRows(0);

  Object.keys(SAMPLE_CASE).forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.value = SAMPLE_CASE[id];
    if (el.tagName === 'SELECT') markSelectTouched(el);
    // 範例值覆蓋掉本社預設值，提示不再成立（程式設值不觸發 input）
    if (PREF_FIELD_IDS.includes(id)) clearPrefHint(el);
  });
  [
    'income',
    'existing_debt',
    'internal_monthly',
    'internal_balance',
    'loan',
    'shares',
  ].forEach((id) => {
    formatAmountInput($(id));
    const preview = $('preview_' + id);
    if (preview) {
      preview.innerText = formatAmount(
        parseFloat(String($(id).value).replace(/,/g, '')) || 0
      );
    }
  });
  updateCollateralByYears();
  updateShareHintLive();
  updateActionBar();
  saveFormDraft();
  calculateLoan();
}

document.addEventListener('DOMContentLoaded', () => {
  // 主按鈕（與其餘綁定一致走 addEventListener，HTML 不掛 onclick）
  $('btnCalc').addEventListener('click', calculateLoan);
  $('btnPrint').addEventListener('click', () => window.print());

  // 申請日期預設今天
  const appDate = $('appDate');
  if (appDate && !appDate.value) {
    const t = new Date();
    appDate.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  // 金額欄位即時預覽 + C1 千分位格式化
  const moneyFields = [
    'income',
    'existing_debt',
    'internal_monthly',
    'internal_balance',
    'internal_monthly2',
    'internal_balance2',
    'loan',
    'shares',
  ];
  moneyFields.forEach((id) => {
    const input = $(id);
    const preview = $('preview_' + id);
    if (!input) return;
    const update = () => {
      const val = parseFloat(String(input.value).replace(/,/g, '')) || 0;
      if (preview) preview.innerText = formatAmount(val);
    };
    input.addEventListener('input', update);
    input.addEventListener('input', () => formatAmountInput(input));
    input.addEventListener('blur', () => formatAmountInput(input));
    update();
  });
  // 鑑估價值（沒有 preview 也要千分位）
  const appraisal = $('appraisalValue');
  if (appraisal) {
    appraisal.addEventListener('input', () => formatAmountInput(appraisal));
    appraisal.addEventListener('blur', () => formatAmountInput(appraisal));
  }

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
  FORM_DRAFT_FIELDS.forEach((id) => {
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

  // 過期標記：所有欄位 change 事件（user 完成輸入才觸發，非 input）
  FORM_DRAFT_FIELDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', markResultStale);
  });
  if (guarantorList) {
    guarantorList.addEventListener('change', markResultStale);
  }

  // B1：股金 / 擔保品提示即時檢查（輸入時就提示，不必按計算才看到）
  ['loan', 'shares', 'collateral', 'years'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', updateShareHintLive);
    el.addEventListener('change', updateShareHintLive);
    el.addEventListener('blur', updateShareHintLive);
  });

  // 評分下拉的「未確認」標記必須在草稿還原前建立（草稿會回填已確認清單）
  initScoringSelects();

  // 頁面載入時還原草稿（若存在）
  loadFormDraft();

  // 草稿還原後重算「未確認」標示（值已非預設者不該再標）
  refreshScoringSelectMarks();

  // 本社常用參數（只補空欄位，草稿優先）
  applyPrefsToEmptyFields();

  // 操作列狀態：必填數 + 待確認數
  REQUIRED_FIELD_IDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', updateActionBar);
    el.addEventListener('change', updateActionBar);
  });
  $('chipRequired').addEventListener('click', () =>
    focusFirstPending('required')
  );
  $('chipUnconfirmed').addEventListener('click', () =>
    focusFirstPending('unconfirmed')
  );
  updateActionBar();

  // Stale banner 上的重算鈕（免捲回操作列）
  const recalcBtn = $('btnRecalc');
  if (recalcBtn) recalcBtn.addEventListener('click', calculateLoan);

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

  // 設為本社預設（年限／利率）
  const savePrefsBtn = $('btnSavePrefs');
  if (savePrefsBtn) {
    savePrefsBtn.addEventListener('click', () => {
      const years = $('years').value;
      const rate = $('rate').value;
      if (!years && !rate) {
        alert('請先填入貸款年限或年利率，再設為本社預設值。');
        return;
      }
      if (savePrefs()) {
        alert(
          `已設為本社預設值：\n貸款年限 ${years || '（未填）'} 年\n年利率 ${rate || '（未填）'}%\n\n往後開新案件時會自動帶入，清除草稿也不會消失。`
        );
      }
    });
  }

  // 載入範例案件（新手訓練 / 理監事會展示）
  const sampleBtn = $('btnSampleCase');
  if (sampleBtn) sampleBtn.addEventListener('click', loadSampleCase);

  // 整併模式切換
  const consolidationMode = $('consolidationMode');
  if (consolidationMode) {
    consolidationMode.addEventListener('change', () => {
      const internal2Group = $('internal2Group');
      const internalBalance2Group = $('internalBalance2Group');
      const internalYears2Group = $('internalYears2Group');
      const internalRate2Group = $('internalRate2Group');
      if (consolidationMode.checked) {
        internal2Group.style.display = 'block';
        internalBalance2Group.style.display = 'block';
        internalYears2Group.style.display = 'block';
        internalRate2Group.style.display = 'block';
      } else {
        internal2Group.style.display = 'none';
        internalBalance2Group.style.display = 'none';
        internalYears2Group.style.display = 'none';
        internalRate2Group.style.display = 'none';
      }
      saveFormDraft();
    });
  }

  // 社外債務估算按鈕
  const debtEstimatorBtn = $('btnDebtEstimator');
  if (debtEstimatorBtn) {
    debtEstimatorBtn.addEventListener('click', () => {
      openModal($('debtEstimatorModal'));
    });
  }

  const closeDebtEstimator = $('closeDebtEstimator');
  if (closeDebtEstimator) {
    closeDebtEstimator.addEventListener('click', () => {
      closeModal($('debtEstimatorModal'));
    });
  }

  const cancelDebtEstimator = $('cancelDebtEstimator');
  if (cancelDebtEstimator) {
    cancelDebtEstimator.addEventListener('click', () => {
      closeModal($('debtEstimatorModal'));
    });
  }

  // 點背景關閉
  $('debtEstimatorModal').addEventListener('click', (e) => {
    if (e.target === $('debtEstimatorModal'))
      closeModal($('debtEstimatorModal'));
  });

  // 全域快捷鍵：Ctrl+Enter 觸發計算
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      const btn = $('btnCalc');
      if (btn && !btn.disabled) calculateLoan();
    }
  });

  // 依債務類型套用預設利率／年限（輸入框留空時才用）
  const DEBT_TYPE_DEFAULTS = {
    mortgage: { rate: 2.5, years: 20 },
    car: { rate: 3.5, years: 5 },
    credit: { rate: 15, years: 0.5 },
    personal: { rate: 5, years: 3 },
  };
  function getDebtEstimatorParams() {
    const debtType = document.querySelector(
      'input[name="debtType"]:checked'
    ).value;
    const defaults =
      DEBT_TYPE_DEFAULTS[debtType] || DEBT_TYPE_DEFAULTS.personal;
    const principal = parseFloat($('debtPrincipal').value) || 0;
    const rate = parseFloat($('debtRate').value) || defaults.rate;
    const years = parseFloat($('debtYears').value) || defaults.years;
    return { principal, rate, years };
  }
  function updateDebtEstimatorPreview() {
    const { principal, rate, years } = getDebtEstimatorParams();
    const monthly = pmt(principal, rate, years);
    const el = $('debtEstimatedMonthly');
    if (el)
      el.innerText = principal > 0 ? formatAmount(Math.round(monthly)) : '0 元';
  }

  const applyDebtEstimator = $('applyDebtEstimator');
  if (applyDebtEstimator) {
    applyDebtEstimator.addEventListener('click', () => {
      const { principal, rate, years } = getDebtEstimatorParams();
      const monthly = pmt(principal, rate, years);
      const field = $('existing_debt');
      field.value = Math.round(monthly);
      formatAmountInput(field);
      field.dispatchEvent(new Event('input'));
      field.dispatchEvent(new Event('change'));
      saveFormDraft();
      markResultStale();
      closeModal($('debtEstimatorModal'));
    });
  }

  // 即時預覽：輸入本金 / 利率 / 年限 或 切換債務類型 時更新月付
  ['debtPrincipal', 'debtRate', 'debtYears'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('input', updateDebtEstimatorPreview);
  });
  document.querySelectorAll('input[name="debtType"]').forEach((r) => {
    r.addEventListener('change', updateDebtEstimatorPreview);
  });
  updateDebtEstimatorPreview();

  // B1 初始化：頁面載入時跑一次即時提示（草稿還原後的狀態）
  updateShareHintLive();

  // 區塊折疊（滑鼠 + 鍵盤無障礙）
  document
    .querySelectorAll('.card.collapsible .section-title')
    .forEach((title) => {
      const card = title.closest('.card.collapsible');
      const panel = title.nextElementSibling;

      title.setAttribute('role', 'button');
      title.setAttribute('tabindex', '0');
      title.setAttribute(
        'aria-expanded',
        String(!card.classList.contains('collapsed'))
      );
      if (!panel.id) panel.id = 'panel-' + Math.random().toString(36).slice(2);
      title.setAttribute('aria-controls', panel.id);

      const toggle = () =>
        setCardCollapsed(card, !card.classList.contains('collapsed'));

      title.addEventListener('click', toggle);
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });

  // 平板 / 手機：第二～五節預設收起，避免一次捲三個螢幕高。
  // 桌機維持全展開（e2e/collapse.spec.js 在 1280px 下驗證此行為）。
  if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
    const cards = document.querySelectorAll('.card.collapsible');
    cards.forEach((card, idx) => {
      if (idx < 2) return; // 零、案件基本資訊 與 一、還款能力 保持展開
      setCardCollapsed(card, true);
    });
  }
});
