# RAG 後端交接

RAG 服務原始碼位於 `rag-service/`，測試用 DOCX 位於同層 `data/`。

主要接口：

- `POST /api/knowledge/documents`：上傳 DOCX 並建立索引。
- `GET /api/knowledge/documents?projectId=...`：列出已索引文件。
- `DELETE /api/knowledge/documents`：刪除文件、chunks 與原始檔。
- `POST /api/assistant/query`：依 `projectId` 查詢 Top-K evidence，供 LLM 生成有引用的回答。

請先閱讀 `rag-service/docs/RAG_INTEGRATION.md`。本機設定請複製
`rag-service/.env.example` 為 `.env.local`，正式環境的服務端串接使用
`Authorization: Bearer <RAG_SERVICE_API_KEY>`；不要提交 `.env.local` 或任何 API key。

驗證方式：

```powershell
cd rag-service
pnpm install
pnpm run lint
pnpm run test
```

部署時使用 `RAG_STORAGE_MODE=d1`：原始 DOCX 存 R2，文件 metadata、chunks、
embedding 與檢索紀錄存 D1。本機 `memory` 模式只供開發測試，重啟後資料會清空。
