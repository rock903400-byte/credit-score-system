# 信用評分系統 — AGENTS.md

## Run

- Open `index.html` directly (no dev server) or `npm run serve` → http://localhost:8765.
- Node 20 recommended; run `npm install` after cloning.

## Toolchain

- `npm run format` – Prettier, rewrites all tracked files.
- `npm run lint` – ESLint (`.eslintrc.json` disables `no-unused-vars` and `no-undef`).
- `npm run type-check` – TypeScript `tsc --noEmit` (only `**/*.ts`; `core.js`/`ui.js` are not checked).
- `npm test` – unit tests (`node test.js`, runs `core.js` in a VM, no DOM).
- `npm run test:e2e` – Playwright E2E suite (first run `npx playwright install chromium`).
- `npm run test:all` – unit tests then E2E.

## Workflow order

Always run in this sequence:  
`npm run format` → `npm run lint` → `npm run type-check` → `npm test`

## Core architecture

- `core.js` contains pure business logic, no DOM. Used by `ui.js` and unit tests via VM sandbox.
- `ui.js` handles DOM, drafts, validation, and report rendering.
- `serve.js` is a minimal static file server (used by Playwright and manual testing). Default port 8765; set `PORT` env to change.
- All functions (`pmt`, `stripEmoji`, `computeScore`, …) are globals; there are no module exports.

## Gotchas (easy to miss)

- SVG `<tspan>` text must be set via `.textContent`; `innerText` fails in Chromium.
- `calculateLoan()` already has a `try/catch`; adding another masks bugs.
- `renderGuarantorRows()` clears `#guarantorList` innerHTML – snapshot data before calling and re‑bind previews.
- `#shareHint` has inline `display:none`; show it with `style.display = 'block'`.
- Age penalties use strict `>`:
  - `maturity > 75` → hard veto.
  - `> 70` → –10 points.
  - `> 65` → –5 points.
- Collateral `'12'` (足額股金內借款) is only valid for `years ≤ 7`. For longer terms rule ④ (7‑year) applies first.
- Default `<option>` for `#collateral` is `'12'`. If `proposedLoan > shares` set collateral to `'5'` or `'10'` to avoid silent veto.
- `pmt()` is a global; do not shadow it. Uses a simplified average formula (`principal / months + principal * rate / 2`), not the standard PMT formula.
- `setCalcLoading(false)` must re‑enable `#btnCalc` (`btn.disabled = false`).

## Business rule highlights

- 14 veto rules in `applyRegulatoryVetoes` (age >75, 7‑year, 30‑year, LTV limits, collateral caps, JCIC/purpose veto, etc.).
- Credit ceiling:
  - `collateral='10'` → 10 M cap.
  - `collateral='12'` → `min(10 M, shares)`.
  - otherwise → `shares + 1 M`.
- Protection score capped at 20 (collateral 12 + guarantor 9 + guarantor‑DSR 5 would otherwise exceed 100).

## E2E quirks

- `playwright.config.js` starts `serve.js` on port 8765 (`reuseExistingServer` in CI). Ensure the server is running locally if not using CI.
- After filling inputs, wait a short timeout (`await page.waitForTimeout(100)`) so the debounced localStorage draft saves before reloading.
- `#gaugeScoreVal` is a `<tspan>`; use `.textContent()` in Playwright, not `.innerText()`.
- When a `<select>` is disabled (e.g. `collateral` after `years > 7`), `selectOption()` may timeout; set the value via `page.evaluate(() => el.value = '5')`.
- Screenshots and traces are saved to `test-results/` on failure; view a trace with `npx playwright show-trace path/to/trace.zip`.
