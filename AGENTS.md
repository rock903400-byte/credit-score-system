# 信用評分系統 — AGENTS.md

Single-page static HTML tool for credit union (儲蓄互助社) loan assessment. No build step. The app is `index.html` + `core.js` + `ui.js` + `style.css`, served as-is.

## How to run

- **App**: open `index.html` directly in a browser (double-click or `file:///`). No dev server needed for the app.
- **Local static server** (for E2E / preview): `npm run serve` → http://localhost:8765

## How to test

```
node test.js              # 59 unit tests — pure logic in core.js (no DOM)
npx playwright test       # 44 E2E tests — real browser, in e2e/*.spec.js
npm run test:all          # both, sequentially
```

- `node test.js` extracts `core.js` into a Node `vm` sandbox with a `localStorage` mock — no DOM needed.
- `playwright.config.js` auto-starts `serve.js` on port 8765 as the `webServer`; first run needs `npx playwright install chromium`.
- E2E files: `smoke`, `calc`, `stale`, `modal`, `draft`, `collapse`, `scenarios` (real承辦人案件).

## File map

| File | Role |
|---|---|
| `core.js` | Pure business logic, no DOM. `computeScore`, `applyRegulatoryVetoes`, `applyLegalCeiling`, `computeMaxLoan`, `pmt`, `formatAmount`, `validateInputs`. |
| `ui.js` | DOM rendering, event handlers, form draft, modal, accessibility, print report. |
| `index.html` | Markup only; loads `core.js` then `ui.js`. |
| `style.css` | All visuals, light/dark via `prefers-color-scheme`, responsive, print. |
| `test.js` | Unit tests with vm sandbox. |
| `e2e/*.spec.js` | Playwright E2E suites. |
| `serve.js` | Tiny static file server for E2E (port 8765). |
| `rationale.html` | Business logic / scoring rationale (human-readable). |
| `.github/workflows/deploy.yml` | `main` push → `node test.js` gate → GitHub Pages. |
| `.github/workflows/e2e.yml` | Separate E2E workflow (independent of deploy). |

## Architecture: why core.js has no DOM

`core.js` is intentionally DOM-free so `test.js` can run it in a Node `vm` sandbox. `ui.js` reads the DOM via `parseInputs()`, calls `core.js` functions, then writes results back. If you add new scoring logic, put it in `core.js` and write a unit test in `test.js`. If you add UI behavior, put it in `ui.js` and write a Playwright test in `e2e/`.

## Hard-earned gotchas

These are real bugs or footguns that took effort to find. Don't re-derive them.

- **SVG `<tspan>` text**: `innerText` setter silently fails on SVG in Chromium. Use `.textContent` for `#gaugeScoreVal` and any other `<tspan>`. The `ui.js` code is correct; do not "fix" it to `innerText`.
- **`calculateLoan()` is wrapped in `try/catch`**: any error logs to `console.error` and shows `alert()`. If the result card is mysteriously empty and the page is alert-bombing, the catch is swallowing a real bug. Don't add a `try/catch` inside it; the outer one is enough.
- **`renderGuarantorRows(count)` resets `innerHTML` on `#guarantorList`**, wiping all current values. Before calling, snapshot the data, then restore afterward and call `bindGuarantorPreviews()`. See `loadFormDraft()` for the canonical pattern.
- **`#shareHint` has inline `display:none` in `index.html`**. A CSS class alone cannot override an inline style — `renderDashboard` must explicitly set `style.display = 'block'` when showing. Once a silent bug.
- **Age penalty thresholds are strict `>`** (not `>=`):
  - `maturity > 75` → hard veto (rule ⑨)
  - `maturity > 70` → −10 score
  - `maturity > 65` → −5 score
  - At exactly 75 → −10, not vetoed. At exactly 76 → vetoed.
