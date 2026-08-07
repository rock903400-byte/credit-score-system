# credit-score-system

[![Deploy](https://github.com/rock903400-byte/credit-score-system/actions/workflows/deploy.yml/badge.svg)](https://github.com/rock903400-byte/credit-score-system/actions/workflows/deploy.yml)
[![E2E](https://github.com/rock903400-byte/credit-score-system/actions/workflows/e2e.yml/badge.svg)](https://github.com/rock903400-byte/credit-score-system/actions/workflows/e2e.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> 信用評分系統 — 信用評分模擬與規則推論平台

**線上 Demo**: https://rock903400-byte.github.io/credit-score-system/

## 功能特色

- **計算核心引擎**：基於 `core.js` 的 20KB 輕量信用評分與條件規則判定核心。
- **前端互動 UI**：基於 `ui.js` 的 75KB 用戶表單與分數計算動態呈現。
- **大數據模擬測試**：提供 1,000 / 10,000 筆授信案件試算的壓力測試指令碼。

## 技術棧

- **Frontend**: HTML5, Vanilla CSS, JavaScript (Vanilla JS)
- **Testing**: Playwright (E2E 測試), ESLint
- **Deployment**: GitHub Pages

## 快速開始

### 1. 前端頁面預覽

本專案為靜態網頁應用，可使用本機伺服器啟動：

```bash
node serve.js
```

並在瀏覽器中開啟 `http://localhost:3000`。

### 2. 執行信用評分模擬

```bash
node simulation.js
```

## 專案結構

```text
/
├── index.html          # 前端主頁面
├── core.js             # 評分核心計算邏輯
├── ui.js               # 前端 UI 動態互動邏輯
├── rationale.html      # 評分推論與規則說明頁面
├── simulation.js       # 授信案件模擬計算腳本
```

## License

MIT
