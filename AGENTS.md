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
- **「未確認」下拉機制** (`SCORING_SELECT_IDS`, 9 selects): every scoring `<select>` defaults to its _best_ option (~40 分 combined), so an unreviewed form scores optimistically. `initScoringSelects()` stamps `data-untouched="true"`; `markSelectTouched()` clears it and drops the label pill. Gotchas:
  - `initScoringSelects()` **must run before `loadFormDraft()`** — the draft restores the confirmed list from `data._touchedSelects`.
  - The per-select `change` handler calls `saveFormDraft()` **again** after marking. `FORM_DRAFT_FIELDS` binds `saveFormDraft` earlier, so that first save still sees the stale `untouched` flag and the last-changed select would never persist (guarded by `e2e/actionbar.spec.js`「已確認狀態寫入草稿」).
  - `updateCollateralByYears()` marks `#collateral` touched when it force-sets `'10'` — a system-mandated value counts as confirmed.
- **`#verdictBar` owns `#resGrade` / `#resLimit` / `#resTotalDti` / `#resMaxDtiTxt`.** The duplicates inside the collapsed details are `resTotalDti2` / `resMaxDtiTxt3` (and `resMaxDtiTxt2` in the tip box). Grade colouring is applied to `#verdictBar` via `verdict-pass|warn|fail`, not to a `.result-stat` card.
- **`<details id="resultDetails">` is collapsed by default**, so anything inside it (5P breakdown, radar, DTI ruler, gauge) is _not_ visible to Playwright's `innerText()`. Use `openResultDetails(page)` in `e2e/scenarios.spec.js` before reading `#bd_*` values.
- `TRIAGE_MAP` (A/B/C 三級分流) is **display only** — it never touches the limit calculation. Keep it in `ui.js`, out of `core.js`.
- `cu_prefs` (年限/利率 本社預設) is deliberately separate from `cu_form_draft`; `clearFormDraft()` must not remove it. `applyPrefsToEmptyFields()` runs after `loadFormDraft()` so a draft always wins.
- `core.js` has no input validation. UI `<select>`s bound to numeric scores must keep values within option ranges — out-of-range inputs can still produce out-of-range sub-scores (the `total` is clamped 0–100, sub-scores are NOT).
- `renderGuarantorRows(count)` wipes `#guarantorList.innerHTML`. Snapshot row data first, then call, then re-bind previews. The template includes `.g-unknown` checkbox (債務不詳) — snapshot/restore must include the `unknown` flag, and the rendered `.g-debt` carries `disabled` when `d.unknown` is true.
- **`bindGuarantorPreviews()` calls `updateType()` at the end of each row, which controls `.g-debt` disabled state.** `updateType()` must respect `.g-unknown` checked state — never force `debtInput.disabled = false` unconditionally (regression:草稿重整後勾選的「不詳」會被覆蓋成 enabled,測試 ⑳ 守護此行為)。
- `calculateLoan()` already has a `try/catch`; adding another masks real bugs.
- SVG `<tspan>` text must be set via `.textContent`; `innerText` silently fails in Chromium.
- `#shareHint` and `#unknownGuarantorWarn` have inline `style="display:none"` in `index.html` — toggling the class is not enough; set `style.display = 'block' | 'none'` directly.
- `core.js` exports are **not** type-checked (`tsconfig.json` includes only `**/*.ts`). The only `.ts` file is `dummy.ts`; keep it that way or update the include pattern.

## Business rules

- 14 veto rules in `applyRegulatoryVetoes`: age >75 (硬否決), 7-year (must be real-estate), 30-year max for secured, LTV caps, 120% mortgage registration, collateral='12' amount cap, JCIC `veto`, purpose `veto`, etc. See `rationale.html` for the bug history.
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
- **Locally the suite is flaky at the default 2 workers on Windows** — a random single test dies with `Test timeout … Tearing down "context"` while chromium is still launching. `--workers=1` runs 63/63 green. CI is unaffected.
- On failure: screenshot, trace (`.zip`), and video are saved to `test-results/`. View a trace with `npx playwright show-trace <path>`.
- CI: `e2e.yml` runs Playwright with chromium only, uploads `test-results/` + `playwright-report/` on failure. `deploy.yml` runs unit tests then deploys `main` to GitHub Pages on every push.
