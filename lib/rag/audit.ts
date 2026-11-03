import type { FusedRetrievalHit } from "./hybrid";
import type { RetrievalHit } from "./contracts";

export interface AuditCitation {
  chunkId: string;
  fileName: string;
  locator: string;
  rank: number;
}

export interface RetrievalAuditRecord {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  projectId: string;
  question: string;
  strategy: string;
  topK: number;
  resultCount: number;
  latencyMs: number;
  queryType: string | null;
  lexicalWeight: number | null;
  vectorWeight: number | null;
  citations: AuditCitation[];
}

const auditKey = Symbol.for("handoff-atlas.rag-audit-memory-v1");
type GlobalWithAudit = typeof globalThis & { [auditKey]?: RetrievalAuditRecord[] };

function memoryRecords(): RetrievalAuditRecord[] {
  const target = globalThis as GlobalWithAudit;
  target[auditKey] ??= [];
  return target[auditKey];
}

function isFused(hit: RetrievalHit | undefined): hit is FusedRetrievalHit {
  return Boolean(hit && "fusedRank" in hit);
}

export async function recordRetrievalAudit(input: {
  actorEmail?: string | null;
  projectId: string;
  question: string;
  strategy: string;
  topK: number;
  hits: RetrievalHit[];
  latencyMs: number;
}): Promise<void> {
  const first = input.hits[0];
  const record: RetrievalAuditRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    actorEmail: input.actorEmail ?? null,
    projectId: input.projectId,
    question: input.question,
    strategy: input.strategy,
    topK: input.topK,
    resultCount: input.hits.length,
    latencyMs: Number(input.latencyMs.toFixed(3)),
    queryType: isFused(first) ? first.queryType : null,
    lexicalWeight: isFused(first) ? first.lexicalWeight : null,
    vectorWeight: isFused(first) ? first.vectorWeight : null,
    citations: input.hits.map((hit, index) => ({
      chunkId: hit.id,
      fileName: hit.metadata.fileName,
      locator: hit.metadata.locator,
      rank: index + 1,
    })),
  };

  const memory = memoryRecords();
  memory.unshift(structuredClone(record));
  if (memory.length > 250) memory.length = 250;

  try {
    const database = await import("../../db/rag-audit");
    await database.insertRetrievalAudit(record);
  } catch {
    // Local Node tests and unbound development runtimes intentionally use memory.
  }
}

export async function listRetrievalAudits(
  projectId?: string,
  limit = 50,
): Promise<{ backend: "d1" | "memory"; records: RetrievalAuditRecord[] }> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  try {
    const database = await import("../../db/rag-audit");
    const records = await database.selectRetrievalAudits(projectId, safeLimit);
    return { backend: "d1", records };
  } catch {
    return {
      backend: "memory",
      records: memoryRecords()
        .filter((record) => !projectId || record.projectId === projectId)
        .slice(0, safeLimit)
        .map((record) => structuredClone(record)),
    };
  }
}
