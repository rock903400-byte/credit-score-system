# 信用評分系統 — AGENTS.md

## Project overview

Single-page static HTML tool for credit union loan assessment. No build step, no dependencies.

- `index.html` (~405 lines) — HTML structure only; references external CSS/JS
- `style.css` — all styles (light/dark theme, responsive, print)
- `core.js` — pure business logic (no DOM dependency, testable in Node)
- `ui.js` — DOM-dependent rendering, event handling, form draft, accessibility
- `test.js` — 39 automated regression tests covering core logic (PMT, scoring, vetoes, ceilings, age boundaries, income guard, collateral '12' veto)
- `rationale.html` — business logic / scoring rationale documentation
- `.github/workflows/deploy.yml` — auto-deploys `main` to GitHub Pages at `https://rock903400-byte.github.io/credit-score-system/`

## How to run

Open `index.html` in any browser (double-click or `file:///`). No server required.

## How to test

```
node test.js
```

39 tests cover: PMT, formatAmount, escapeHtml, validateInputs, validateInputsByField, computeScore, applyRegulatoryVetoes, determineGrade, computeMaxLoan, applyLegalCeiling.

Uses Node.js `vm` sandbox to extract and execute `core.js` directly. No browser, no DOM mock needed.

## Architecture

Files are split for CSP compliance and maintainability:
- `core.js` — pure business logic (no DOM), testable in Node via vm sandbox
- `ui.js` — DOM-dependent functions, event handling, draft persistence, accessibility
- `style.css` — all visual styles
- `index.html` — HTML structure only; loads `core.js` then `ui.js`

### Constants (core.js)

```js
DSR_VETO_THRESHOLD       = 0.70
AGE_HARD_VETO            = 75
AGE_SOFT_PENALTY         = 70
AGE_SOFT_PENALTY_MILD    = 65
AGE_SCORE_HARD           = -10
AGE_SCORE_MILD           = -5
NATURAL_PERSON_CAP       = 10_000_000
CREDIT_FLOOR_PER_SHARE   = 1_000_000
LONG_TERM_YEARS          = 7
MAX_GUARANTORS           = 5
GUARANTOR_SCORE_TABLE    = { 0:0, 1:4, 2:6, 3:7, 4:8, 5:9 }
GRADE_THRESHOLDS         = { A: 90, B: 80, C: 70, D: 60 }
GRADE_DTI_LIMITS         = { A: 0.60, B: 0.50, C: 0.40, D: 0.30 }
```

### Key functions (pure — testable)

- `computeScore(input)` — total score (35% repayment + 25% people + 20% protection + 10% purpose + 10% perspective)
- `applyRegulatoryVetoes(input)` — 8 hard veto rules (① minor share cap, ② credit ceiling, ③ natural person cap, ④ >7yr requires real estate, ⑤ collateral '12' loan ≤ shares, ⑥ JCIC veto, ⑦ purpose veto, ⑨ age >75 veto); returns `{ vetoes[], newLoanMonthlyPmt, postLoanDti }`
- `determineGrade(score, isVetoed)` — returns `{ grade, maxDti }`; vetoed always → E/0
- `computeMaxLoan(input, maxDti)` — reverse-calculates loan amount from DTI limit using PMT
- `applyLegalCeiling(input, maxLoanLimit)` — legal caps (NATURAL_PERSON_CAP or `shares + 1M`)
- `validateInputs(input)` — returns array of error strings (used in `calculateLoan`)
- `validateInputsByField(input)` — returns `{ fieldKey: 'error msg' }` object for inline rendering
- `pmt(principal, annualRatePercent, years)` — standard PMT formula: `P * r * (1+r)^n / ((1+r)^n - 1)`

### Key functions (DOM-coupled)

