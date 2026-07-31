# RAG 基礎架構

這套 RAG 鏈路與既有 `/api/analyze` 完全分開。`/api/analyze` 仍處理瀏覽器當次上傳；RAG 則把「來源列舉 → 差異同步 → DOCX 解析 → chunk → 索引 → 專案隔離檢索 → 可引用證據」拆成可替換的小型介面。

## 模組與替換邊界

| 邊界 | 第一版實作 | 正式環境替換位置 |
| --- | --- | --- |
| `KnowledgeSource` | `LocalFolderKnowledgeSource`，僅供 Node.js 開發／測試 | 實作同介面，串接同系統文件庫 API、R2 或其他受控儲存；不可接受前端傳入任意實體路徑 |
| `DocumentRepository` | 本機 `MemoryDocumentRepository`；部署 `D1DocumentRepository` | 若日後移轉資料庫，保留 checksum、來源範圍與 replace/delete 契約 |
| `EmbeddingProvider` | `OpenAIEmbeddingProvider`，伺服器端批次呼叫 `/embeddings` | 可替換為其他合規 embedding 服務；文件內容會傳給該服務，需先確認資料治理 |
| `VectorStore` | 本機記憶體 store；部署 `D1PersistentVectorStore`，支援 lexical、cosine 與 Fixed RRF | 資料量增加後替換為 Vectorize／其他 ANN 向量庫；保留 `projectId` filter 與 replace/delete 契約 |
| `AnswerGenerator` | `EvidenceOnlyAnswerGenerator`，不生成答案 | 受控模型服務；prompt 必須把文件內容視為不可信資料，答案引用只可使用 retrieval hits |

主要契約位於 `lib/rag/contracts.ts`。`SourceDocument` 包含穩定 `documentId`、`projectId`、`relativePath`、`fileName`、`mimeType`、`size`、`modifiedAt`、`checksum` 與可選 `version`，內容透過 `readContent()` 延遲讀取。API 不回傳根目錄或實體伺服器路徑。

## 同步語意

`POST /api/knowledge/sync` 以 `projectId + sourceKey` 為差異範圍。穩定 ID 由 `projectId + relativePath` 產生；內容 SHA-256 相同視為 `unchanged`，不解析、不重建 chunks。新增與更新會解析 DOCX 並用 `replaceDocumentChunks` 整份置換；刪除會同時刪除文件紀錄與該文件的全部 chunks。

預設 chunk 上限 1,200 字元、overlap 180 字元，集中於 `lib/rag/config.ts`。chunk metadata 保留 `projectId`、`documentId`、`relativePath`、`fileName`、`locator`、`locators`、`chunkIndex` 與內容種類；引用至少能回到原始 `fileName + locator`。

同步請求：

```json
{
  "projectId": "project-orbit",
  "source": {
    "type": "local-folder",
    "scope": "."
  }
}
```

同步是目前 request/response 內完成的短工作，回傳 `status: completed | completed_with_errors` 及 added、updated、unchanged、deleted、indexedChunks、failures 摘要。正式文件量增加時，可在 API 外層改成 queue/job，但 `IndexingService.sync()` 的契約可保留。

## 查詢語意

`POST /api/assistant/query`：

```json
{
  "projectId": "project-orbit",
  "question": "ORBIT 專案的交接風險是什麼？",
  "topK": 5
}
```

每次檢索都必須帶 `projectId`，store 會在資料庫查詢階段先過濾專案。`RAG_RETRIEVAL_MODE=lexical` 不花 embedding API 費用；`embedding` 使用真 embedding 與 cosine search；`hybrid` 啟用雙路 Top-20 與 RRF。依目前 holdout，正式預設固定為 Lexical／Vector 各 0.50、`k=10`；Adaptive 僅保留給受控實驗。詳細公式與 trace 欄位見 [三層檢索演算法](RAG_THREE_LAYER_ALGORITHM.md)。回應的 `evidence` 包含原文、分數及 citation；未設定答案生成模型時，`answerGenerated` 固定為 `false`，只提示使用者查核證據，不會把檢索片段改寫成臆測答案。

## 本機執行與測試

在 `webapp` 複製 `.env.example` 為 `.env.local`。本機來源預設為專案根目錄的 `data/無痛交接Demo資料_v2`，也可由伺服器端設定：

```env
KNOWLEDGE_LOCAL_ROOT=../data/無痛交接Demo資料_v2
RAG_RETRIEVAL_MODE=lexical
RAG_HYBRID_FUSION_MODE=fixed
RAG_EMBEDDING_MODEL=@cf/baai/bge-m3
```

接著執行：

```powershell
pnpm run test:unit
pnpm run lint
pnpm run build
pnpm run dev
```

