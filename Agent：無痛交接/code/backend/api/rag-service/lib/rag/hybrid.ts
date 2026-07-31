import type {
  KnowledgeChunk,
  RetrievalHit,
  VectorQuery,
  VectorStore,
} from "./contracts";
import { focusedEvidenceScore } from "./lexical-scoring";

export const DEFAULT_CANDIDATE_K = 20;
export const DEFAULT_RRF_K = 10;

export type QueryType = "exact" | "semantic" | "mixed";
export type FusionMode = "fixed" | "adaptive";

export interface QueryProfile {
  type: QueryType;
  lexicalWeight: number;
  vectorWeight: number;
  focusWeight: number;
  reasons: string[];
}

export interface RankedSignal {
  rank: number;
  score: number;
}

export interface HybridCandidate {
  chunk: KnowledgeChunk;
  lexical?: RankedSignal;
  vector?: RankedSignal;
  focus?: RankedSignal;
}

export interface CandidateLatency {
  lexicalMs: number;
  vectorMs: number;
  wallMs: number;
  mergeMs: number;
  totalMs: number;
}

export interface CandidateSet {
  candidateK: number;
  lexicalHits: RetrievalHit[];
  vectorHits: RetrievalHit[];
  candidates: HybridCandidate[];
  latency: CandidateLatency;
}

export interface FusedRetrievalHit extends RetrievalHit {
  fusedRank: number;
  queryType: QueryType;
  lexicalWeight: number;
  vectorWeight: number;
  focusWeight: number;
  fusionReasons: string[];
  rrfK: number;
  lexicalRank: number | null;
  vectorRank: number | null;
  lexicalScore: number | null;
  vectorScore: number | null;
  focusRank: number | null;
  focusScore: number | null;
  lexicalContribution: number;
  vectorContribution: number;
  focusContribution: number;
  retrievedBy: Array<"lexical" | "vector">;
}

export interface FusionTrace {
  mode: FusionMode;
  profile: QueryProfile;
  rrfK: number;
  fusionMs: number;
  results: FusedRetrievalHit[];
}

export interface HybridQueryTrace {
  candidates: CandidateSet;
  fusion: FusionTrace;
}

const FIXED_PROFILE: QueryProfile = {
  type: "mixed",
  lexicalWeight: 0.5,
  vectorWeight: 0.5,
  focusWeight: 0,
  reasons: ["固定權重基準：lexical 與 vector 各占 50%"],
};

