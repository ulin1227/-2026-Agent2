import type { Source } from "@/shared/data/fm06";

export type RagEvidenceMode = "rag" | "demo" | "none";

export type RagEvidenceChunk = Source & {
  id: string;
  chunkId?: string;
  documentId?: string;
  retrievalScore?: number;
  mode: RagEvidenceMode;
};

export type RagRetrievalResult = {
  mode: RagEvidenceMode;
  status: "ready" | "pending" | "empty";
  chunks: RagEvidenceChunk[];
  note: string;
};

type RagRetrievalRequest = {
  question: string;
  projectId: string;
  seniorId: string;
  fallbackSources: Source[];
};

type RawRagChunk = {
  id?: unknown;
  chunkId?: unknown;
  documentId?: unknown;
  title?: unknown;
  detail?: unknown;
  text?: unknown;
  content?: unknown;
  owner?: unknown;
  date?: unknown;
  retrievalScore?: unknown;
  score?: unknown;
  citation?: unknown;
};

type RawRagResponse = {
  chunks?: unknown;
  documents?: unknown;
  sources?: unknown;
  evidence?: unknown;
  retrievalStrategy?: unknown;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeRawChunks(body: unknown): RawRagChunk[] {
  if (!body || typeof body !== "object") return [];
  const response = body as RawRagResponse;
  const candidates = response.chunks ?? response.documents ?? response.sources ?? response.evidence;
  return Array.isArray(candidates) ? (candidates as RawRagChunk[]) : [];
}

function buildRagEndpoint() {
  const explicitEndpoint = process.env.RAG_RETRIEVAL_URL?.trim();
  if (explicitEndpoint) return explicitEndpoint;

  const baseUrl = process.env.RAG_BASE_URL?.trim()?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/api/assistant/query` : "";
}

function citationValue(chunk: RawRagChunk): Record<string, unknown> {
  return chunk.citation && typeof chunk.citation === "object" && !Array.isArray(chunk.citation)
    ? (chunk.citation as Record<string, unknown>)
    : {};
}

function fallbackSourceToChunk(source: Source, index: number): RagEvidenceChunk {
  return {
    ...source,
    id: `demo-${index + 1}`,
    mode: "demo",
  };
}

function rawChunkToSource(chunk: RawRagChunk, index: number): RagEvidenceChunk | null {
  const detail = asString(chunk.detail) || asString(chunk.text) || asString(chunk.content);
  if (!detail) return null;

  const citation = citationValue(chunk);
  const id = asString(chunk.id) || asString(chunk.chunkId) || `rag-${index + 1}`;
  const fileName = asString(citation.fileName);
  const locator = asString(citation.locator);
  const chunkIndex =
    typeof citation.chunkIndex === "number" && Number.isFinite(citation.chunkIndex)
      ? `#${citation.chunkIndex}`
      : "";

  return {
    id,
    chunkId: asString(chunk.chunkId) || id,
    documentId: asString(chunk.documentId) || asString(citation.documentId) || undefined,
    title:
      asString(chunk.title) ||
      [fileName, locator || chunkIndex].filter(Boolean).join("｜") ||
      `RAG chunk ${index + 1}`,
    detail,
    owner: asString(chunk.owner, "RAG"),
    date: asString(chunk.date, new Date().toISOString().slice(0, 10)),
    retrievalScore: asNumber(chunk.retrievalScore) ?? asNumber(chunk.score),
    mode: "rag",
  };
}

async function fetchRagEndpoint(params: RagRetrievalRequest): Promise<RagRetrievalResult | null> {
  const endpoint = buildRagEndpoint();
  if (!endpoint) return null;
  const retrievalProjectId = process.env.RAG_PROJECT_ID?.trim() || params.projectId;
  const serviceToken = process.env.RAG_RETRIEVAL_TOKEN ?? process.env.RAG_SERVICE_API_KEY;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(serviceToken ? { authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        question: params.question,
        projectId: retrievalProjectId,
        topK: Number(process.env.RAG_RETRIEVAL_TOP_K ?? 8),
      }),
    });

    if (!response.ok) {
      console.warn("RAG retrieval request failed", response.status, await response.text());
      return {
        mode: "none",
        status: "pending",
        chunks: [],
        note: `RAG endpoint 已設定，但檢索失敗：HTTP ${response.status}。`,
      };
    }

    const body = (await response.json()) as RawRagResponse;
    const retrievalStrategy = asString(body.retrievalStrategy);
    const chunks = normalizeRawChunks(body)
      .map(rawChunkToSource)
      .filter((chunk): chunk is RagEvidenceChunk => Boolean(chunk));

    return {
      mode: chunks.length ? "rag" : "none",
      status: chunks.length ? "ready" : "empty",
      chunks,
      note: chunks.length
        ? `已使用正式 RAG retrieved chunks 作為 output guardrail evidence${
            retrievalStrategy ? `；strategy=${retrievalStrategy}` : ""
          }。`
        : "RAG endpoint 已回應，但沒有取回可用 chunks。",
    };
  } catch (error) {
    console.warn("RAG retrieval request error", error);
    return {
      mode: "none",
      status: "pending",
      chunks: [],
      note: "RAG endpoint 已設定，但檢索時發生錯誤。",
    };
  }
}

export async function retrieveGuardrailEvidence(
  params: RagRetrievalRequest,
): Promise<RagRetrievalResult> {
  const endpointResult = await fetchRagEndpoint(params);
  if (endpointResult) return endpointResult;

  const allowDemoFallback = process.env.RAG_USE_DEMO_SOURCES !== "false";
  if (!allowDemoFallback) {
    return {
      mode: "none",
      status: "pending",
      chunks: [],
      note:
        "RAG 尚未串接；output guardrail 已就緒，但沒有 retrieved chunks 時不產生正式 factual confidence。",
    };
  }

  return {
    mode: "demo",
    status: params.fallbackSources.length ? "ready" : "pending",
    chunks: params.fallbackSources.map(fallbackSourceToChunk),
    note:
      "RAG 尚未串接；目前使用內建 demo sources 驗證 output guardrail 流程，信心分數不可視為正式 RAG factual confidence。",
  };
}
