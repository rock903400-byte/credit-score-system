# credit-score-system

> 信用評分系統 — 信用評分模擬與法規檢索平台

## 功能特色

- **計算核心引擎**：基於 `core.js` 的 20KB 輕量信用評分與條件規則判定核心。
- **前端互動 UI**：基於 `ui.js` 的 75KB 用戶表單與分數計算動態呈現。
- **大數據模擬測試**：提供 1,000 / 10,000 筆社員信用試算的壓力測試指令碼。
- **法規文字檢索**：內建 438KB `regulation_text.txt` 儲互社法規條文與推論說明。

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
├── simulation.js       # 社員模擬計算腳本
└── regulation_text.txt # 儲互社法規文字庫
```

## License

MIT