/** Deterministic and explainable; identical questions always get identical weights. */
export function profileQuery(question: string): QueryProfile {
  const normalized = question.normalize("NFKC");
  const exactReasons: string[] = [];
  const semanticReasons: string[] = [];

  if (/\b(?:[A-Z]{2,}(?:[-_]\d+)?|[A-Z]+-\d+)\b/u.test(normalized)) {
    exactReasons.push("包含大寫專案代號或識別碼");
  }
  if (/\b\d{1,4}(?:[-/.年]\d{1,2})+(?:日)?\b/u.test(normalized)) {
    exactReasons.push("包含日期或結構化數字");
  }
  if (/["“”「」『』][^"“”「」『』]+["“”「」『』]/u.test(normalized)) {
    exactReasons.push("包含引號中的精確詞組");
  }
  if (/[\\/]|(?:資料夾|文件路徑|檔案路徑|路徑|wiki|knowledge base|\bKB\b)/iu.test(normalized)) {
    exactReasons.push("包含路徑或文件位置線索");
  }
  if (/(?:為什麼|为什么|原因|如何|怎麼|怎么|風險|风险|注意|怎麼辦|怎么办|卡在哪|影響|影响|建議|建议|應該|应该|處理方式|处理方式)/u.test(normalized)) {
    semanticReasons.push("包含原因、做法、風險或建議型語意");
  }

  if (exactReasons.length > 0 && semanticReasons.length === 0) {
    return { type: "exact", lexicalWeight: 0.7, vectorWeight: 0.3, focusWeight: 0, reasons: exactReasons };
  }
  if (semanticReasons.length > 0 && exactReasons.length === 0) {
    return { type: "semantic", lexicalWeight: 0.3, vectorWeight: 0.7, focusWeight: 0, reasons: semanticReasons };
  }
  return {
    type: "mixed",
    lexicalWeight: 0.45,
    vectorWeight: 0.55,
    focusWeight: 0,
    reasons: [...exactReasons, ...semanticReasons].length > 0
      ? [...exactReasons, ...semanticReasons]
      : ["沒有強烈精確或語意訊號，使用保守混合權重"],
  };
}

/** Experimental ARRF-E profile; evaluation-only until a holdout shows a gain. */
export function profileQueryEvidence(question: string): QueryProfile {
  const base = profileQuery(question);
  const weights = base.type === "exact"
    ? { lexicalWeight: 0.45, vectorWeight: 0.35 }
    : base.type === "semantic"
      ? { lexicalWeight: 0.35, vectorWeight: 0.45 }
      : { lexicalWeight: 0.4, vectorWeight: 0.4 };
  return {
    ...base,
    ...weights,
    focusWeight: 0.2,
    reasons: [...base.reasons, "實驗：以局部證據列降低長 chunk 的主題稀釋"],
  };
}

export function fixedQueryProfile(): QueryProfile {
  return structuredClone(FIXED_PROFILE);
}

export function fixedFocusQueryProfile(): QueryProfile {
  return {
    type: "mixed",
    lexicalWeight: 0.4,
    vectorWeight: 0.4,
    focusWeight: 0.2,
    reasons: ["固定三訊號基準：lexical/vector/focus 為 40%/40%/20%"],
  };
}

function elapsedSince(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

async function timedQuery(
  store: VectorStore,
  request: VectorQuery,
): Promise<{ hits: RetrievalHit[]; elapsedMs: number }> {
  const startedAt = performance.now();
  const hits = await store.query(request);
  return { hits, elapsedMs: elapsedSince(startedAt) };
}

/** Layer 1: run lexical and vector retrieval concurrently and merge by chunk id. */
export class DualCandidateRetriever {
  constructor(
    private readonly lexical: VectorStore,
    private readonly vector: VectorStore,
  ) {}

  async retrieve(request: VectorQuery): Promise<CandidateSet> {
    const overallStartedAt = performance.now();
    const [lexicalResult, vectorResult] = await Promise.all([
      timedQuery(this.lexical, request),
      timedQuery(this.vector, request),
    ]);
    const mergeStartedAt = performance.now();
    const merged = new Map<string, HybridCandidate>();

    lexicalResult.hits.forEach((hit, index) => {
      merged.set(hit.id, {
        chunk: { id: hit.id, text: hit.text, metadata: structuredClone(hit.metadata) },
        lexical: { rank: index + 1, score: hit.score },
      });
    });
    vectorResult.hits.forEach((hit, index) => {
      const current = merged.get(hit.id);
      if (current) {
        current.vector = { rank: index + 1, score: hit.score };
      } else {
        merged.set(hit.id, {
          chunk: { id: hit.id, text: hit.text, metadata: structuredClone(hit.metadata) },
          vector: { rank: index + 1, score: hit.score },
        });
      }
    });

    const focusScores = Array.from(merged.values())
      .map((candidate) => ({
        candidate,
        score: focusedEvidenceScore(request.text, candidate.chunk.text),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.candidate.chunk.id.localeCompare(right.candidate.chunk.id));
    focusScores.forEach((item, index) => {
      item.candidate.focus = { rank: index + 1, score: item.score };
    });

    const candidates = Array.from(merged.values()).sort((left, right) => {
      const leftBest = Math.min(left.lexical?.rank ?? Infinity, left.vector?.rank ?? Infinity);
      const rightBest = Math.min(right.lexical?.rank ?? Infinity, right.vector?.rank ?? Infinity);
      return leftBest - rightBest || left.chunk.id.localeCompare(right.chunk.id);
    });
    const mergeMs = elapsedSince(mergeStartedAt);

    return {
      candidateK: request.topK,
      lexicalHits: lexicalResult.hits,
      vectorHits: vectorResult.hits,
      candidates,
      latency: {
        lexicalMs: lexicalResult.elapsedMs,
        vectorMs: vectorResult.elapsedMs,
        wallMs: Number(Math.max(lexicalResult.elapsedMs, vectorResult.elapsedMs).toFixed(3)),
        mergeMs,
        totalMs: elapsedSince(overallStartedAt),
      },
    };
  }
}

function validateProfile(profile: QueryProfile): void {
  if ([profile.lexicalWeight, profile.vectorWeight, profile.focusWeight]
    .some((weight) => weight < 0 || weight > 0.75)) {
    throw new Error("Fusion weights must remain between 0 and 0.75.");
  }
  if (Math.abs(profile.lexicalWeight + profile.vectorWeight + profile.focusWeight - 1) > 1e-9) {
    throw new Error("Fusion weights must add up to 1.");
  }
}

/** Layers 2 and 3: rank-based fusion, never raw-score addition. */
export function fuseCandidates(
  candidateSet: CandidateSet,
  profile: QueryProfile,
  rrfK = DEFAULT_RRF_K,
  mode: FusionMode = "adaptive",
): FusionTrace {
  if (!Number.isInteger(rrfK) || rrfK < 1) throw new Error("RRF k must be a positive integer.");
  validateProfile(profile);
  const startedAt = performance.now();
  const results = candidateSet.candidates.map((candidate) => {
    const lexicalContribution = candidate.lexical
      ? profile.lexicalWeight / (rrfK + candidate.lexical.rank)
      : 0;
    const vectorContribution = candidate.vector
      ? profile.vectorWeight / (rrfK + candidate.vector.rank)
      : 0;
    // Local row focus is a deterministic third signal. Its lower damping makes
    // a concentrated evidence row meaningful without adding raw retriever scores.
    const focusContribution = candidate.focus
      ? profile.focusWeight / (1 + candidate.focus.rank)
      : 0;
    return {
      ...structuredClone(candidate.chunk),
      score: Number((lexicalContribution + vectorContribution + focusContribution).toFixed(12)),
      fusedRank: 0,
      queryType: profile.type,
      lexicalWeight: profile.lexicalWeight,
      vectorWeight: profile.vectorWeight,
      focusWeight: profile.focusWeight,
      fusionReasons: [...profile.reasons],
      rrfK,
      lexicalRank: candidate.lexical?.rank ?? null,
      vectorRank: candidate.vector?.rank ?? null,
      lexicalScore: candidate.lexical?.score ?? null,
      vectorScore: candidate.vector?.score ?? null,
      focusRank: candidate.focus?.rank ?? null,
      focusScore: candidate.focus?.score ?? null,
      lexicalContribution: Number(lexicalContribution.toFixed(12)),
      vectorContribution: Number(vectorContribution.toFixed(12)),
      focusContribution: Number(focusContribution.toFixed(12)),
      retrievedBy: [
        ...(candidate.lexical ? ["lexical" as const] : []),
        ...(candidate.vector ? ["vector" as const] : []),
      ],
    };
  }).sort((left, right) =>
    right.score - left.score ||
    right.retrievedBy.length - left.retrievedBy.length ||
    Math.min(left.lexicalRank ?? Infinity, left.vectorRank ?? Infinity) -
      Math.min(right.lexicalRank ?? Infinity, right.vectorRank ?? Infinity) ||
    left.id.localeCompare(right.id));

  results.forEach((result, index) => {
    result.fusedRank = index + 1;
  });
  return { mode, profile: structuredClone(profile), rrfK, fusionMs: elapsedSince(startedAt), results };
}

export interface HybridVectorStoreOptions {
  mode?: FusionMode;
  candidateK?: number;
  rrfK?: number;
}

/** In-memory orchestration; production backends still need durable storage. */
export class HybridVectorStore implements VectorStore {
  readonly strategy: string;
  readonly candidateRetriever: DualCandidateRetriever;
  private readonly mode: FusionMode;
  private readonly candidateK: number;
  private readonly rrfK: number;

  constructor(
    private readonly lexical: VectorStore,
    private readonly vector: VectorStore,
    options: HybridVectorStoreOptions = {},
  ) {
    this.mode = options.mode ?? "adaptive";
    this.candidateK = options.candidateK ?? DEFAULT_CANDIDATE_K;
    this.rrfK = options.rrfK ?? DEFAULT_RRF_K;
    if (!Number.isInteger(this.candidateK) || this.candidateK < 1) {
      throw new Error("Candidate K must be a positive integer.");
    }
    this.strategy = `${this.mode}-rrf-v1`;
    this.candidateRetriever = new DualCandidateRetriever(lexical, vector);
  }

  async replaceDocumentChunks(
    projectId: string,
    documentId: string,
    chunks: KnowledgeChunk[],
  ): Promise<void> {
    // Embed first so a failed remote request leaves the lexical index untouched.
    await this.vector.replaceDocumentChunks(projectId, documentId, chunks);
    await this.lexical.replaceDocumentChunks(projectId, documentId, chunks);
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    await this.vector.deleteDocument(projectId, documentId);
    await this.lexical.deleteDocument(projectId, documentId);
  }

  async queryWithTrace(request: VectorQuery): Promise<HybridQueryTrace> {
    const candidates = await this.candidateRetriever.retrieve({
      ...request,
      topK: Math.max(request.topK, this.candidateK),
    });
    const profile = this.mode === "fixed" ? fixedQueryProfile() : profileQuery(request.text);
    const fusion = fuseCandidates(candidates, profile, this.rrfK, this.mode);
    return { candidates, fusion };
  }

  async query(request: VectorQuery): Promise<RetrievalHit[]> {
    const trace = await this.queryWithTrace(request);
    return trace.fusion.results.slice(0, request.topK);
  }
}
