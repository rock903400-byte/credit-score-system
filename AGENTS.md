# 信用評分系統 — AGENTS.md

## Users

儲蓄互助社的專職人員，**不是金融專業**。系統可以內部複雜，但介面要簡單：

- 表單只問可查證的事實；需要專業判斷的事改由系統自動判斷。
- 即時提示用白話，只給結論與原因（如「保證人加分 +1.5 分（1 位債務不詳，加分打五折）」）；加權、×0.8 等計算細節放在試算明細與列印報表給放款委員會。
- 新增規則前先問：專職要多填／多判斷什麼？結果改變時能否一句話說明原因？避免欄位之間的隱藏連動（改 A 欄卻讓額度莫名改變）。

## Run

- Open `index.html` directly, or `npm run serve` → http://localhost:8765 (set `PORT` env to change).
- After `npm install`, run `npx playwright install chromium` once before E2E.

## Commands

| Command                | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `npm run format`       | Prettier, rewrites all files                                                 |
| `npm run lint`         | ESLint                                                                       |
| `npm run type-check`   | `tsc --noEmit` — only checks `**/*.ts`; only `dummy.ts` exists (placeholder) |
| `npm test`             | Unit tests; runs `core.js` in a VM sandbox, no DOM                           |
| `npm run test:e2e`     | Playwright (auto-starts `serve.js` on port 8765)                             |
| `npm run test:all`     | Unit + E2E                                                                   |
| `npm run simulate:1k`  | Stress test core logic with 1000 random cases                                |
| `npm run simulate:10k` | Stress test with 10000 cases                                                 |

**Always run in order:** `format` → `lint` → `type-check` → `test`.

## Architecture

- `core.js` — pure business logic, no DOM. Consumed by `ui.js` and `test.js` via a `vm` sandbox.
- `ui.js` — DOM, drafts (localStorage), validation, report rendering.
- `serve.js` — minimal static file server used by Playwright and manual testing.
- `index.html` + `style.css` — no bundler, no framework.
- **All functions are globals** (no module exports). **`pmt()` is shared by `core.js` + `ui.js` + `simulate_*.js` — do not shadow it.**
- `simulation.js` is a legacy 1000-case runner (no package.json script); use `simulate:1k` instead.

## Gotchas

- **`#actionBar` is sticky at the top (desktop) / fixed at the bottom (≤768px).** `#btnCalc` lives inside it, not in `.btn-group`. `setCalcLoading()` swaps only the `.btn-calc-label` text — do **not** rewrite `#btnCalc.innerHTML` or the `.kbd-hint` badge disappears permanently after the first calculation.
- **「未確認」下拉機制** (`SCORING_SELECT_IDS`, 9 selects): every scoring `<select>` defaults to its _best_ option (~40 分 combined), so an unreviewed form scores optimistically. `initScoringSelects()` stamps `data-untouched="true"` **and `data-defaultValue`**; `markSelectTouched()` clears the flag and drops the label pill. Gotchas:
  - A select counts as unconfirmed only when `untouched === 'true'` **and** `value === defaultValue`. The second half keeps the warning 「維持系統預設值」 literally true, and stops drafts saved before this feature (no `_touchedSelects`) from being flagged wholesale.
  - Restoring a draft writes `el.value` directly, bypassing `markSelectTouched()` — call `refreshScoringSelectMarks()` afterwards or the pills go stale.
  - `markSelectTouched()` calls `updateActionBar()` itself; callers other than the change handler (`updateCollateralByYears`, draft restore, sample case) would otherwise leave the chip count contradicting `#verdictUnconfirmed`.
  - `initScoringSelects()` **must run before `loadFormDraft()`** — it snapshots the factory defaults, and the draft restores the confirmed list from `data._touchedSelects`.
  - The per-select `change` handler calls `saveFormDraft()` **again** after marking. `FORM_DRAFT_FIELDS` binds `saveFormDraft` earlier, so that first save still sees the stale `untouched` flag and the last-changed select would never persist (guarded by `e2e/actionbar.spec.js`「已確認狀態寫入草稿」).
  - `updateCollateralByYears()` marks `#collateral` touched when it force-sets `'10'` — a system-mandated value counts as confirmed.
