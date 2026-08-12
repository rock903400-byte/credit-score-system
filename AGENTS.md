# 信用評分系統 — AGENTS.md

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
- **擔保品性質** `#collateralKind`（建物/土地）：`collateral='10'` 時顯示；土地隱藏並清空 `#houseAge`，法規⑩-2 只對建物做屋齡檢核，土地一律一般上限 `SECURED_YEARS_STANDARD`(20) 年（新增第 15 條否決，`test.js` 的規則計數測試為 15）。
- **⑩-2 自用/非自用規則**：屋齡 ≤20 且 `isSelfOccupied=true` 放寬上限 `MAX_SECURED_YEARS`(30)；否則（屋齡>20 或非自用/未填 `isSelfOccupied`）一律 20 年。UI 有 `#selfOccupied` 勾選欄（僅建物且屋齡 ≤20 顯示），草稿以 `_selfOccupied` 布林保存。**規則計數維持 16**——非自用併入「20 年」分支，不新增 push。
- **抵押權設定金額** `#mortgageAmount`：`collateral='10'` 時顯示（連動於 `collateralAppraisalGroup` 顯示狀態）。法規⑩-1 要求設定金額 ≥ 放款 × 120%（第 16 條否決；`test.js` 規則計數為 16）。未填視同 0 → 否決，因此**所有 `collateral='10'` 的測試與產生器（test.js `coherent`、simulate\_\*.js）都必須補 `mortgageAmount = max(loan×1.2, 100000)`**，否則判定會忽然被 120% 打回。
- **「未確認」pill 是可點擊按鈕**（`.untouched-pill`）：維持預設值的使用者點一下即 `markSelectTouched` + `saveFormDraft`，不必改值再改回。E2E：`actionbar.spec.js`「維持預設值：點「未確認」pill 即標記已確認」。
- `TRIAGE_MAP` (A/B/C 三級分流) is **display only** — it never touches the limit calculation. Keep it in `ui.js`, out of `core.js`.
- `cu_prefs` (年限/利率 本社預設) is deliberately separate from `cu_form_draft`; `clearFormDraft()` must not remove it. `applyPrefsToEmptyFields()` runs after `loadFormDraft()` so a draft always wins. It assigns `el.value` programmatically (no `change` event), so it **must** re-run `updateCollateralByYears()` — a 本社預設年限 of 8+ years otherwise leaves 擔保品 on `'12'` with the 鑑估 fields hidden, and 可貸額度 computes to **0**.
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

- 16 veto rules in `applyRegulatoryVetoes`: age >75 (硬否決), 7-year (must be real-estate), 30-year max for secured, LTV caps, 120% mortgage registration (⑩-1), collateral='12' amount cap, JCIC `veto`, purpose `veto`, etc. See `rationale.html` for the bug history.
- Age penalties use **strict** `>`:
  - `maturity > 75` → hard veto (in `applyRegulatoryVetoes`).
  - `maturity > 70` → –10.
  - `maturity > 65` → –5.
- Credit ceiling (`applyLegalCeiling`):
  - `collateral='10'` (足額不動產抵押) → `min(10 M, appraisal × LTV)`.
  - `collateral='12'` (足額股金內借款) → `min(10 M, shares)`. Only valid for `years ≤ 7`; for longer terms, rule ④ (7-year) fires first.
  - otherwise → `shares + 1 M`.
- Default `<option>` for `#collateral` is `'12'`. If `proposedLoan > shares`, set to `'5'` or `'10'` to avoid silent veto.
- Protection score capped at 20 (collateral 12 + guarantor 9 + guarantor-DSR 5 would otherwise exceed 100).
- `pmt()` is the simplified **first-period** formula: `principal/months + principal × (rate/100/12)`. Not the standard amortizing PMT — `computeMaxLoan` does the real math separately.
- Credit scores are written to `localStorage` as a debounced draft under `cu_form_draft`; Report ID sequence uses `cu_seq_YYYYMMDD` keys.
- **保證人「債務不詳」** (`g.unknown=true`):
  - 勾選後 `.g-debt` disabled 且清空;**排除**自 `guarantorDsrScore` 計算(只看已揭露者的最壞 DSR;全勾則 +0 中性)。
  - 加權人數**仍計算**(保護評分結構不變),僅 DSR 子項排除。
  - 結果區 `#unknownGuarantorWarn` 只在有勾選時顯示;列印報表該列加紅字「債務未查證」+ 表尾註記「請另覓佐證」。

## E2E quirks

- `playwright.config.js` starts `serve.js` on port 8765 via `webServer`; locally `reuseExistingServer` is on (CI off). Don't run your own `serve.js` in parallel.
- Reuse the `fillForm(page, data)` helper in `e2e/scenarios.spec.js:6` instead of writing boilerplate per test.
- After filling inputs, `await page.waitForTimeout(100)` so the debounced localStorage draft saves before reload. For 草稿持久化測試(checkbox/debt 連動),用 `150+` 以涵蓋 `applyUnknown` 的額外 `saveFormDraft`。
- `#gaugeScoreVal` is a `<tspan>`; use `.textContent()` not `.innerText()`.
- When a `<select>` is disabled (e.g. `collateral` after `years > 7`), `selectOption()` may timeout; set value via `page.evaluate(() => el.value = '5')`.
- **Locally the suite is flaky at the default 2 workers on Windows** — a random single test dies with `Test timeout … Tearing down "context"` while chromium is still launching. `--workers=1` runs the whole suite green. CI is unaffected.
- On failure: screenshot, trace (`.zip`), and video are saved to `test-results/`. View a trace with `npx playwright show-trace <path>`.
- CI: `e2e.yml` runs Playwright with chromium only, uploads `test-results/` + `playwright-report/` on failure. `deploy.yml` runs unit tests then deploys `main` to GitHub Pages on every push.
