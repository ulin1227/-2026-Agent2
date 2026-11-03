# RAG 三層檢索演算法實驗報告

產生時間：2026-07-31T12:15:15.733Z

## 摘要

本次使用 30 題 development 與 30 題不同事實的 holdout，索引 6 份 DOCX、9 個 chunks，比較 Lexical、Vector、Fixed RRF、Fixed RRF + Focus 與 **Tuned ARRF**。候選集合 Recall@20 為 100.0%；依 holdout 的 Hit@5、MRR@5、Hit@1 排序，本次最佳為 **Fixed RRF、Tuned ARRF**。

Tuned ARRF 相對 Fixed RRF 的 holdout Hit@1 差異為 +0.0%，MRR@5 差異為 +0.0000。參數只由 development 選出，holdout 未參與權重搜尋。

## 實驗設定

- 專案隔離鍵：`rag-evaluation-orbit`
- Embedding 模型：`@cf/baai/bge-m3`
- 第一層候選數：Lexical Top-20 + Vector Top-20，並行查詢後以 chunk id 去重
- 第二層：Fixed RRF，Lexical/Vector/Focus 權重 0.50/0.50/0.00
- 公平消融基準：Fixed RRF + Focus，權重 0.40/0.40/0.20
- Tuned ARRF development-only 搜尋：`k ∈ {5,10,20,40,60}`，各 query type 的 lexical 權重由 0.25～0.75、步長 0.05 搜尋
- 鎖定設定：`k=10`；exact 0.50/0.50、semantic 0.50/0.50、mixed 0.50/0.50
- Evidence Focus：將 chunk 內每個原始段落／表格列獨立做 lexical relevance，再轉成 rank；不與遠端 embedding raw score 相加
- RRF 公式：`wL/(k+rankL) + wV/(k+rankV)`；Tuned ARRF 的 k 與權重完全由 development 搜尋後鎖定
- 最終評估深度：Top-5
- 問題類型數：exact 39、semantic 5、mixed 16
- 向量儲存：記憶體 cosine search（僅實驗，不適合正式環境）

## 整體結果

| Split | 策略 | Hit@1 | Hit@3 | Hit@5 | MRR@5 | 平均查詢延遲 ms | P95 延遲 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| development | Lexical only | 86.7% | 100.0% | 100.0% | 0.9278 | 1.192 | 2.660 |
| development | Vector only | 83.3% | 100.0% | 100.0% | 0.9111 | 324.307 | 1483.031 |
| development | Fixed RRF | 96.7% | 100.0% | 100.0% | 0.9833 | 326.723 | 1485.553 |
| development | Fixed RRF + Focus | 86.7% | 90.0% | 100.0% | 0.9083 | 326.717 | 1485.551 |
| development | Tuned ARRF | 96.7% | 100.0% | 100.0% | 0.9833 | 326.712 | 1485.548 |
| holdout | Lexical only | 86.7% | 100.0% | 100.0% | 0.9222 | 1.006 | 1.132 |
| holdout | Vector only | 83.3% | 93.3% | 100.0% | 0.8983 | 229.002 | 515.499 |
| holdout | Fixed RRF | 93.3% | 100.0% | 100.0% | 0.9667 | 231.283 | 518.042 |
| holdout | Fixed RRF + Focus | 73.3% | 96.7% | 100.0% | 0.8511 | 231.248 | 518.026 |
| holdout | Tuned ARRF | 93.3% | 100.0% | 100.0% | 0.9667 | 231.247 | 518.026 |

### 決策

本輪 Tuned ARRF 與 Fixed RRF 完全並列；搜尋結果也收斂為三類問題皆 0.50/0.50，因此沒有證據顯示自適應優於固定融合。正式競賽仍需要由第三方保管的新專案 hidden set。

延遲的量測方式：Lexical 與 Vector 是各自查詢時間；兩種 RRF 使用同一批並行候選結果，時間為雙路 wall-clock、合併與各自融合時間。Embedding API 的網路延遲會受服務區域與當下負載影響，因此延遲數字應多次重跑後再做正式結論。

## 每題正確證據排名

權重欄為 Tuned ARRF 的 Lexical/Vector。`miss` 代表正確 evidence 沒有進入該策略的 Top-20 候選範圍；排名大於 5 仍會列出，但不計入 Hit@5 或 MRR@5。

