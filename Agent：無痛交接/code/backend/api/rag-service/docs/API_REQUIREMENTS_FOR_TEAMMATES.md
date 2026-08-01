# API 需求說明：跑「無痛交接 / RAG Service」需要準備哪些 API

同學如果要在自己的電腦跑這份程式，主要會用到下面這幾個 API / key。請不要把 key 傳到 GitHub，也不要寫在前端程式裡；統一放在 `.env.local` 或部署平台的 secrets。

## 一、一定要準備

### 1. OpenAI API Key

用途：給企劃地圖 / 文件分析 / Agent 生成內容使用。

需要填的環境變數：

```env
OPENAI_API_KEY=sk-your-project-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.6-terra
```

如果使用 OpenAI 相容的代理服務，`OPENAI_BASE_URL` 要改成該服務商提供、包含 `/v1` 的網址。

### 2. Cloudflare Workers AI / Embedding API Token

用途：RAG service 會把交接文件切成 chunks，呼叫 embedding model 轉成向量，之後才能做向量檢索或 hybrid 檢索。

需要準備：

- Cloudflare Account ID
- 可以呼叫 Workers AI 的 API Token
- Embedding model，目前程式預設使用 `@cf/baai/bge-m3`

需要填的環境變數：

```env
RAG_EMBEDDING_API_KEY=your-cloudflare-ai-token
RAG_EMBEDDING_BASE_URL=https://api.cloudflare.com/client/v4/accounts/your-account-id/ai/v1
RAG_EMBEDDING_MODEL=@cf/baai/bge-m3
```

注意：`RAG_EMBEDDING_BASE_URL` 裡的 `your-account-id` 要換成自己的 Cloudflare Account ID。

### 3. RAG Service API Key

用途：其他後端或 LLM service 呼叫 RAG service 時，會用這個 key 當作 server-to-server bearer token，避免任何人都能亂查或上傳文件。

這個 key 不需要去外部平台申請，可以自己產生一串夠長的隨機字串，但呼叫端和 RAG service 兩邊要填一樣。

```env
RAG_SERVICE_API_KEY=replace-with-a-long-random-secret
```

呼叫 RAG API 時 header 會長這樣：

```http
Authorization: Bearer <RAG_SERVICE_API_KEY>
```

## 二、RAG 相關設定

如果要跑正式 RAG，建議這樣設定：

```env
RAG_STORAGE_MODE=d1
RAG_RETRIEVAL_MODE=hybrid
RAG_HYBRID_FUSION_MODE=fixed
RAG_PROJECT_ID=project-orbit
RAG_RETRIEVAL_TOP_K=8
RAG_USE_DEMO_SOURCES=false
```

如果只是本機 demo，不想先接 Cloudflare embedding，也可以先改成：

```env
RAG_STORAGE_MODE=memory
RAG_RETRIEVAL_MODE=lexical
RAG_USE_DEMO_SOURCES=true
```

但這樣只會用文字關鍵字檢索或 demo sources，不能代表正式 embedding / hybrid RAG 的結果。

## 三、可選 API

下面這些不是跑基本功能的必要條件，沒有設定時程式會使用 mock 或本地資料。

### Slack Bot Token

用途：抓 Slack 對話紀錄，讓 Agent 可以參考前同事的語氣和專案討論脈絡。

```env
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL_IDS=C0123456789,C9876543210
SLACK_SENIOR_USER_IDS=U0123456789
SLACK_TONE_CHANNEL_IDS=C0123456789
SLACK_TONE_USER_IDS=U0123456789
```

### Notion Integration Key

用途：讀 Notion 頁面或 database 裡的交接資料，併入 Agent 的知識來源。

```env
NOTION_API_KEY=secret_your_notion_integration
NOTION_PAGE_IDS=https://app.notion.com/your-page-url
NOTION_DATABASE_ID=your-database-id
```

### OpenClaw Gateway

用途：如果有跑本機 OpenClaw gateway，Agent 回覆可以改走 OpenClaw；沒有設定會自動使用本地 mock。

```env
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_AUTH_TOKEN=your-openclaw-gateway-token
OPENCLAW_AGENT_ID=main
OPENCLAW_MODEL=openclaw
OPENCLAW_TIMEOUT_MS=30000
```

## 四、最小可跑版本 `.env.local`

如果同學要跑正式 RAG，至少先準備這份：

```env
OPENAI_API_KEY=sk-your-project-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.6-terra

RAG_STORAGE_MODE=memory
RAG_RETRIEVAL_MODE=hybrid
RAG_HYBRID_FUSION_MODE=fixed
RAG_EMBEDDING_API_KEY=your-cloudflare-ai-token
RAG_EMBEDDING_BASE_URL=https://api.cloudflare.com/client/v4/accounts/your-account-id/ai/v1
RAG_EMBEDDING_MODEL=@cf/baai/bge-m3

RAG_SERVICE_API_KEY=replace-with-a-long-random-secret
RAG_PROJECT_ID=project-orbit
RAG_RETRIEVAL_TOP_K=8
RAG_USE_DEMO_SOURCES=false
```

如果有另一個主程式要呼叫 RAG service，呼叫端和 RAG service 的 `RAG_SERVICE_API_KEY` 要一樣。

## 五、RAG Service 主要 API

### 查詢 evidence

```http
POST /api/assistant/query
Content-Type: application/json
Authorization: Bearer <RAG_SERVICE_API_KEY>
```

Request body：

```json
{
  "projectId": "project-orbit",
  "question": "發票資料不符時要怎麼處理？",
  "topK": 5
}
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

Request body：

```json
{
  "projectId": "project-orbit",
  "documentId": "doc_..."
}
```

## 六、給同學的提醒

- 不要把 `.env.local`、API key、token push 到 GitHub。
- Cloudflare embedding key 是 RAG 正式檢索最重要的 key；如果沒有它，`hybrid` / `embedding` 模式會失敗。
- 如果只是先看畫面，可以先用 demo / lexical 模式；但正式 demo 前請改回 Cloudflare embedding。
- `RAG_SERVICE_API_KEY` 是自己設定的共用密碼，呼叫端和 RAG service 要填同一串。