- **`#verdictBar` owns `#resGrade` / `#resLimit` / `#resTotalDti` / `#resMaxDtiTxt`.** The duplicates inside the collapsed details are `resTotalDti2` / `resMaxDtiTxt3` (and `resMaxDtiTxt2` in the tip box). Grade colouring is applied to `#verdictBar` via `verdict-pass|warn|fail`, not to a `.result-stat` card.
- **`<details id="resultDetails">` is collapsed by default**, so anything inside it (5P breakdown, DTI ruler, gauge) is _not_ visible to Playwright's `innerText()`. Use `openResultDetails(page)` in `e2e/scenarios.spec.js` before reading `#bd_*` values.
- **整併模式 (consolidation) 是動態 N 筆列表** `#internalExtList`（每行 `.ext-monthly/.ext-balance/.ext-years/.ext-rate` + 刪除鈕；`#btnAddExtLoan` 加筆）。Core 只吃 `input.additionalLoans = [{monthly,balance,years,rate}]` 陣列；所有額外筆的**月付都會計入** baseline DSR、70% 否決線、`computeMaxLoan` 與建議額度。舊草稿的 `internal_monthly2` 等固定鍵在 `loadFormDraft` 做一次性遷移。
- **擔保品性質** `#collateralKind`（建物/土地）：`collateral='10'` 時顯示；土地隱藏並清空 `#houseAge`，法規⑩-2 只對建物做屋齡檢核，土地一律一般上限 `SECURED_YEARS_STANDARD`(20) 年（第 15 條否決）。
- **⑩-2 自用/非自用規則**：屋齡 ≤20 且 `isSelfOccupied=true` 放寬上限 `MAX_SECURED_YEARS`(30)；否則（屋齡>20 或非自用/未填 `isSelfOccupied`）一律 20 年。UI 有 `#selfOccupied` 勾選欄（僅建物且屋齡 ≤20 顯示），草稿以 `_selfOccupied` 布林保存。非自用併入「20 年」分支。
- **抵押權設定金額** `#mortgageAmount`：`collateral='10'` 時顯示（連動於 `collateralAppraisalGroup` 顯示狀態）。法規⑩-1 要求設定金額 ≥ 放款 × 120%（第 16 條否決）。未填視同 0 → 否決，因此**所有 `collateral='10'` 的測試與產生器（test.js `coherent`、simulate\_\*.js）都必須補 `mortgageAmount = max(loan×1.2, 100000)`**，否則判定會忽然被 120% 打回。
- **擔保品所有權人** `#collateralOwner`（本人/第三人）：`collateral='10'` 時顯示；若為第三人名下且未填寫保證人，觸發第 17 條否決（《擔保放款辦法》第 14 條）。
- **借款人身分與法定核決送審層級** (`determineGovernanceRouting`)：`#borrowerRole`（一般社員/理監事/職員）。理監事或職員無擔保借款超股金時，標定為「理事會特別決議（須 2/3 出席同意）」（章程第 27 條）；擔保放款標定為「理事會決議」（組織規則第 9 條）；股金內借款標定為「專職授權核放」（要點第 5 條）。
- **「未確認」pill 是可點擊按鈕**（`.untouched-pill`）：維持預設值的使用者點一下即 `markSelectTouched` + `saveFormDraft`，不必改值再改回。E2E：`actionbar.spec.js`「維持預設值：點「未確認」pill 即標記已確認」。
- `TRIAGE_MAP` (A–E 各級作業流程說明；否決案走 `TRIAGE_VETOED`「否決列管」) is **display only** — it never touches the limit calculation. Keep it in `ui.js`, out of `core.js`.
- **`resetFormToDefaults()`（清除草稿）**：`FACTORY_DEFAULTS` 列出各欄預設值，`FORM_DRAFT_FIELDS` 中未列者一律清空。新欄位仍應寫進 `FACTORY_DEFAULTS`（若預設非空），否則前一案的值會殘留到下一案。守護：`e2e/draft.spec.js`「每個草稿欄位都回到預設值」逐欄比對。
- **保證人審定只有一份：core 的 `evaluateGuarantors()`**。`computeScore`、`updateGuarantorWeightHint()`（即時提示）、列印報表都呼叫它——不要在 `ui.js` 重寫權重／DSR 規則（之前三份各自實作）。
- 「設為本社預設」功能已移除（`cu_prefs` 不再被讀取，殘留的 localStorage 資料無害）。`clearFormDraft()` must not remove `cu_prefs`-like keys — just leave storage alone.
- `markResultStale()` gates on `getComputedStyle(card).display`, not `card.style.display`: `#resultCard` is hidden by a stylesheet rule with no inline style, and `#btnCalc` now lives in the always-visible action bar, so an inline-only check makes the button blink 「已過期」 before the first calculation.
- `loadSampleCase()` resets `SAMPLE_RESET` + guarantors + 整併模式 before applying `SAMPLE_CASE`. Anything added to the form that affects scoring must be added to one of those two maps, or the previous case bleeds into the demo.
- `core.js` has no input validation. UI `<select>`s bound to numeric scores must keep values within option ranges — out-of-range inputs can still produce out-of-range sub-scores (the `total` is clamped 0–100, sub-scores are NOT).
- `renderGuarantorRows(count)` wipes `#guarantorList.innerHTML`. Snapshot row data first, then call, then re-bind previews. The template includes `.g-unknown` checkbox (債務不詳) — snapshot/restore must include the `unknown` flag, and the rendered `.g-debt` carries `disabled` when `d.unknown` is true.
- **`bindGuarantorPreviews()` calls `updateType()` at the end of each row, which controls `.g-debt` disabled state.** `updateType()` must respect `.g-unknown` checked state — never force `debtInput.disabled = false` unconditionally (regression:草稿重整後勾選的「不詳」會被覆蓋成 enabled,測試 ⑳ 守護此行為)。
- `calculateLoan()` already has a `try/catch`; adding another masks real bugs.
- SVG `<tspan>` text must be set via `.textContent`; `innerText` silently fails in Chromium.
- `#shareHint` and `#unknownGuarantorWarn` have inline `style="display:none"` in `index.html` — toggling the class is not enough; set `style.display = 'block' | 'none'` directly.
- `core.js` exports are **not** type-checked (`tsconfig.json` includes only `**/*.ts`). The only `.ts` file is `dummy.ts`; keep it that way or update the include pattern.

