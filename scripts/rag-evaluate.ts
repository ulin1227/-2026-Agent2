import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RetrievalHit } from "../lib/rag/contracts";
import { MemoryEmbeddingVectorStore } from "../lib/rag/embedding-memory";
import { DeterministicHashEmbeddingProvider } from "../lib/rag/embeddings/deterministic";
import { createOpenAIEmbeddingProviderFromEnvironment } from "../lib/rag/embeddings/openai";
import { expectedRank, type GoldenQuestion } from "../lib/rag/evaluation";
import {
  ORBIT_DEVELOPMENT_QUESTIONS,
  ORBIT_HOLDOUT_QUESTIONS,
} from "../lib/rag/golden-questions";
import {
  DEFAULT_CANDIDATE_K,
  DEFAULT_RRF_K,
  DualCandidateRetriever,
  fixedFocusQueryProfile,
  fixedQueryProfile,
  fuseCandidates,
  profileQuery,
  type CandidateSet,
  type QueryProfile,
  type QueryType,
} from "../lib/rag/hybrid";
import { IndexingService } from "../lib/rag/indexing";
import { MemoryDocumentRepository, MemoryLexicalVectorStore } from "../lib/rag/memory";
import { createDefaultLocalFolderSource } from "../lib/rag/sources/local-folder";

const PROJECT_ID = "rag-evaluation-orbit";
const EVALUATION_K = 5;
const CANDIDATE_K = DEFAULT_CANDIDATE_K;
const RRF_K = DEFAULT_RRF_K;
const REPORT_PATH = resolve("docs/RAG_EXPERIMENT_REPORT.md");
const RAW_RESULTS_PATH = resolve("docs/rag-experiment-results.json");

