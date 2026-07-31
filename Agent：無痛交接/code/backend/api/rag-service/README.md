# 無痛交接｜InsightShift

RAG 的來源同步、持久化、向量檢索與二層 Fixed RRF 設計請見 [RAG 基礎架構](docs/RAG_ARCHITECTURE.md) 與 [二層檢索演算法](docs/RAG_THREE_LAYER_ALGORITHM.md)；給組員／LLM 後端使用的完整 API 範例見 [RAG 服務串接指南](docs/RAG_INTEGRATION.md)。執行 `pnpm run rag:evaluate` 後會產生最新實驗報告。

本機管理者可開啟 `/rag-admin` 查看索引內容、RAG 狀態、即時查詢與檢索紀錄。正式部署時必須在 `RAG_ADMIN_EMAILS` 設定允許的管理者 email；企劃地圖使用 `OPENAI_*`，RAG embedding 則獨立使用 `RAG_EMBEDDING_*`。

這是一個把三份交接 DOCX 在執行時解析、分類並轉成四大核心元素心智圖的 Web app。第一階段聚焦內容分類與視覺化，不進行完備性評分、缺漏檢查或補件建議。

## 啟動

先複製 `.env.example` 為 `.env.local`，填入伺服器端使用的 OpenAI API 金鑰：

```env
OPENAI_API_KEY=sk-your-project-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.6-terra
```

若使用 OpenAI 相容代理服務，請將 `OPENAI_BASE_URL` 改為服務商提供、包含 `/v1` 但不含 `/responses` 的網址。這個值必須明確設定，程式不會在缺少網址時自行猜測，以免把金鑰送到錯誤主機。

請勿使用 `NEXT_PUBLIC_` 前綴，也不要將 `.env.local` 提交到版本控制。

接著在 `webapp` 資料夾執行：

```powershell
$env:Path = "C:\Users\cotto\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:Path"
C:\Users\cotto\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd run dev
```

開啟終端顯示的本機網址。若要先做編譯檢查，執行 `pnpm.cmd run build`。

## 目前範圍

- 使用者一次選擇三份 `.docx`，每份上限 6 MB、合計上限 15 MB。
- 伺服器直接解析 DOCX 中的段落與表格，保留檔名、段落與表格列定位。
- 單一分類 Agent 把內容整理為專案任務、決策脈絡、人員配置、歷史風險四類。
- 模型輸出使用 JSON Schema，程式再建立節點、關係與可下載的心智圖 JSON。
- 舊有 `/api/analyze` 仍不保存當次上傳文件與分類結果；RAG 的 `/api/knowledge/documents` 在部署的 `d1` 模式會把原始 DOCX 存入 R2，並把文件 metadata、chunks 與 embedding 存入 D1。目前不執行完備性評分或稽核。

完整規範位於專案根目錄的 `spec/交接完備性檢查與Agent串接規範.md`。

## 自訂品牌 ICON

將你畫好的正方形 PNG 放到 `public/brand-icon.png`，網站左側欄會自動顯示。建議使用透明背景、至少 256 × 256 px；檔案不存在時則顯示預設的 `IS` 字樣。