## Business rules

- 19 veto rules in `applyRegulatoryVetoes`: age >75 (硬否決), 7-year (must be real-estate), 30-year max for secured, LTV caps, 120% mortgage registration (⑩-1), collateral='12' amount cap, 第三人擔保品保證人檢核 (⑩-4), JCIC `veto`, purpose `veto`, ⑱ 收支赤字否決, ⑲ 金管會 DBR 22 倍無擔保負債上限否決等。See `rationale.html` for the bug history.
- Age penalties use **strict** `>`:
  - `maturity > 75` → hard veto (in `applyRegulatoryVetoes`).
  - `maturity > 70` → –10.
  - `maturity > 65` → –5.
- Credit ceiling (`applyLegalCeiling`):
  - `collateral='10'` (足額不動產抵押) → `min(10 M, appraisal × LTV)`.
  - `collateral='12'` (足額股金內借款) → `min(10 M, shares)`. Only valid for `years ≤ 7`; for longer terms, rule ④ (7-year) fires first.
  - otherwise → `min(shares + 1 M, effective_income × grade_dbr_multiplier - existing_unsecured_balance + secured_shares_part)`.
- **社外無擔保負債總餘額** `externalUnsecuredDebt`（`#external_unsecured_debt`，存量）用於 DBR 22 倍否決與無擔保天花板；未帶視同 0。`existingDebt` 是**社外月付**，只進 DSR/DTI，絕不可當餘額使用。`simulate_*.js` 產生器帶 `0 ~ income×25` 以涵蓋 22 倍線兩側。
- **收入型態折數** `INCOME_STABILITY_HAIRCUT`（9→100%、6→85%、3→70%、1→50%，取用一律走 `getHaircutRatio()`）：`getEffectiveIncome()` 的折後收入**只**用於 70% 否決線、收支、DBR 22 倍與額度。**評分的 DSR 分用申報收入**——收入品質已由 stability 子項扣分，改用折後收入會讓同一件事扣兩次分（現金收入社員曾因此 C→D、額度只剩固定月薪者的 27%）。守護：`test.js`「收入型態在評分只扣一次」。
- 無擔保授信 DBR 階梯：A 級 20 倍、B 級 15 倍、C 級 12 倍、D 級 8 倍月薪（D 級強化提示保證人徵提）。
- Default `<option>` for `#collateral` is `'12'`. If `proposedLoan > shares`, set to `'5'` or `'10'` to avoid silent veto.
- Protection score capped at 20 (collateral 12 + guarantor 9 + guarantor-DSR 5 + LTV bonus 3 would otherwise exceed 100). 不動產抵押（`collateral='10'`）另依 LTV（loan/appraisal）加成：≤50% ＋3、≤70% ＋2、其餘/無鑑價 ＋0。`computeScore` 回傳 `protectionBreakdown` 供 UI 顯示構成（擔保/LTV/保證人/DSR）。注意 `test.js` 的 `coherent()` 兜底鑑價為 `loan×1.3` 而非固定 500 萬——若改用固定大額兜底，小額貸款 LTV 會掉到加成區間、A 級分布暴增。
- `pmt()` is the simplified **first-period** formula: `principal/months + principal × (rate/100/12)`. Not the standard amortizing PMT — `computeMaxLoan` does the real math separately.
- Credit scores are written to `localStorage` as a debounced draft under `cu_form_draft`; Report ID sequence uses `cu_seq_YYYYMMDD` keys.
- **保證人「債務不詳」** (`g.unknown=true`):
  - 勾選後 `.g-debt` disabled 且清空;**排除**自 `guarantorDsrScore` 計算(只看已揭露者;全勾則 +0 中性)。
  - **人數加分折半，打在分數上而非人數上**：`已查證分 + (含不詳者以原權重查表分 − 已查證分) × 0.5`。不可改回「權重 ×0.5 再四捨五入」——1 位不詳社員 0.5 人會被 round 回 1 人（折半無效），1 位不詳非社員 0.35 人則 round 成 0（斷崖）。不詳者分數必介於「無此人」與「已查證」之間，`protectionBreakdown.guarantor` 因此可能是小數（如 1.5、4.5）。
  - 結果區 `#unknownGuarantorWarn` 只在有勾選時顯示;列印報表該列加紅字「債務未查證」+ 表尾註記「請另覓佐證」。