| Split | ID | 問題 | Tuned 類型與 L/V 權重 | Lexical rank | Vector rank | Fixed RRF rank | Fixed + Focus rank | Tuned ARRF rank |
|---|---|---|---|---:|---:|---:|---:|---:|
| development | stage | Project ORBIT 現在進行到哪一個階段？ | exact (0.50/0.50) | 3 | 1 | 1 | 4 | 1 |
| development | launch-date | ORBIT 預計什麼時候上線？ | exact (0.50/0.50) | 2 | 1 | 1 | 4 | 1 |
| development | invoice-risk | 發票公司名稱或金額不符時要怎麼處理？ | semantic (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | sso-report | 新版 SSO 測試報告目前是什麼狀態？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | uat-owner | UAT 阻塞問題接下來要做什麼？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | security-contact | 登入、權限或疑似資料外洩應該聯絡誰？ | semantic (0.50/0.50) | 1 | 2 | 1 | 1 | 1 |
| development | date-decision | 需要改變上線日期時由誰做決策？ | mixed (0.50/0.50) | 1 | 3 | 1 | 1 | 1 |
| development | vendor-meeting | 供應商技術會議固定在什麼時間？ | mixed (0.50/0.50) | 1 | 2 | 1 | 1 | 1 |
| development | engineering-report | 工程問題應該附上哪些資訊？ | semantic (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | bi-permission | BI-042 儀表板權限移交完成了嗎？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | decision-location | 專案的重要決策紀錄放在哪裡？ | mixed (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | laptop-return | 公司的筆電在離職時如何歸還？ | semantic (0.50/0.50) | 2 | 2 | 2 | 1 | 2 |
| development | password-policy | 交接文件裡可以記錄帳號密碼嗎？ | mixed (0.50/0.50) | 2 | 1 | 1 | 4 | 1 |
| development | test-phone | 測試用 Android 手機放在哪裡？ | mixed (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | uat-site-access | 要使用 UAT 測試網站需要申請什麼權限？ | exact (0.50/0.50) | 1 | 2 | 1 | 1 | 1 |
| development | nimbus-stage | NIMBUS 現在導入多少正式流量？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | nimbus-freeze | NIMBUS 每週的變更凍結窗是幾點？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | nimbus-rollback | 錯誤率達到什麼條件時需要回滾 NIMBUS？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | nimbus-room | NIMBUS 的事故協作 Slack 頻道在哪裡？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | nimbus-vault | NIMBUS 正式環境 secrets 的 Vault 路徑是什麼？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | lantern-renewal | LANTERN 的續約日是哪一天？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | lantern-health | LANTERN 的帳戶健康度為什麼是黃色？ | mixed (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | lantern-sponsor | LANTERN 的主要客戶贊助人是誰？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | lantern-qbr | LANTERN 的 QBR 固定安排在什麼時間？ | exact (0.50/0.50) | 1 | 1 | 1 | 2 | 1 |
| development | lantern-demo | LANTERN 的展示環境 tenant 代碼是什麼？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | aurora-vendor | AURORA 的主要供應商是哪一家？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | aurora-po | AURORA 目前使用的採購單編號是什麼？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | aurora-cfo-threshold | AURORA 單筆金額超過多少需要 CFO 核准？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | aurora-invoice-folder | AURORA 發票要放到哪個資料夾？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| development | aurora-contract-end | NovaPay 的 AURORA 合約何時到期？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-stage | 目前 ORBIT 專案做到什麼進度了？ | exact (0.50/0.50) | 3 | 1 | 1 | 1 | 1 |
| holdout | holdout-launch-date | 這個專案正式上線日預定是哪一天？ | mixed (0.50/0.50) | 3 | 1 | 2 | 2 | 2 |
| holdout | holdout-invoice-risk | 客戶發票資料對不上時，第一步怎麼處理？ | semantic (0.50/0.50) | 2 | 1 | 1 | 2 | 1 |
| holdout | holdout-sso-report | 供應商還沒交新版 SSO 測試報告嗎？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-uat-owner | UAT 卡住的項目要如何繼續追蹤？ | mixed (0.50/0.50) | 2 | 1 | 1 | 2 | 1 |
| holdout | holdout-security-contact | 如果懷疑有資料洩漏，我要找哪位窗口？ | mixed (0.50/0.50) | 1 | 2 | 1 | 1 | 1 |
| holdout | holdout-date-decision | 延期上線需要請誰拍板？ | mixed (0.50/0.50) | 1 | 2 | 1 | 1 | 1 |
| holdout | holdout-vendor-meeting | 每週和供應商開技術會議的時段是？ | mixed (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-engineering-report | 回報工程異常時，工單還要附什麼？ | mixed (0.50/0.50) | 1 | 5 | 2 | 1 | 2 |
| holdout | holdout-bi-permission | 新人現在能查看 BI-042 報表了嗎？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-decision-location | 要去哪個資料夾查 ORBIT 過去的決策與原因？ | mixed (0.50/0.50) | 1 | 1 | 1 | 3 | 1 |
| holdout | holdout-laptop-return | 離職前公司配發的 NB-TW-2841 應交給誰？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-password-policy | 我能把登入密碼直接寫進交接檔嗎？ | mixed (0.50/0.50) | 1 | 2 | 1 | 5 | 1 |
| holdout | holdout-test-phone | PHONE-663 目前由哪裡保管？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-uat-site-access | 進 UAT 網站的個人測試帳號要有哪種角色？ | exact (0.50/0.50) | 1 | 4 | 1 | 1 | 1 |
| holdout | holdout-nimbus-oncall | NIMBUS 發生事故時主要值班工程師與分機是什麼？ | exact (0.50/0.50) | 1 | 1 | 1 | 2 | 1 |
| holdout | holdout-nimbus-backup | NIMBUS 資料庫每天何時備份，會保留多久？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-nimbus-p1 | NIMBUS P1 服務中斷要在多久內回應？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-nimbus-status-page | 誰核准後才能發布 NIMBUS 狀態頁公告？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-nimbus-staging-role | 操作 NIMBUS staging 需要哪個 IAM 角色？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-lantern-risk | 什麼情況會讓 LANTERN 被列為高流失風險？ | mixed (0.50/0.50) | 1 | 1 | 1 | 2 | 1 |
| holdout | holdout-lantern-escalation | LANTERN 的 P1 緊急升級要寄到哪個信箱？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-lantern-weekly | LANTERN 每週和客戶同步的時間是？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-lantern-nps-owner | LANTERN 的 NPS 負評由誰追蹤？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-lantern-language | LANTERN 對客戶提供哪些支援語言？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-aurora-payment | AURORA 的付款條件是幾天？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-aurora-invoice-mismatch | AURORA 發票資料不符時要如何處理？ | mixed (0.50/0.50) | 1 | 1 | 1 | 2 | 1 |
| holdout | holdout-aurora-owner | AURORA 的採購財務作業負責人是誰？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-aurora-licenses | AURORA 有多少軟體授權，多久沒用要回收？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |
| holdout | holdout-aurora-retention | AURORA 的付款稽核證據需要保存幾年？ | exact (0.50/0.50) | 1 | 1 | 1 | 1 | 1 |

## 三層演算法如何運作

1. **候選召回層**：同時執行 lexical 與 vector Top-20，保存兩邊原始 score、rank 與延遲，以 chunk id 合併。原始 score 的尺度不同，不直接相加。
2. **固定融合層**：用 50/50 RRF 產生可比較基準。正確 evidence 排得越前面，對融合分數的貢獻越高；同時被兩路找到會累加兩份貢獻。
3. **自適應訓練層**：只在 development 上搜尋 exact、semantic、mixed 各自的 lexical/vector 權重與共同 RRF k，鎖定後才評估 holdout。每次分類原因、權重與各路貢獻都留在 trace 中。

## 限制與下一輪實驗

- 新增的 holdout 使用 NIMBUS、LANTERN、AURORA 文件中未被 development 問題標註的不同事實，比單純改寫更嚴格；但文件仍在同一資料夾，競賽正式結論仍需由他人保管 hidden set。
- 評估契約已支援多 relevant labels；仍應由兩位標註者獨立覆核並加入 nDCG@K。
- 尚未包含「文件中沒有答案」的問題；上線前應加入 no-answer precision、拒答正確率與最低可信門檻。
- 查詢延遲只跑一次且資料量很小；正式比較應 warm-up 後重複至少 20 次，報告 median/P95，並把 embedding 與 vector database 的費用一起記錄。
- 記憶體索引不具持久性、分散式交易與 ANN 能力。正式環境應在既有 `VectorStore` 邊界替換成持久化向量庫，演算法層不必重寫。
- 若 Tuned ARRF 未同時勝過 Fixed RRF 與 Vector only，就不能宣稱最佳；此時應保留較簡單的策略。

## 重現方式

在 `webapp/.env.local` 設定伺服器端 `RAG_EMBEDDING_API_KEY`、`RAG_EMBEDDING_BASE_URL` 與 `RAG_EMBEDDING_MODEL`，於 `webapp` 執行：

```powershell
pnpm run rag:evaluate
```

同一次執行也會輸出機器可讀的 `docs/rag-experiment-results.json`。不要把 API key 放進前端程式、報告或版本控制。
