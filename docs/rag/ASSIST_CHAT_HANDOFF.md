# FM06 Assist Chat Handoff

這份文件是給接手同學看的快速交接。此模組是「無痛交接」專題中的輔助對話介面，負責新人聊天頁、管理者檢視頁、Agent 回覆 API，以及 output guardrail / RAG evidence 顯示。

## 這包程式負責什麼

- 新人對話頁：`/chat`
- 管理者對話與 Guardrail 檢視頁：`/admin/conversations`
- Agent 回覆 API：`/api/agent/reply`
- 舊版相容聊天 API：`/api/chat`
- RAG evidence 串接：提供 `/api/assistant/query`，讓其他後端或 LLM 服務查詢 retrieved chunks
- Slack / Notion 語氣與交接資料串接：沒有 token 時會自動走 mock / 本地 demo 資料

## 專案位置

在 repo 裡的主要程式位置：

```text
Agent：無痛交接/code/backend/api/rag-service
```

同層也有 RAG 後端交接摘要：

```text
Agent：無痛交接/code/backend/api/RAG_HANDOFF.md
```

## 主要資料夾

```text
rag-service/
├── app/          # Next App Router 入口，只接頁面和 API route
├── frontend/     # 前端頁面與互動元件
├── backend/      # Agent、API handler、connector、guardrail、DB
├── shared/       # 前後端共用型別與 demo data
├── docs/         # RAG 架構、演算法、串接文件
├── db/           # D1 / Drizzle schema 與 store
├── drizzle/      # migration
├── tests/        # RAG unit test 與 rendered HTML 測試
└── .env.example  # 環境變數範例
```

## 開發環境

需要 Node.js：

```text
Node.js >= 22.13.0
```

安裝依賴：

```bash
cd "Agent：無痛交接/code/backend/api/rag-service"
pnpm install
```

建立本機環境變數：

```bash
cp .env.example .env.local
```

請把自己的 key 填在 `.env.local`，不要 commit `.env.local`。

## 最小可跑設定

如果只想先看畫面、不接正式 Slack / Notion / RAG，可以先用 mock 或 lexical 模式：

```env
WORKSPACE_CONNECTORS=mock
RAG_STORAGE_MODE=memory
RAG_RETRIEVAL_MODE=lexical
RAG_USE_DEMO_SOURCES=true
```

啟動主程式：

```bash
pnpm run dev
```

預設開啟 dev server 顯示的本機網址，常見是：

```text
http://localhost:3000
```

新人聊天頁：

```text
/chat
```

管理者 RAG 頁：

```text
/rag-admin
```

## 正式 RAG 設定

正式 RAG 需要 Cloudflare Workers AI embedding key。系統會把交接文件切 chunks，呼叫 embedding model，並用 lexical / vector hybrid 檢索 evidence。

建議設定：

```env
RAG_STORAGE_MODE=d1
RAG_RETRIEVAL_MODE=hybrid
RAG_HYBRID_FUSION_MODE=fixed
RAG_SERVICE_API_KEY=replace-with-a-long-random-secret
RAG_EMBEDDING_API_KEY=your-cloudflare-ai-token
RAG_EMBEDDING_BASE_URL=https://api.cloudflare.com/client/v4/accounts/your-account-id/ai/v1
RAG_EMBEDDING_MODEL=@cf/baai/bge-m3
RAG_PROJECT_ID=project-orbit
RAG_RETRIEVAL_TOP_K=8
RAG_USE_DEMO_SOURCES=false
```

如果暫時沒有 Cloudflare embedding key，可以改用關鍵字檢索：

```env
RAG_RETRIEVAL_MODE=lexical
RAG_USE_DEMO_SOURCES=true
```

但這只適合本機 demo，不代表正式 embedding / hybrid RAG 成效。

## 需要哪些 API / Key

必備：

- `OPENAI_API_KEY`：給 Agent / 文件分析使用
- `RAG_SERVICE_API_KEY`：其他服務呼叫 RAG API 時使用的 bearer token
- `RAG_EMBEDDING_API_KEY`：Cloudflare Workers AI token，正式 hybrid / embedding RAG 會用到

可選：