- **保證人採連帶保證原則**：每位保證人都對全額負責，保障取決於最有能力者，所以 `guarantorDsrScore` 取已揭露者的**最佳**（最低）DSR，不是最差。改回「最差 DSR」會讓多找一位保證人反而扣分（A 10% + B 55% 曾低於 A 單獨）。
  - 個人 DSR ≥ `GUARANTOR_HIGH_DSR_THRESHOLD` 65%：視同沒有此人（不計人數、不影響 DSR 子項）。
  - 守護（`test.js`「保證人審定一致性」）：負債比越高只減不增；多一位保證人不會比不加更低分；勾不詳低於任何 < 65% 的如實揭露。已知殘留：把負債 ≥ 65% 的保證人勾成不詳可多 1 分，要消除就得讓不詳完全不加分，刻意不做，交由報表紅字與放款委員會把關。

## E2E quirks

- `playwright.config.js` starts `serve.js` on port 8765 via `webServer`; locally `reuseExistingServer` is on (CI off). Don't run your own `serve.js` in parallel.
- Reuse the `fillForm(page, data)` helper in `e2e/scenarios.spec.js:6` instead of writing boilerplate per test.
- After filling inputs, `await page.waitForTimeout(100)` so the debounced localStorage draft saves before reload. For 草稿持久化測試(checkbox/debt 連動),用 `150+` 以涵蓋 `applyUnknown` 的額外 `saveFormDraft`。
- `#gaugeScoreVal` is a `<tspan>`; use `.textContent()` not `.innerText()`.
- When a `<select>` is disabled (e.g. `collateral` after `years > 7`), `selectOption()` may timeout; set value via `page.evaluate(() => el.value = '5')`.
- **Locally the suite is flaky at the default 2 workers on Windows** — a random single test dies with `Test timeout … Tearing down "context"` while chromium is still launching. `--workers=1` runs the whole suite green. CI is unaffected.
- On failure: screenshot, trace (`.zip`), and video are saved to `test-results/`. View a trace with `npx playwright show-trace <path>`.
- CI: `e2e.yml` runs Playwright with chromium only, uploads `test-results/` + `playwright-report/` on failure. `deploy.yml` runs unit tests then deploys `main` to GitHub Pages on every push.
