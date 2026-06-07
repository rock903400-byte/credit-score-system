# 信用評分系統 — AGENTS.md

## Project overview

Single-page static HTML tool for credit union loan assessment. No build step, no dependencies, no tests, no lint/typecheck.

- `index.html` (~1346 lines) — monolithic app (HTML+CSS+JS)
- `rationale.html` — business logic / scoring rationale documentation
- `.github/workflows/deploy.yml` — auto-deploys `main` to GitHub Pages at `https://rock903400-byte.github.io/credit-score-system/`

## How to run

Open `index.html` in any browser (double-click or `file:///`). No server required.

## Architecture

- All logic in one file: `index.html`
- Constants section: `LONG_TERM_YEARS=7`, `GRADE_THRESHOLDS`, `GRADE_DTI_LIMITS`, `GUARANTOR_SCORE_TABLE` at line ~737
- Key functions:
  - `computeScore(input)` — total score (35% repayment + 25% people + 20% protection + 10% purpose + 10% perspective)
  - `applyRegulatoryVetoes(input)` — 8 hard veto rules (collateral, JCIC, age, DTI, etc.)
  - `applyLegalCeiling(input, maxLoanLimit)` — legal borrowing caps (NATURAL_PERSON_CAP, `shares + 1M`)
  - `computeMaxLoan(input, maxDti)` — reverse-calculates loan amount from DTI limit using PMT
  - `renderDashboard(result)` / `renderPrintReport(result)` — UI rendering
- Monthly payment uses standard PMT formula: `P * r * (1+r)^n / ((1+r)^n - 1)`

## Key behaviors

- **7-year rule** (`line 933-935`): `years > 7` requires collateral = `'10'` (real estate). Auto-switches if years > 7, disables non-real-estate options.
- **Guarantors**: dynamic rows (0-5), per-person name/income/debt. Score = `GUARANTOR_SCORE_TABLE[count]` + worst DSR among guarantors.
- **Age**: hard veto at maturity > 75 (`line 953`), soft penalty at > 65/70 (`line 886-888`). Under 18 requires guardian consent.
- **Credit ceiling**: `collateral in ('10','12')` → 10M cap; else → `shares + 1M`.

## Key constants (line ~737)

```js
LONG_TERM_YEARS = 7
NATURAL_PERSON_CAP = 10_000_000
CREDIT_FLOOR_PER_SHARE = 1_000_000
MAX_GUARANTORS = 5
GUARANTOR_SCORE_TABLE = { 0:0, 1:4, 2:6, 3:7, 4:8, 5:9 }
GRADE_THRESHOLDS = { A: 90, B: 80, C: 70, D: 60 }
GRADE_DTI_LIMITS = { A: 0.60, B: 0.50, C: 0.40, D: 0.30 }
```

## Verifying changes

Open `index.html` in browser and click **開始授信評分** to test. No test framework or CI checks exist (no lint, no typecheck).

## Deploy

Push to `main` — GitHub Actions auto-deploys:
```
git add . && git commit -m "..." && git push origin main
```
Deploys to `https://rock903400-byte.github.io/credit-score-system/`.

## Collateral options

| value | meaning |
|---|---|
| `12` | 足額股金內借款 (as long as `proposedLoan <= shares`) |
| `10` | 足額不動產抵押 |
| `5` | 不足額擔保或純信用(股金2倍內) |
| `0` | 純信用借款 (超過股金2倍) |

## Guardrails

- `escapeHtml(s)` available for safe string interpolation
- Dynamic guarantor rows cap at `MAX_GUARANTORS`
- All numeric fields checked for negatives in `validateInputs`
