# 信用評分系統 — AGENTS.md

## Run

- Open `index.html` directly, or `npm run serve` → http://localhost:8765 (set `PORT` env to change).
- After `npm install`, run `npx playwright install chromium` once before E2E.

## Commands

| Command                | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `npm run format`       | Prettier, rewrites all files                                                 |
| `npm run lint`         | ESLint (3 rules off: `no-console`, `no-unused-vars`, `no-undef`)             |
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
- **All functions are globals** (no module exports). The names `pmt`, `stripEmoji`, `computeScore`, `applyRegulatoryVetoes`, `determineGrade`, `validateInputs`, `renderDashboard`, `calculateLoan` are all top-level. `pmt()` in particular is used by `ui.js`, `core.js`, and `simulate_*.js` — do not shadow it.
- `simulation.js` is a legacy 1000-case runner (no package.json script); use `simulate:1k` instead.

## Gotchas

- `core.js` has no input validation. UI `<select>`s bound to numeric scores must keep values within option ranges — out-of-range inputs can still produce out-of-range sub-scores (the `total` is clamped 0–100, sub-scores are NOT).
- `renderGuarantorRows(count)` wipes `#guarantorList.innerHTML`. Snapshot row data first, then call, then re-bind previews.
- `calculateLoan()` already has a `try/catch`; adding another masks real bugs.
- SVG `<tspan>` text must be set via `.textContent`; `innerText` silently fails in Chromium.
- `#shareHint` has inline `style="display:none"` in `index.html` — toggling the class is not enough; set `style.display = 'block' | 'none'` directly.
- `core.js` exports are **not** type-checked (`tsconfig.json` includes only `**/*.ts`). The only `.ts` file is `dummy.ts`; keep it that way or update the include pattern.

## Business rules

- 14 veto rules in `applyRegulatoryVetoes`: age >75 (硬否決), 7-year (must be real-estate), 30-year max for secured, LTV caps, 120% mortgage registration, collateral='12' amount cap, JCIC `veto`, purpose `veto`, etc. See `rationale.html` for the bug history.
- Age penalties use **strict** `>`:
  - `maturity > 75` → hard veto (in `applyRegulatoryVetoes`).
  - `maturity > 70` → –10.
  - `maturity > 65` → –5.
- Credit ceiling:
  - `collateral='10'` (足額不動產抵押) → min(10 M, appraisal × LTV).
  - `collateral='12'` (足額股金內借款) → `min(10 M, shares)`. Only valid for `years ≤ 7`; for longer terms, rule ④ (7-year) fires first.
  - otherwise → `shares + 1 M`.
- Default `<option>` for `#collateral` is `'12'`. If `proposedLoan > shares`, set to `'5'` or `'10'` to avoid silent veto.
- Protection score capped at 20 (collateral 12 + guarantor 9 + guarantor-DSR 5 would otherwise exceed 100).
- `pmt()` is a simplified first-period formula: `principal / months + principal × rate / 2`. Not the standard amortizing PMT — `computeMaxLoan` does the real math separately.
- Credit scores are written to `localStorage` as a debounced draft under `cu_form_draft`; Report ID sequence uses `cu_seq_YYYYMMDD` keys.

## E2E quirks

- `playwright.config.js` starts `serve.js` on port 8765 via `webServer`; locally `reuseExistingServer` is on (CI off). Don't run your own `serve.js` in parallel.
- After filling inputs, `await page.waitForTimeout(100)` so the debounced localStorage draft saves before reload.
- `#gaugeScoreVal` is a `<tspan>`; use `.textContent()` not `.innerText()`.
- When a `<select>` is disabled (e.g. `collateral` after `years > 7`), `selectOption()` may timeout; set value via `page.evaluate(() => el.value = '5')`.
- On failure: screenshot, trace (`.zip`), and video are saved to `test-results/`. View a trace with `npx playwright show-trace <path>`.
- CI: `e2e.yml` runs Playwright with chromium only, uploads `test-results/` + `playwright-report/` on failure. `deploy.yml` runs unit tests then deploys `main` to GitHub Pages on every push.