try {
  process.loadEnvFile?.(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

interface StrategyObservation {
  rank: number | null;
  latencyMs: number;
}

interface QuestionObservation {
  id: string;
  question: string;
  split: "development" | "holdout";
  profile: QueryProfile;
  candidateMatched: boolean;
  lexical: StrategyObservation;
  vector: StrategyObservation;
  fixedRrf: StrategyObservation;
  fixedFocusRrf: StrategyObservation;
  tunedArrf: StrategyObservation;
  diagnostics: {
    lexical: CandidateDiagnostic[];
    vector: CandidateDiagnostic[];
    fixedRrf: CandidateDiagnostic[];
    fixedFocusRrf: CandidateDiagnostic[];
    tunedArrf: CandidateDiagnostic[];
  };
}

interface TuningConfiguration {
  rrfK: number;
  lexicalWeights: Record<QueryType, number>;
  developmentMrrAt5: number;
  developmentHitAt1: number;
}

interface RetrievedQuestion {
  question: GoldenQuestion;
  split: "development" | "holdout";
  candidates: CandidateSet;
}

interface CandidateDiagnostic {
  rank: number;
  score: number;
  fileName: string;
  locator: string;
  matchesExpected: boolean;
  excerpt: string;
}

interface StrategyMetrics {
  split: "development" | "holdout";
  strategy: string;
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  mrrAt5: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function calculateMetrics(
  split: "development" | "holdout",
  strategy: string,
  observations: StrategyObservation[],
): StrategyMetrics {
  const total = observations.length || 1;
  const hitAt = (k: number) => observations.filter((item) => item.rank !== null && item.rank <= k).length / total;
  const mrrAt5 = observations.reduce((sum, item) =>
    sum + (item.rank !== null && item.rank <= EVALUATION_K ? 1 / item.rank : 0), 0) / total;
  const latencies = observations.map((item) => item.latencyMs);
  return {
    split,
    strategy,
    hitAt1: round(hitAt(1)),
    hitAt3: round(hitAt(3)),
    hitAt5: round(hitAt(5)),
    mrrAt5: round(mrrAt5),
    averageLatencyMs: round(latencies.reduce((sum, value) => sum + value, 0) / total, 3),
    p95LatencyMs: round(percentile95(latencies), 3),
  };
}

function profileForTuning(question: string, lexicalWeight: number): QueryProfile {
  const classified = profileQuery(question);
  return {
    type: classified.type,
    lexicalWeight,
    vectorWeight: Number((1 - lexicalWeight).toFixed(2)),
    focusWeight: 0,
    reasons: [...classified.reasons, "development-only grid search locked weight"],
  };
}

function betterMetrics(
  candidate: Pick<StrategyMetrics, "mrrAt5" | "hitAt1" | "hitAt3">,
  current: Pick<StrategyMetrics, "mrrAt5" | "hitAt1" | "hitAt3"> | undefined,
): boolean {
  if (!current) return true;
  return candidate.mrrAt5 > current.mrrAt5 ||
    (candidate.mrrAt5 === current.mrrAt5 && candidate.hitAt1 > current.hitAt1) ||
    (candidate.mrrAt5 === current.mrrAt5 && candidate.hitAt1 === current.hitAt1 &&
      candidate.hitAt3 > current.hitAt3);
}

function tuneArrf(retrieved: RetrievedQuestion[]): TuningConfiguration {
  const development = retrieved.filter((item) => item.split === "development");
  const queryTypes: QueryType[] = ["exact", "semantic", "mixed"];
  const weights = Array.from({ length: 11 }, (_, index) => Number((0.25 + index * 0.05).toFixed(2)));
  const rrfValues = [5, 10, 20, 40, 60];
  let best: TuningConfiguration | undefined;
  let bestMetrics: StrategyMetrics | undefined;

  for (const rrfK of rrfValues) {
    const selectedWeights = {} as Record<QueryType, number>;
    for (const type of queryTypes) {
      const subset = development.filter((item) => profileQuery(item.question.question).type === type);
      let selected = 0.5;
      let selectedMetrics: StrategyMetrics | undefined;
      for (const lexicalWeight of weights) {
        const ranks = subset.map((item) => ({
          rank: rankFor(
            fuseCandidates(item.candidates, profileForTuning(item.question.question, lexicalWeight), rrfK, "adaptive").results,
            item.question,
          ),
          latencyMs: 0,
        }));
        const metrics = calculateMetrics("development", "candidate", ranks);
        if (betterMetrics(metrics, selectedMetrics) ||
            (!betterMetrics(selectedMetrics ?? metrics, metrics) &&
              Math.abs(lexicalWeight - 0.5) < Math.abs(selected - 0.5))) {
          selected = lexicalWeight;
          selectedMetrics = metrics;
        }
      }
      selectedWeights[type] = selected;
    }

    const ranks = development.map((item) => {
      const type = profileQuery(item.question.question).type;
      return {
        rank: rankFor(
          fuseCandidates(
            item.candidates,
            profileForTuning(item.question.question, selectedWeights[type]),
            rrfK,
            "adaptive",
          ).results,
          item.question,
        ),
        latencyMs: 0,
      };
    });
    const metrics = calculateMetrics("development", "candidate", ranks);
    if (betterMetrics(metrics, bestMetrics) ||
        (!betterMetrics(bestMetrics ?? metrics, metrics) &&
          Math.abs(rrfK - DEFAULT_RRF_K) < Math.abs((best?.rrfK ?? DEFAULT_RRF_K) - DEFAULT_RRF_K))) {
      bestMetrics = metrics;
      best = {
        rrfK,
        lexicalWeights: selectedWeights,
        developmentMrrAt5: metrics.mrrAt5,
        developmentHitAt1: metrics.hitAt1,
      };
    }
  }
  if (!best) throw new Error("ARRF parameter search produced no configuration.");
  return best;
}

function candidateHits(candidates: Awaited<ReturnType<DualCandidateRetriever["retrieve"]>>): RetrievalHit[] {
  return candidates.candidates.map((candidate) => ({ ...candidate.chunk, score: 0 }));
}

function rankFor(hits: RetrievalHit[], question: GoldenQuestion): number | null {
  return expectedRank(hits, question);
}

function diagnosticsFor(hits: RetrievalHit[], question: GoldenQuestion): CandidateDiagnostic[] {
  return hits.slice(0, 3).map((hit, index) => ({
    rank: index + 1,
    score: hit.score,
    fileName: hit.metadata.fileName,
    locator: hit.metadata.locator,
    matchesExpected: expectedRank([hit], question) === 1,
    excerpt: hit.text.replaceAll(/\s+/g, " ").slice(0, 180),
  }));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function rankLabel(rank: number | null): string {
  return rank === null ? "miss" : String(rank);
}

function renderReport(input: {
  generatedAt: string;
  model: string;
  documentCount: number;
  chunkCount: number;
  observations: QuestionObservation[];
  metrics: StrategyMetrics[];
  tuning: TuningConfiguration;
  isMock: boolean;
  evaluationNote?: string;
}): string {
  const candidateRecall = input.observations.filter((item) => item.candidateMatched).length /
    (input.observations.length || 1);
  const sorted = [...input.metrics].sort((left, right) =>
    right.hitAt5 - left.hitAt5 || right.mrrAt5 - left.mrrAt5 || right.hitAt1 - left.hitAt1 ||
    left.averageLatencyMs - right.averageLatencyMs);
  const holdoutMetrics = sorted.filter((item) => item.split === "holdout");
  const best = holdoutMetrics[0];
  const leaders = holdoutMetrics.filter((item) =>
    item.hitAt5 === best.hitAt5 && item.mrrAt5 === best.mrrAt5 && item.hitAt1 === best.hitAt1);
  const bestLabel = leaders.map((item) => item.strategy).join("、");
  const fixed = holdoutMetrics.find((item) => item.strategy === "Fixed RRF")!;
  const adaptive = holdoutMetrics.find((item) => item.strategy === "Tuned ARRF")!;
  const adaptiveDecision = adaptive.hitAt1 > fixed.hitAt1 && adaptive.mrrAt5 > fixed.mrrAt5
    ? "本輪支持 Tuned ARRF：它在 holdout 的 Hit@1 與 MRR@5 都嚴格高於 Fixed RRF。仍須以第三方 hidden set 再確認泛化。"
    : adaptive.hitAt1 === fixed.hitAt1 && adaptive.mrrAt5 === fixed.mrrAt5
      ? "本輪 Tuned ARRF 與 Fixed RRF 完全並列；搜尋結果也收斂為三類問題皆 0.50/0.50，因此沒有證據顯示自適應優於固定融合。"
      : "本輪不支持 Tuned ARRF：它在 holdout 未同時勝過 Fixed RRF，不能宣稱最佳。";
  const profileCounts = input.observations.reduce<Record<string, number>>((counts, item) => {
    counts[item.profile.type] = (counts[item.profile.type] ?? 0) + 1;
    return counts;
  }, {});

  const metricRows = input.metrics.map((item) =>
    `| ${item.split} | ${item.strategy} | ${percent(item.hitAt1)} | ${percent(item.hitAt3)} | ${percent(item.hitAt5)} | ${item.mrrAt5.toFixed(4)} | ${item.averageLatencyMs.toFixed(3)} | ${item.p95LatencyMs.toFixed(3)} |`).join("\n");
  const questionRows = input.observations.map((item) =>
    `| ${item.split} | ${item.id} | ${markdownCell(item.question)} | ${item.profile.type} (${item.profile.lexicalWeight.toFixed(2)}/${item.profile.vectorWeight.toFixed(2)}) | ${rankLabel(item.lexical.rank)} | ${rankLabel(item.vector.rank)} | ${rankLabel(item.fixedRrf.rank)} | ${rankLabel(item.fixedFocusRrf.rank)} | ${rankLabel(item.tunedArrf.rank)} |`).join("\n");

  const warning = input.isMock
    ? `> **重要：本次是離線結構驗證，不是真實語意向量品質報告。** 使用的 feature-hash mock 只能驗證向量、融合、指標與報告鏈路；不可用這些數字宣稱 embedding 模型效果。${input.evaluationNote ? ` 原因：${markdownCell(input.evaluationNote)}` : ""}\n\n`
    : "";

  return `# RAG 三層檢索演算法實驗報告${input.isMock ? "（離線結構驗證）" : ""}

產生時間：${input.generatedAt}

${warning}## 摘要

本次使用 ${ORBIT_DEVELOPMENT_QUESTIONS.length} 題 development 與 ${ORBIT_HOLDOUT_QUESTIONS.length} 題不同事實的 holdout，索引 ${input.documentCount} 份 DOCX、${input.chunkCount} 個 chunks，比較 Lexical、Vector、Fixed RRF、Fixed RRF + Focus 與 **Tuned ARRF**。候選集合 Recall@${CANDIDATE_K} 為 ${percent(candidateRecall)}；依 holdout 的 Hit@5、MRR@5、Hit@1 排序，本次最佳為 **${bestLabel}**。

Tuned ARRF 相對 Fixed RRF 的 holdout Hit@1 差異為 ${(adaptive.hitAt1 - fixed.hitAt1 >= 0 ? "+" : "")}${percent(adaptive.hitAt1 - fixed.hitAt1)}，MRR@5 差異為 ${(adaptive.mrrAt5 - fixed.mrrAt5 >= 0 ? "+" : "")}${(adaptive.mrrAt5 - fixed.mrrAt5).toFixed(4)}。參數只由 development 選出，holdout 未參與權重搜尋。

## 實驗設定

- 專案隔離鍵：\`${PROJECT_ID}\`
- Embedding 模型：\`${input.model}\`${input.isMock ? "（mock，非語意模型）" : ""}
- 第一層候選數：Lexical Top-${CANDIDATE_K} + Vector Top-${CANDIDATE_K}，並行查詢後以 chunk id 去重
- 第二層：Fixed RRF，Lexical/Vector/Focus 權重 0.50/0.50/0.00
- 公平消融基準：Fixed RRF + Focus，權重 0.40/0.40/0.20
- Tuned ARRF development-only 搜尋：\`k ∈ {5,10,20,40,60}\`，各 query type 的 lexical 權重由 0.25～0.75、步長 0.05 搜尋
- 鎖定設定：\`k=${input.tuning.rrfK}\`；exact ${input.tuning.lexicalWeights.exact.toFixed(2)}/${(1 - input.tuning.lexicalWeights.exact).toFixed(2)}、semantic ${input.tuning.lexicalWeights.semantic.toFixed(2)}/${(1 - input.tuning.lexicalWeights.semantic).toFixed(2)}、mixed ${input.tuning.lexicalWeights.mixed.toFixed(2)}/${(1 - input.tuning.lexicalWeights.mixed).toFixed(2)}
- Evidence Focus：將 chunk 內每個原始段落／表格列獨立做 lexical relevance，再轉成 rank；不與遠端 embedding raw score 相加
- RRF 公式：\`wL/(k+rankL) + wV/(k+rankV)\`；Tuned ARRF 的 k 與權重完全由 development 搜尋後鎖定
- 最終評估深度：Top-${EVALUATION_K}
- 問題類型數：exact ${profileCounts.exact ?? 0}、semantic ${profileCounts.semantic ?? 0}、mixed ${profileCounts.mixed ?? 0}
- 向量儲存：記憶體 cosine search（僅實驗，不適合正式環境）

## 整體結果

| Split | 策略 | Hit@1 | Hit@3 | Hit@5 | MRR@5 | 平均查詢延遲 ms | P95 延遲 ms |
|---|---|---:|---:|---:|---:|---:|---:|
${metricRows}

### 決策

${adaptiveDecision} 正式競賽仍需要由第三方保管的新專案 hidden set。

延遲的量測方式：Lexical 與 Vector 是各自查詢時間；兩種 RRF 使用同一批並行候選結果，時間為雙路 wall-clock、合併與各自融合時間。Embedding API 的網路延遲會受服務區域與當下負載影響，因此延遲數字應多次重跑後再做正式結論。

## 每題正確證據排名

權重欄為 Tuned ARRF 的 Lexical/Vector。\`miss\` 代表正確 evidence 沒有進入該策略的 Top-${CANDIDATE_K} 候選範圍；排名大於 ${EVALUATION_K} 仍會列出，但不計入 Hit@${EVALUATION_K} 或 MRR@${EVALUATION_K}。

| Split | ID | 問題 | Tuned 類型與 L/V 權重 | Lexical rank | Vector rank | Fixed RRF rank | Fixed + Focus rank | Tuned ARRF rank |
|---|---|---|---|---:|---:|---:|---:|---:|
${questionRows}

## 三層演算法如何運作

1. **候選召回層**：同時執行 lexical 與 vector Top-${CANDIDATE_K}，保存兩邊原始 score、rank 與延遲，以 chunk id 合併。原始 score 的尺度不同，不直接相加。
2. **固定融合層**：用 50/50 RRF 產生可比較基準。正確 evidence 排得越前面，對融合分數的貢獻越高；同時被兩路找到會累加兩份貢獻。
3. **自適應訓練層**：只在 development 上搜尋 exact、semantic、mixed 各自的 lexical/vector 權重與共同 RRF k，鎖定後才評估 holdout。每次分類原因、權重與各路貢獻都留在 trace 中。

## 限制與下一輪實驗

- 新增的 holdout 使用 NIMBUS、LANTERN、AURORA 文件中未被 development 問題標註的不同事實，比單純改寫更嚴格；但文件仍在同一資料夾，競賽正式結論仍需由他人保管 hidden set。
- 評估契約已支援多 relevant labels；仍應由兩位標註者獨立覆核並加入 nDCG@K。
- 尚未包含「文件中沒有答案」的問題；上線前應加入 no-answer precision、拒答正確率與最低可信門檻。
- 查詢延遲只跑一次且資料量很小；正式比較應 warm-up 後重複至少 20 次，報告 median/P95，並把 embedding 與 vector database 的費用一起記錄。
- 記憶體索引不具持久性、分散式交易與 ANN 能力。正式環境應在既有 \`VectorStore\` 邊界替換成持久化向量庫，演算法層不必重寫。
- 若 Tuned ARRF 未同時勝過 Fixed RRF 與 Vector only，就不能宣稱最佳；此時應保留較簡單的策略。

## 重現方式

在 \`webapp/.env.local\` 設定伺服器端 \`RAG_EMBEDDING_API_KEY\`、\`RAG_EMBEDDING_BASE_URL\` 與 \`RAG_EMBEDDING_MODEL\`，於 \`webapp\` 執行：

\`\`\`powershell
pnpm run rag:evaluate
\`\`\`

同一次執行也會輸出機器可讀的 \`docs/rag-experiment-results.json\`。不要把 API key 放進前端程式、報告或版本控制。
`;
}

async function main(): Promise<void> {
  const isMock = process.env.RAG_EVALUATION_EMBEDDING?.trim().toLocaleLowerCase() === "mock";
  const embeddingProvider = isMock
    ? new DeterministicHashEmbeddingProvider()
    : createOpenAIEmbeddingProviderFromEnvironment();
  if (!isMock) await embeddingProvider.embedQuery("RAG embedding connectivity check");
  const lexicalStore = new MemoryLexicalVectorStore();
  const vectorStore = new MemoryEmbeddingVectorStore(embeddingProvider);
  const repository = new MemoryDocumentRepository();

  // Index both backends once. Query evaluation below reuses the same candidates
  // for all five strategies, avoiding duplicate API calls and timing bias.
  const dualIndex = {
    strategy: "evaluation-dual-index",
    replaceDocumentChunks: async (projectId: string, documentId: string, chunks: Parameters<MemoryLexicalVectorStore["replaceDocumentChunks"]>[2]) => {
      await vectorStore.replaceDocumentChunks(projectId, documentId, chunks);
      await lexicalStore.replaceDocumentChunks(projectId, documentId, chunks);
    },
    deleteDocument: async (projectId: string, documentId: string) => {
      await vectorStore.deleteDocument(projectId, documentId);
      await lexicalStore.deleteDocument(projectId, documentId);
    },
    query: (request: Parameters<MemoryLexicalVectorStore["query"]>[0]) => lexicalStore.query(request),
  };
  const sync = await new IndexingService(repository, dualIndex)
    .sync(PROJECT_ID, createDefaultLocalFolderSource("."));
  if (sync.failures.length > 0) {
    throw new Error(`Indexing failed for ${sync.failures.map((item) => item.fileName).join(", ")}.`);
  }

  const candidateRetriever = new DualCandidateRetriever(lexicalStore, vectorStore);
  const evaluationQuestions = [
    ...ORBIT_DEVELOPMENT_QUESTIONS.map((question) => ({ question, split: "development" as const })),
    ...ORBIT_HOLDOUT_QUESTIONS.map((question) => ({ question, split: "holdout" as const })),
  ];
  const retrieved: RetrievedQuestion[] = [];
  for (const { question, split } of evaluationQuestions) {
    const candidates = await candidateRetriever.retrieve({
      projectId: PROJECT_ID,
      text: question.question,
      topK: CANDIDATE_K,
    });
    retrieved.push({ question, split, candidates });
  }

  const tuning = tuneArrf(retrieved);
  const observations: QuestionObservation[] = [];
  for (const { question, split, candidates } of retrieved) {
    const fixed = fuseCandidates(candidates, fixedQueryProfile(), RRF_K, "fixed");
    const fixedFocus = fuseCandidates(candidates, fixedFocusQueryProfile(), RRF_K, "fixed");
    const type = profileQuery(question.question).type;
    const profile = profileForTuning(question.question, tuning.lexicalWeights[type]);
    const adaptive = fuseCandidates(candidates, profile, tuning.rrfK, "adaptive");
    observations.push({
      id: question.id,
      question: question.question,
      split,
      profile,
      candidateMatched: rankFor(candidateHits(candidates), question) !== null,
      lexical: { rank: rankFor(candidates.lexicalHits, question), latencyMs: candidates.latency.lexicalMs },
      vector: { rank: rankFor(candidates.vectorHits, question), latencyMs: candidates.latency.vectorMs },
      fixedRrf: {
        rank: rankFor(fixed.results, question),
        latencyMs: candidates.latency.totalMs + fixed.fusionMs,
      },
      fixedFocusRrf: {
        rank: rankFor(fixedFocus.results, question),
        latencyMs: candidates.latency.totalMs + fixedFocus.fusionMs,
      },
      tunedArrf: {
        rank: rankFor(adaptive.results, question),
        latencyMs: candidates.latency.totalMs + adaptive.fusionMs,
      },
      diagnostics: {
        lexical: diagnosticsFor(candidates.lexicalHits, question),
        vector: diagnosticsFor(candidates.vectorHits, question),
        fixedRrf: diagnosticsFor(fixed.results, question),
        fixedFocusRrf: diagnosticsFor(fixedFocus.results, question),
        tunedArrf: diagnosticsFor(adaptive.results, question),
      },
    });
  }

  const metrics = (["development", "holdout"] as const).flatMap((split) => {
    const splitObservations = observations.filter((item) => item.split === split);
    return [
      calculateMetrics(split, "Lexical only", splitObservations.map((item) => item.lexical)),
      calculateMetrics(split, "Vector only", splitObservations.map((item) => item.vector)),
      calculateMetrics(split, "Fixed RRF", splitObservations.map((item) => item.fixedRrf)),
      calculateMetrics(split, "Fixed RRF + Focus", splitObservations.map((item) => item.fixedFocusRrf)),
      calculateMetrics(split, "Tuned ARRF", splitObservations.map((item) => item.tunedArrf)),
    ];
  });
  const generatedAt = new Date().toISOString();
  const rawResults = {
    generatedAt,
    configuration: {
      projectId: PROJECT_ID,
      embeddingModel: embeddingProvider.model,
      isMock,
      candidateK: CANDIDATE_K,
      evaluationK: EVALUATION_K,
      rrfK: RRF_K,
      documentCount: sync.added + sync.updated,
      chunkCount: sync.indexedChunks,
      tuning,
    },
    metrics,
    tuning,
    observations,
  };
  await writeFile(RAW_RESULTS_PATH, `${JSON.stringify(rawResults, null, 2)}\n`, "utf8");
  await writeFile(REPORT_PATH, renderReport({
    generatedAt,
    model: embeddingProvider.model,
    documentCount: sync.added + sync.updated,
    chunkCount: sync.indexedChunks,
    observations,
    metrics,
    tuning,
    isMock,
    evaluationNote: process.env.RAG_EVALUATION_NOTE?.trim() || undefined,
  }), "utf8");

  console.table(metrics);
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Raw results: ${RAW_RESULTS_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "RAG evaluation failed.");
  process.exitCode = 1;
});