- `calculateLoan()` — main entry: parse → validate → score → veto → render
- `renderDashboard(result)` — populates result card, SVG gauge, progress bar, status message
- `renderPrintReport(result)` — populates print-area (hidden until `window.print()`)
- `renderGuarantorRows(count)` — dynamically rebuilds `.guarantor-row` elements; **resets innerHTML**, so event bindings and data must be restored after calling
- `setFieldError(inputEl, msg)` / `applyFieldErrors(fieldErrors)` / `clearAllFieldErrors()` — inline validation UI
- `saveFormDraft()` / `loadFormDraft()` / `clearFormDraft()` — localStorage persistence for all form fields including guarantors

### CSS architecture

- **Theme**: CSS custom properties in `:root` (lines 8–20). All colors routed through variables.
- **Accordion**: `.card.collapsible` pattern — `.section-title` is clickable, `.card-body` has `max-height` transition. JS toggles `.collapsed` class.
- **Dark mode**: `@media (prefers-color-scheme: dark)` overrides `:root` variables. No manual toggle — follows OS setting.
- **RWD**: `@media (max-width: 768px)` and `@media (max-width: 480px)`. Guarantor rows stack vertically, buttons stack, form-grid goes single-column.
- **SVG gauge**: Circle in `.score-gauge` rendered as `<circle stroke-dasharray>`; fill color matches grade (A=green → E=red) via `renderDashboard` in `ui.js`.
- **Micro-interactions**: `.card:hover` (lift + shadow), `button:active` (scale 0.98).

## Key behaviors

- **7-year rule**: `years > 7` requires `collateral = '10'` (real estate). `updateCollateralByYears()` auto-switches the select and disables non-`10` options.
- **Collateral '12' rule**: `years ≤ 7 && collateral === '12'` allows loan only if `proposedLoan <= shares`; otherwise veto (rule ⑤).
- **Guarantors**: dynamic rows (0–5). Each row has name/income/debt + error-msg span. Data preserved across rebuild via `existingData` snapshot. Score = `GUARANTOR_SCORE_TABLE[count]` + worst DSR among guarantors.
- **Age**: hard veto at maturity >75, soft penalty at >70 (−10) and >65 (−5) — checked in descending order. Under 18 requires guardian consent; borrow cap = `shares - internalBalance`.
- **Credit ceiling**: `collateral in ('10','12')` → 10M cap (`NATURAL_PERSON_CAP`); else → `shares + 1M` (`CREDIT_FLOOR_PER_SHARE`).
- **Collateral '12' veto**: `years ≤ 7 && collateral === '12' && proposedLoan > shares` → hard veto (rule ⑤).
- **Inline validation**: `calculateLoan()` calls `validateInputsByField()` → `applyFieldErrors()` → scrolls to first error element. Errors show as red `.has-error` border + `.error-msg` span below the field. Cleared on successful validation.
- **Form draft**: All fields (including guarantor rows) saved to `localStorage['cu_form_draft']` on every `input`/`change`. Restored on `DOMContentLoaded`. "清除草稿" button calls `clearFormDraft()` + `location.reload()`.

## Collateral options

| value | meaning |
|---|---|
| `12` | 足額股金內借款 (as long as `proposedLoan <= shares`) |
| `10` | 足額不動產抵押 |
| `5` | 不足額擔保或純信用(股金2倍內) |
| `0` | 純信用借款 (超過股金2倍) |

## Guardrails

- `escapeHtml(s)` available for safe string interpolation in `innerHTML` contexts
- `formatAmount(val)` for human-readable amounts (4.5 萬元, 1000 萬元, etc.)
- Dynamic guarantor rows capped at `MAX_GUARANTORS` (5)
- All numeric fields checked for negatives in `validateInputs` and `validateInputsByField`
- `income=0` guard in `computeScore` (returns zero-score object) and `applyRegulatoryVetoes` (postLoanDti=Infinity) — prevents division by zero
- When editing `renderGuarantorRows`, remember to restore event bindings and preview values after `innerHTML = ''`
- HTML structure uses `.card.collapsible > .section-title + .card-body` pattern; adding a new section requires matching `</div>` nesting (card-body → card)
- Collapsible sections support keyboard accessibility: `role="button"`, `tabindex="0"`, `aria-expanded`/`aria-controls`, Enter/Space to toggle
