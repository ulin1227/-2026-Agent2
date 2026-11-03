# -2026-Agent2
無痛交接：通靈到通透的代理助手

單一 Next.js（vinext）專案，整合了原本的 FlowLink 主程式（`agent/publish-flowlink`）與 RAG / 輔助對話服務（`feature/assist-chat-rag-guardrail-20260801`，原位於 `Agent：無痛交接/code/backend/api/rag-service`）。

## 頁面與角色分流

依《系統概述文件》的四種角色，登入後由 `lib/auth.ts` 的 `destinationFor` 導向對應入口，各入口共用左側選單 `app/components/site-sidebar.tsx`，並可從「切換身分」回到登入頁。

| 角色 | 入口 | 頁面 |
| --- | --- | --- |
| 全部 | `/` | 登入、註冊與身分選擇（FM01） |
| 新人 | `/onboarding` | 現有資料、`/onboarding/project-map` 企劃地圖、`/onboarding/roadmap` 新人上手路線圖、`/onboarding/risk-knowledge` 風險知識管理、`/onboarding/chat` 輔助對話 |
| 主管 | `/supervisor/create` | 建立交接專案、`/supervisor/review` 審核交接文件、`/supervisor/assign` 指派接手新人、`/supervisor/conversations` 對話審查、`/rag-admin` RAG 知識庫管理 |
| 離職夥伴 / 協作夥伴 | `/handoff/upload` | 交接資料上傳與經驗訪談 |

主管與離職夥伴頁面目前以 `public/legacy/*.html` 的靜態模組嵌入，尚未改寫成 React 元件。舊的 rag-service 路徑（`/project-map`、`/chat`、`/assistant` 等）會在 `next.config.ts` 重新導向到新位置。

## 目錄

- `app/`：頁面與 API route（`api/auth`、`api/onboarding`、`api/analyze`、`api/agent`、`api/assistant`、`api/knowledge`、`api/admin/rag`）
- `lib/onboarding`：上手路線圖與風險知識；`lib/rag`、`lib/mindmap.ts`、`lib/docx`：RAG 與企劃地圖
- `backend/`、`frontend/`、`shared/`：輔助對話 Agent、Guardrail、對話頁與 demo 資料
- `db/`、`drizzle/`：D1 schema 與 migration（含 RAG 資料表）
- `data/`：Project ORBIT 交接 demo 文件
- `docs/rag/`：RAG 架構、實驗與交接文件（內文路徑仍以原 rag-service 為準）

## 開發

需要 Node.js 22.18 以上（測試直接載入 `.ts` 檔）。

```bash
npm ci
cp .env.example .env.local   # 填入自己的金鑰，不要 commit
npm run db:migrate:local     # 第一次使用登入功能前，建立本機 D1 資料表
npm run dev
```

```bash
npm test   # RAG 單元測試 + 建置 + 頁面渲染與路由切換測試
```
