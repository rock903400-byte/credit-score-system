# 信用評分系統 — AGENTS.md

## Project overview

Single-page static HTML tool for credit union loan assessment. No build step, no dependencies, no tests.

- `index.html` — monolithic app (HTML+CSS+JS, ~1346 lines)
- `rationale.html` — business logic documentation
- `.github/workflows/deploy.yml` — auto-deploys `main` to GitHub Pages

## How to run

Open `index.html` in any browser. No server required.

## Architecture

- All logic in one file: `index.html`
- Constants section: `LONG_TERM_YEARS=7`, `GRADE_THRESHOLDS`, `GRADE_DTI_LIMITS`, `GUARANTOR_SCORE_TABLE` at line ~727
- Key functions:
  - `computeScore(input)` — total score (35% repayment + 25% people + 20% protection + 10% purpose + 10% perspective)
  - `applyRegulatoryVetoes(input)` — 8 hard veto rules (collateral, JCIC, age, DTI, etc.)
  - `applyLegalCeiling(input, maxLoanLimit)` — legal borrowing caps (NATURAL_PERSON_CAP, `shares + 1M`)
  - `computeMaxLoan(input, maxDti)` — reverse-calculates loan amount from DTI limit using PMT
  - `renderDashboard(result)` / `renderPrintReport(result)` — UI rendering
- Monthly payment uses standard PMT formula: `P * r * (1+r)^n / ((1+r)^n - 1)`

## Key behaviors

- **7-year rule** (`line 930-933`): `years > 7` requires collateral = `'10'` (real estate). Auto-switches if years > 7, disables non-real-estate options.
- **Guarantors**: dynamic rows (0-5), per-person name/income/debt. Score = `GUARANTOR_SCORE_TABLE[count]` + worst DSR among guarantors.
- **Age**: hard veto at maturity > 75 (`line 950-952`), soft penalty at > 65/70 (`line 883-885`). Under 18 requires guardian consent.
- **Credit ceiling**: `collateral in ('10','12')` → 10M cap; else → `shares + 1M`.

## Key constants (line ~727)

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

Open `index.html` in browser and click **開始授信評分** to test. No test framework exists.

## Deploy

Push to `main` — GitHub Actions auto-deploys to GitHub Pages via `.github/workflows/deploy.yml`.

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
