# 信用評分系統 — AGENTS.md

Single-page static HTML tool for credit union loan assessment. No build step, no dependencies.

## How to run

Open `index.html` in any browser (double-click or `file:///`).

## How to test

```
node test.js
```

59 unit tests covering: PMT, formatAmount, escapeHtml, validateInputs, validateInputsByField, computeScore, DSR score tiers, applyRegulatoryVetoes, determineGrade, computeMaxLoan, applyLegalCeiling.

Uses Node.js `vm` sandbox to extract and execute `core.js` directly — no browser, no DOM mock needed.

## File structure

- `core.js` — pure business logic (no DOM), testable in Node via vm sandbox
- `ui.js` — DOM-dependent rendering, event handling, form draft, accessibility
- `style.css` — all visual styles (light/dark theme via `prefers-color-scheme`, responsive, print)
- `index.html` — HTML structure only; loads `core.js` then `ui.js`
- `test.js` — 43 automated regression tests
- `rationale.html` — business logic / scoring rationale documentation
- `.github/workflows/deploy.yml` — pushes `main` → GitHub Pages; runs `node test.js` as CI gate

## Architecture gotchas (hard-earned)

- **SVG `<tspan>` text**: `innerText` setter silently fails in Chromium for SVG elements. Always use `.textContent` to update `<tspan>` content (`ui.js:199`).
- **`calculateLoan()`** is wrapped in `try/catch` (`ui.js:384`). Any error logs to console and shows `alert()` — don't let the catch mask bugs.
- **`renderGuarantorRows(count)`** resets `innerHTML` on `#guarantorList`. Always snapshot existing data before calling, then restore values and re-bind preview events afterward. See `loadFormDraft()` for the correct pattern.
- **`incomeStability` + `tenure`** replaced the old single `stability` field. In `computeScore`, they sum to `stabilityScore` (max 9+6=15). Tests reference both fields in input objects.
- **`stripEmoji()`** (`core.js:31`) removes emoji from `statusText` for print layout. Used in `renderPrintReport`.
- **`getReportSeq()`** (`core.js:51`) generates daily report IDs (`CU-YYYYMMDD-NNNN`). Falls back to in-memory counter if `localStorage` is blocked (private browsing, group policy).

## Key behaviors

- **7-year rule**: `years > 7` requires `collateral = '10'` (real estate). `updateCollateralByYears()` auto-switches the select and disables non-`10` options.
- **30-year rule**: `years > 30` is a hard veto (擔保放款辦法第三條之一: secured loans max 30y for self-use house ≤20y old, 20y otherwise). `20 < years ≤ 30` shows `#yearsHint` notice. 9 veto rules total (source-count test in test.js).
- **Collateral '12' rule**: `years ≤ 7 && collateral === '12'` allows loan only if `proposedLoan <= shares`; otherwise veto (rule ⑤). `applyLegalCeiling` caps '12' at `min(NATURAL_PERSON_CAP, shares)`.
- **Age**: hard veto at maturity >75, soft penalty at >70 (−10) and >65 (−5) — checked in descending order. Under 18 requires guardian consent; borrow cap = `shares - internalBalance`.
- **Credit ceiling**: `collateral '10'` → 10M cap (`NATURAL_PERSON_CAP`); `'12'` → `min(10M, shares)`; else → `shares + 1M` (`CREDIT_FLOOR_PER_SHARE`).
- **Protection score** is capped at 20 (`Math.min`) — collateral 12 + guarantors 9 + guarantor-DSR 5 would otherwise reach 26 and push total past 100. Gauge number and `p_score` clamp display to 0–100.
- **Score breakdown**: `.score-breakdown` in resultCard renders 5P bars (`bd_ability/bd_credit/bd_protection/bd_purpose/bd_perspective` + `_val` spans, `bd_age_val`) from `scoreDetail`; print report mirrors via `p_score_*` spans. `peopleScore` can be negative (−20 option) — bar width clamps to 0, number shows raw.
- **`#shareHint` visibility**: index.html ships it with inline `display:none`; a CSS class alone cannot override inline style, so `renderDashboard` must set `style.display = 'block'` when showing (this was once a silent bug — the hint never appeared).
- **DTI progress scale**: `.progress-scale` labels are absolutely positioned at true percents (0/30/50/70/100); `.progress-veto-marker` is the fixed dashed line at 70% (veto), `#progressLimit` is the per-grade solid marker. Don't revert to `space-between` labels — positions lie.
- **Warning boxes** use shared classes `.notice-warn` (+`.notice-warn-strong`), `.overflow-badge`, `.tip-box` — all have dark-mode overrides. Don't add new inline-styled colored boxes; they break `prefers-color-scheme: dark`.
- **Inline validation**: `calculateLoan()` calls `validateInputsByField()` → `applyFieldErrors()` → clear + scroll to first error element. Errors show as red `.has-error` border + `.error-msg` span below the field. Cleared on successful validation.
- **Form draft**: All fields (including guarantor rows) saved to `localStorage['cu_form_draft']` on every `input`/`change`. Restored on `DOMContentLoaded`. "清除草稿" button calls `clearFormDraft()` + `location.reload()`.
- **Status text** uses no "建議" language. Vetoed → "不予核貸", score < 60 → "請專職/幹部審慎評估", DTI over limit → "額度超限", otherwise → "評分供專職/幹部裁量參考".

## Constants (core.js)

```js
DSR_VETO_THRESHOLD       = 0.70
DSR_SCORE_TIERS          = [[0.40,20],[0.45,18],[0.50,16],[0.55,13],[0.60,10],[0.65,6],[0.70,3]]  // 每5%一檔，[上限(不含),分數]，≥70%→0
AGE_HARD_VETO            = 75
AGE_SOFT_PENALTY         = 70
AGE_SOFT_PENALTY_MILD    = 65
AGE_SCORE_HARD           = -10
AGE_SCORE_MILD           = -5
NATURAL_PERSON_CAP       = 10_000_000
CREDIT_FLOOR_PER_SHARE   = 1_000_000
LONG_TERM_YEARS          = 7
SECURED_YEARS_STANDARD   = 20
MAX_SECURED_YEARS        = 30
MAX_GUARANTORS           = 5
GUARANTOR_SCORE_TABLE    = { 0:0, 1:4, 2:6, 3:7, 4:8, 5:9 }
GRADE_THRESHOLDS         = { A: 90, B: 80, C: 70, D: 60 }
GRADE_DTI_LIMITS         = { A: 0.60, B: 0.50, C: 0.40, D: 0.30 }
```

## Collateral options

| value | meaning |
|---|---|
| `12` | 足額股金內借款 (as long as `proposedLoan <= shares`) |
| `10` | 足額不動產抵押 |
| `5` | 不足額擔保或純信用(股金2倍內) |
| `0` | 純信用借款 (超過股金2倍) |

## Collapsible section pattern

Each collapsible card follows: `.card.collapsible > .section-title[role="button"] + .card-body`. JS sets `aria-expanded`/`aria-controls`, Enter/Space toggle. CSS uses `max-height` transition on `.card-body` when `.collapsed` toggled on parent.