`test:unit` 會在 Node.js 中實際讀取 demo DOCX 並走過同步與查詢 API handler。本機資料夾 adapter 會拒絕絕對 scope、`..` traversal、越界 realpath 與 symlink，忽略非 DOCX、空檔及超過 10 MB 的文件，並在讀取時再次驗證 realpath。根目錄只能由受信任的伺服器環境設定，不能來自 API body。

### 比較 lexical 與真向量檢索

在 `.env.local` 設定伺服器端的 `RAG_EMBEDDING_API_KEY`、明確的 `RAG_EMBEDDING_BASE_URL` 與 `RAG_EMBEDDING_MODEL`，然後執行：

```powershell
pnpm run rag:evaluate
```

評估使用六份跨 ORBIT、NIMBUS、LANTERN、AURORA 的 demo 文件，包含 30 題 development 與 30 題不同事實的 holdout。腳本只在 development 搜尋 query type 權重與 RRF k，鎖定後才比較 lexical、vector、固定 RRF、固定 RRF + Focus 與 Tuned ARRF 的 Hit@1/3/5、MRR@5、平均與 P95 延遲。評估支援同一問題的多組 relevant evidence，避免重疊 chunks 造成假陰性。`rag:evaluate` 會把 chunk 文字與問題送到設定的 embedding 服務並產生 API 用量；一般 `pnpm test` 使用受控假向量，不會呼叫外部服務。

本機未指定 `RAG_STORAGE_MODE` 時使用 `memory`，方便快速測試；此模式在程序重啟後會清空。部署時設定 `RAG_STORAGE_MODE=d1`，文件 metadata、chunks 與 embedding 會寫入 D1，原始 DOCX bytes 寫入 R2，因此 sync、query 不需要落在同一個 isolate。`RAG_RETRIEVAL_MODE` 或 embedding model 改變後仍必須重新建立索引，避免混用不同模型的向量。

OpenAI-compatible provider 依 `/embeddings` API 使用字串陣列批次輸入與 `float` 輸出，並驗證回傳 index、數量、有限數值與一致維度。官方請求／回應契約見 [Create embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create)。

## RAG 管理控制台

`/rag-admin` 提供管理者專用的索引狀態、文件清單、chunk 原文檢視、即時 Top-5 查詢與最近 50 筆檢索紀錄。管理 API `/api/admin/rag/overview` 會在伺服器端再次驗證權限，不依賴前端隱藏按鈕。

部署時以 Sites 轉送的已驗證使用者 email 搭配 `RAG_ADMIN_EMAILS` allowlist 授權；未登入者會導向平台登入，不在 allowlist 的帳號會看到 403。本機沒有 Sites dispatcher，因此開發模式使用明確標示的 `RAG_ADMIN_DEV_EMAIL`；此 override 在 `NODE_ENV=production` 完全停用。

每次 `/api/assistant/query` 會記錄 projectId、問題、策略、Top-K、延遲、融合權重與 citations。部署後使用 D1 `rag_retrieval_logs`；D1 未綁定的本機測試會退回最多 250 筆的程序記憶體。檢索紀錄可能包含內部問題文字與檔名，只能由管理者 API 讀取。部署設定 `RAG_STORAGE_MODE=d1` 時，文件索引也由 D1 持久保存。

## 目前限制

- 本機 `memory` 模式重啟後會清空；只有部署時的 `RAG_STORAGE_MODE=d1` 搭配 D1 `DB` 與 R2 `RAG_FILES` 才是持久化模式。
- Cloudflare Worker 無法讀取開發電腦的任意本機資料夾；部署後應使用 `POST /api/knowledge/documents`，或由保存文件的另一模組實作 `KnowledgeSource`。`local-folder` 僅供開發測試。
- 第一版只支援 DOCX，沿用 `lib/docx/parse.ts`；文件內容一律視為不可信輸入。
- D1 版本會持久保存向量，但目前採 Worker 內 exact cosine scan，限制每個 project 2,000 chunks，適合 demo／小型試作，不是假裝成大規模正式向量庫。資料量增加時應在現有 `VectorStore` 邊界替換為 Vectorize／其他 ANN backend，並在 backend 強制套用 `projectId` filter。
- 更換 embedding model、dimensions 或 chunking 設定時，正式 repository 必須記錄索引版本並重建對應向量，不能混用不同維度或模型的資料。
- 未來模擬前同事語氣時，語氣設定與事實來源必須分離：persona 只能影響表達方式，所有可驗證陳述都必須由本次 retrieval evidence 支持，模型回傳的 chunk ID 也必須由伺服器驗證。
- 同步目前為同步 HTTP 請求；大量文件應改用具冪等性的 job/queue，並為 repository 與 vector replacement 加入交易或可恢復狀態。
