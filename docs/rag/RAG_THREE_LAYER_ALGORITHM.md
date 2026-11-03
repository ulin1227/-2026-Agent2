# RAG 三層檢索演算法

實作位於 `lib/rag/hybrid.ts`。這層只負責候選召回、排名融合與可觀測資料；文件同步、chunking 與答案生成仍各自維持獨立介面。

## 第一層：雙路候選召回

`DualCandidateRetriever` 收到 `projectId + question + candidateK` 後，用 `Promise.all` 同時查詢：

- Lexical Top-20：適合專案代號、日期、路徑與文件中的原詞。
- Vector Top-20：適合同義改寫、口語問題與語意相近內容。

兩邊結果以穩定 `chunk.id` 去重。每個候選保留 `lexical.rank/score`、`vector.rank/score`、原始 chunk 及 citation metadata。延遲分別記錄 `lexicalMs`、`vectorMs`、`wallMs`、`mergeMs` 和 `totalMs`。所有底層 store 都必須先用 `projectId` 隔離，不能在合併後才過濾。

## 第二層：固定權重 RRF

`fuseCandidates()` 使用 Reciprocal Rank Fusion：

```text
fusedScore = lexicalWeight / (rrfK + lexicalRank)
           + vectorWeight  / (rrfK + vectorRank)
```

第一個基準使用 `0.5 / 0.5` 與 `rrfK=10`。某一路沒找到候選時，該路貢獻為 0。Lexical score 與 cosine score 的尺度不同，所以只留作診斷，不直接相加。輸出包含兩路 rank、原始 score、各自 contribution、fused score 與 fused rank。

## 第三層：Adaptive RRF

`profileQuery()` 是 deterministic、可測試、可解釋的問題分類器，不依賴 LLM：

| 類型 | 可觀察訊號 | Lexical / Vector 權重 |
|---|---|---:|
| exact | 大寫代號、識別碼、日期、引號詞組、路徑 | 0.70 / 0.30 |
| semantic | 為什麼、如何、風險、影響、建議、怎麼辦 | 0.30 / 0.70 |
| mixed | 同時有兩類訊號，或訊號不明顯 | 0.45 / 0.55 |

權重被限制在 0.25～0.75，避免分類規則誤判時完全關掉其中一路。trace 會保存分類原因與實際權重，因此可以逐題檢查、做消融實驗，也能日後把 classifier 換成統計模型而不改 RRF 邊界。

### ARRF-E 實驗分支（目前不啟用）

`profileQueryEvidence()` 額外建立 Evidence Focus rank：將長 chunk 依原始段落／表格列分開，以問題對「最佳局部列」的 lexical relevance 排序，再以 `wF / (1 + focusRank)` 融合。這可改善答案被長 chunk 稀釋的個案，但 15 題 holdout 的 Hit@1 為 66.7%，低於 Fixed RRF 的 86.7%，因此只保留作消融實驗，`RAG_RETRIEVAL_MODE=hybrid` 仍使用原本兩訊號 ARRF。不能以這一版宣稱 ARRF 最佳。

### Tuned ARRF 實驗

`rag:evaluate` 會在 30 題 development 上搜尋共同 `rrfK ∈ {5,10,20,40,60}`，並針對 exact、semantic、mixed 分別搜尋 0.25～0.75 的 lexical 權重；MRR@5 優先、Hit@1 次之，平手時偏好接近 0.50 與 `k=10` 的簡單設定。參數鎖定後才執行 30 題不同事實的 holdout。本輪真實 BGE-M3 搜尋收斂為三類皆 0.50/0.50、`k=10`，與 Fixed RRF 完全並列，因此沒有自適應優勢證據。

## 在 API 中啟用

`.env.local`：

```env
RAG_RETRIEVAL_MODE=hybrid
RAG_HYBRID_FUSION_MODE=fixed
RAG_EMBEDDING_API_KEY=your-embedding-provider-token
RAG_EMBEDDING_BASE_URL=https://api.cloudflare.com/client/v4/accounts/your-account-id/ai/v1
RAG_EMBEDDING_MODEL=@cf/baai/bge-m3
```

目前 holdout 以 `fixed` 勝出；只有做受控 ARRF 實驗時才改成 `adaptive`。重新啟動開發程序後，先呼叫 `/api/knowledge/sync`，再呼叫 `/api/assistant/query`。目前 hybrid store 和向量都只在同一程序的記憶體內，程序重啟後必須重新 sync；正式環境要在 `DocumentRepository`、`VectorStore` 與 `EmbeddingProvider` 介面後換成持久化服務。

Hybrid 查詢時，每筆 `evidence` 會多一個 `ranking` 物件，包含問題類型、實際權重、兩路原始 rank/score、各自 RRF contribution 與最終 fused rank；citation 仍只回傳安全的 `documentId + fileName + locator`，不回傳伺服器實體路徑。

## 測試與查看結果

```powershell
pnpm run test:unit
pnpm run rag:evaluate
```

單元測試不呼叫外部服務。`rag:evaluate` 會使用真 embedding，將六份 demo 文件、30 題 development 與 30 題不同事實的 holdout 送往設定的 embedding endpoint，並覆寫產生：

- `docs/RAG_EXPERIMENT_REPORT.md`：人類可讀的指標、逐題排名、限制與結論。
- `docs/rag-experiment-results.json`：機器可讀的參數、權重、排名與延遲。

評估腳本讓五個策略共用每題同一批 lexical/vector 候選，並加入 Fixed RRF + Focus 消融基準，避免把第三訊號的效果錯算成自適應權重的效果。

若只想離線驗證整條實驗鏈路，可暫時執行 `$env:RAG_EVALUATION_EMBEDDING='mock'; pnpm run rag:evaluate`。這會使用 deterministic feature hashing；報告會醒目標示為 mock，其數字不能用來代表真正語意向量的品質。