- **Collateral `'12'` (足額股金內借款) only works for `years ≤ 7`**. If `years > 7`, rule ④ (7-year) fires first and you get vetoed by that, not rule ⑤.
- **Default `<option>` for `#collateral` is `'12'`** (it's the first `<option>` in `index.html` and has no `selected` attribute). A `loan > shares` case will silently trigger rule ⑤ unless you explicitly set `#collateral` to `'5'` or `'10'`. E2E test ⑮ burned me on this.
- **`pmt()` is also exported as a global** (no IIFE wrapping) — `ui.js` calls it directly in `renderDashboard` for the suggested-loan box. Don't shadow it.
- **`peopleScore` can be negative** (option `-20` for 還款逾期). The `.score-breakdown` bar width clamps to 0, but the displayed number shows the raw value.
- **DSR progress scale labels are absolutely positioned at true percents** (`left: 0/30/50/70/100%`). Don't change to `space-between` — labels would lie. `.progress-veto-marker` is fixed at 70%; `#progressLimit` is the per-grade solid marker.
- **Warning boxes share classes** `.notice-warn` (+ `.notice-warn-strong`), `.overflow-badge`, `.tip-box` — all have dark-mode overrides. Don't add new inline-styled colored boxes; they break `prefers-color-scheme: dark`.

## Business rules (high-signal, not exhaustive)

- **Veto rules: 14 total** (counted from `vetoes.push(...)` calls in `applyRegulatoryVetoes`): ① minor, ② credit ceiling (collateral 0/5), ③ natural person cap (>10M), ④ 7-year, ④-1 30-year, ⑤ collateral 12 with `loan > shares`, ⑥ jcic=`veto`, ⑦ purpose=`veto`, ⑨ age maturity > 75, ⑩ LTV, ⑩-1 mortgage 120% rule, ⑩-2 house age ≤ 20 → 30y cap / > 20 → 20y cap, ⑩-3 appraisal report > 10y.
- **Credit ceiling** (per `applyLegalCeiling`): collateral `'10'` → 10M (`NATURAL_PERSON_CAP`); `'12'` → `min(10M, shares)`; else → `shares + 1M` (`CREDIT_FLOOR_PER_SHARE`).
- **Protection score capped at 20** (`Math.min`). Without the cap, collateral 12 + guarantors 9 + guarantor-DSR 5 = 26 would push total > 100.
- **Status text policy** (audit-sensitive — do not change without consulting the operator): no "建議" language. Vetoed → "不予核貸"; score < 60 → "請專職/幹部審慎評估"; DTI over limit → "額度超限"; otherwise → "評分供專職/幹部裁量參考". Print report strips emoji via `stripEmoji()`.
- **Form draft** persisted to `localStorage['cu_form_draft']` on every `input`/`change`. `getReportSeq()` (`core.js`) also uses localStorage with a `_memSeqFallback` in-memory counter for private-browsing / group-policy blocks. Report ID format: `CU-YYYYMMDD-NNNN`.
- **Guarantor weight**: 社員 = 1.0, 非社員 = 0.7. `effectiveGuarantorCount = Math.round(weighted sum)`.
- **Inline validation flow**: `calculateLoan` → `validateInputsByField` → `applyFieldErrors` → clear all → red `.has-error` border + `.error-msg` span → scroll to first error. Cleared on success.

## E2E test quirks

- `playwright.config.js` defines `webServer` that auto-starts `serve.js`; `reuseExistingServer: !process.env.CI` means local runs reuse a running server, CI starts fresh.
- `e2e/draft.spec.js` adds `await page.waitForTimeout(100)` after fills — localStorage write is debounced by the `input` event handler chain; without the wait, `reload()` may restore stale data.
- `gaugeScoreVal` is a `<tspan>` inside SVG — Playwright's `.innerText()` throws "Node is not an HTMLElement". Use `.textContent()`.
- For elements in `index.html` with `style="display:none"` (e.g. `#suggestedLoanBox`, `#consolidationBox`, `#minorWarn`, `#shareHint`), prefer `.toBeVisible()` only after the action that should show them — checking visibility on the unshown element will time out.
- When `collateral` is `disabled` in the select (because `years > 7`), `selectOption('5')` will time out. To test the "user bypasses UI" path, use `page.evaluate(() => { el.value = '5' })`.