- `SLACK_BOT_TOKEN`：抓 Slack 對話紀錄與前同事語氣
- `NOTION_API_KEY`：讀 Notion 交接頁面或 database
- `OPENCLAW_AUTH_TOKEN`：若要改走本機 OpenClaw gateway 才需要

更多 API/key 說明：

```text
docs/API_REQUIREMENTS_FOR_TEAMMATES.md
```

## 啟動順序

一般 demo：

```bash
cd "Agent：無痛交接/code/backend/api/rag-service"
pnpm run dev
```

正式檢查：

```bash
pnpm run lint
pnpm run test
```

## 怎麼確認有沒有接到 RAG

1. 啟動 dev server
2. 開 `/chat` 或 `/rag-admin`
3. 問一個交接相關問題，或在 RAG admin 做查詢
4. 檢查回傳資料裡是否有 `retrievalStrategy` 和 `evidence`

如果其他服務要呼叫 RAG：

```text
POST /api/assistant/query
```

Header：

```http
Authorization: Bearer <RAG_SERVICE_API_KEY>
Content-Type: application/json
```

Body：

```json
{
  "projectId": "project-orbit",
  "question": "發票資料不符時要怎麼處理？",
  "topK": 5
}
```

## 主要 API

### 查詢 RAG evidence

```http
POST /api/assistant/query
Content-Type: application/json
Authorization: Bearer <RAG_SERVICE_API_KEY>
```

### 上傳交接文件並建立索引

```http
POST /api/knowledge/documents
Content-Type: multipart/form-data
Authorization: Bearer <RAG_SERVICE_API_KEY>
```

表單欄位：

- `projectId`：必填，例如 `project-orbit`
- `file`：必填，DOCX 檔案
- `relativePath`：選填，文件在知識庫裡的相對路徑

### 列出已索引文件

```http
GET /api/knowledge/documents?projectId=project-orbit
Authorization: Bearer <RAG_SERVICE_API_KEY>
```

### 刪除文件

```http
DELETE /api/knowledge/documents
Content-Type: application/json
Authorization: Bearer <RAG_SERVICE_API_KEY>
```

### Agent 回覆

```http
POST /api/agent/reply
Content-Type: application/json
```

## 重要程式位置

- `backend/services/agent.ts`：Agent 回覆邏輯與 guardrail 判斷
- `backend/api/agent-reply.ts`：`/api/agent/reply` handler
- `backend/connectors/rag-retriever.ts`：呼叫 RAG service 的 connector
- `backend/connectors/workspace-connectors.ts`：Slack / Notion / mock workspace 資料來源
- `frontend/pages/ChatPage.tsx`：新人聊天頁
- `app/rag-admin/page.tsx`：RAG 管理頁入口
- `app/rag-admin/rag-admin-client.tsx`：RAG 管理頁互動
- `shared/data/fm06.ts`：FM06 demo 資料與型別
- `shared/data/handoff-docs.ts`：內建交接文件資料
- `lib/rag/`：RAG chunking、indexing、retrieval、hybrid fusion、embedding client
- `db/rag-store.ts`：D1 / R2 持久化存取

## 接手時最容易踩到的點

- `.env.local` 不要 push 到 GitHub。
- `RAG_SERVICE_API_KEY` 是自己設定的共用密碼，其他服務呼叫 RAG 時要用同一串。
- 如果 `RAG_RETRIEVAL_MODE=hybrid` 或 `embedding`，一定要有 `RAG_EMBEDDING_API_KEY`。
- 如果只啟動前端，但沒有任何 indexed documents，查詢可能會沒有 evidence。
- Slack / Notion 沒有設定時不是壞掉，是預期會走 mock。
- RAG evidence 只用來支撐 factual confidence，不應把 Slack / Notion 語氣資料混進正式 factual confidence。

## 補充文件

- `README.md`：模組功能、啟動方式與整體說明
- `docs/RAG_INTEGRATION.md`：RAG API 串接規格
- `docs/RAG_ARCHITECTURE.md`：RAG 持久化架構
- `docs/RAG_THREE_LAYER_ALGORITHM.md`：hybrid / RRF 檢索演算法
- `docs/API_REQUIREMENTS_FOR_TEAMMATES.md`：API / key 需求說明
