import { env } from "cloudflare:workers";
import type {
  DocumentRepository,
  EmbeddingProvider,
  IndexedDocument,
  KnowledgeChunk,
  RetrievalHit,
  SourceDocument,
  VectorQuery,
  VectorStore,
} from "../lib/rag/contracts";
import { cosineSimilarity } from "../lib/rag/embedding-memory";
import {
  DEFAULT_CANDIDATE_K,
  DEFAULT_RRF_K,
  fixedQueryProfile,
  fuseCandidates,
  type CandidateSet,
  type HybridCandidate,
} from "../lib/rag/hybrid";
import { lexicalScore } from "../lib/rag/lexical-scoring";

const MAX_PROJECT_CHUNKS = 2_000;
const MAX_DOCUMENT_CHUNKS = 1_000;

interface DocumentRow {
  document_id: string;
  project_id: string;
  source_key: string;
  relative_path: string;
  file_name: string;
  mime_type: string;
  size: number;
  modified_at: string;
  checksum: string;
  version: string | null;
  indexed_at: string;
  chunk_count: number;
}

interface ChunkRow {
  id: string;
  project_id: string;
  document_id: string;
  text: string;
  metadata_json: string;
  embedding_json: string | null;
  embedding_model: string | null;
}

function bindings(): { DB: D1Database; RAG_FILES?: R2Bucket } {
  const bound = env as unknown as { DB?: D1Database; RAG_FILES?: R2Bucket };
  if (!bound.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return { DB: bound.DB, RAG_FILES: bound.RAG_FILES };
}

function objectKeyFor(projectId: string, documentId: string): string {
  return `rag/${encodeURIComponent(projectId)}/${documentId}.docx`;
}

function rowToDocument(row: DocumentRow): IndexedDocument {
  return {
    documentId: row.document_id,
    projectId: row.project_id,
    sourceKey: row.source_key,
    relativePath: row.relative_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.size,
    modifiedAt: row.modified_at,
    checksum: row.checksum,
    version: row.version ?? undefined,
    indexedAt: row.indexed_at,
    chunkCount: row.chunk_count,
  };
}

function parseChunk(row: ChunkRow): KnowledgeChunk {
  const metadata = JSON.parse(row.metadata_json) as KnowledgeChunk["metadata"];
  if (metadata.projectId !== row.project_id || metadata.documentId !== row.document_id) {
    throw new Error("Stored chunk metadata does not match its D1 isolation columns.");
  }
  return { id: row.id, text: row.text, metadata };
}

function finiteVector(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new Error("Stored embedding is invalid.");
  }
  return value as number[];
}

function elapsed(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

export class D1DocumentRepository implements DocumentRepository {
  async listBySource(projectId: string, sourceKey: string): Promise<IndexedDocument[]> {
    const result = await bindings().DB.prepare(`
      SELECT document_id, project_id, source_key, relative_path, file_name, mime_type,
             size, modified_at, checksum, version, indexed_at, chunk_count
      FROM rag_documents WHERE project_id = ? AND source_key = ? ORDER BY relative_path
    `).bind(projectId, sourceKey).all<DocumentRow>();
    return result.results.map(rowToDocument);
  }

  async listAll(projectId?: string): Promise<IndexedDocument[]> {
    const statement = projectId
      ? bindings().DB.prepare(`
          SELECT document_id, project_id, source_key, relative_path, file_name, mime_type,
                 size, modified_at, checksum, version, indexed_at, chunk_count
          FROM rag_documents WHERE project_id = ? ORDER BY relative_path
        `).bind(projectId)
      : bindings().DB.prepare(`
          SELECT document_id, project_id, source_key, relative_path, file_name, mime_type,
                 size, modified_at, checksum, version, indexed_at, chunk_count
          FROM rag_documents ORDER BY project_id, relative_path
        `);
    const result = await statement.all<DocumentRow>();
    return result.results.map(rowToDocument);
  }

  async upsert(document: IndexedDocument): Promise<void> {
    await bindings().DB.prepare(`
      INSERT INTO rag_documents (
        document_id, project_id, source_key, object_key, relative_path, file_name,
        mime_type, size, modified_at, checksum, version, indexed_at, chunk_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        project_id = excluded.project_id,
        source_key = excluded.source_key,
        object_key = excluded.object_key,
        relative_path = excluded.relative_path,
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        size = excluded.size,
        modified_at = excluded.modified_at,
        checksum = excluded.checksum,
        version = excluded.version,
        indexed_at = excluded.indexed_at,
        chunk_count = excluded.chunk_count
    `).bind(
      document.documentId,
      document.projectId,
      document.sourceKey,
      objectKeyFor(document.projectId, document.documentId),
      document.relativePath,
      document.fileName,
      document.mimeType,
      document.size,
      document.modifiedAt,
      document.checksum,
      document.version ?? null,
      document.indexedAt,
      document.chunkCount,
    ).run();
  }

  async delete(projectId: string, documentId: string): Promise<void> {
    await bindings().DB.prepare(
      "DELETE FROM rag_documents WHERE project_id = ? AND document_id = ?",
    ).bind(projectId, documentId).run();
  }
}

export type D1RetrievalMode = "lexical" | "embedding" | "hybrid";

export class D1PersistentVectorStore implements VectorStore {
  readonly strategy: string;

  constructor(
    private readonly mode: D1RetrievalMode,
    private readonly embeddings?: EmbeddingProvider,
  ) {
    if (mode !== "lexical" && !embeddings) {
      throw new Error("Embedding provider is required for persistent embedding or hybrid retrieval.");
    }
    this.strategy = mode === "hybrid"
      ? `d1-fixed-rrf:${embeddings?.model}`
      : mode === "embedding"
        ? `d1-cosine:${embeddings?.model}`
        : "d1-deterministic-lexical-v1";
  }

  async replaceDocumentChunks(
    projectId: string,
    documentId: string,
    chunks: KnowledgeChunk[],
  ): Promise<void> {
    if (chunks.length > MAX_DOCUMENT_CHUNKS) {
      throw new Error(`A document cannot exceed ${MAX_DOCUMENT_CHUNKS} persisted chunks.`);
    }
    for (const chunk of chunks) {
      if (chunk.metadata.projectId !== projectId || chunk.metadata.documentId !== documentId) {
        throw new Error("Chunk metadata does not match its document boundary.");
      }
    }
    const vectors = this.embeddings
      ? await this.embeddings.embedDocuments(chunks.map((chunk) => chunk.text))
      : chunks.map(() => null);
    if (vectors.length !== chunks.length) throw new Error("Embedding count does not match chunk count.");
    const dimension = vectors.find((vector): vector is number[] => Array.isArray(vector))?.length;
    if (vectors.some((vector) => vector &&
      (vector.length === 0 || vector.length !== dimension || vector.some((value) => !Number.isFinite(value))))) {
      throw new Error("Embedding provider returned invalid vector dimensions.");
    }

    const db = bindings().DB;
    const statements: D1PreparedStatement[] = [
      db.prepare("DELETE FROM rag_chunks WHERE project_id = ? AND document_id = ?")
        .bind(projectId, documentId),
    ];
    const indexedAt = new Date().toISOString();
    chunks.forEach((chunk, index) => {
      statements.push(db.prepare(`
        INSERT INTO rag_chunks (
          id, project_id, document_id, text, metadata_json,
          embedding_json, embedding_model, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        chunk.id,
        projectId,
        documentId,
        chunk.text,
        JSON.stringify(chunk.metadata),
        vectors[index] ? JSON.stringify(vectors[index]) : null,
        vectors[index] ? this.embeddings?.model ?? null : null,
        indexedAt,
      ));
    });
    await db.batch(statements);
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    await bindings().DB.prepare(
      "DELETE FROM rag_chunks WHERE project_id = ? AND document_id = ?",
    ).bind(projectId, documentId).run();
  }

  private async rowsForProject(projectId: string): Promise<ChunkRow[]> {
    const result = await bindings().DB.prepare(`
      SELECT id, project_id, document_id, text, metadata_json, embedding_json, embedding_model
      FROM rag_chunks WHERE project_id = ? ORDER BY id LIMIT ?
    `).bind(projectId, MAX_PROJECT_CHUNKS + 1).all<ChunkRow>();
    if (result.results.length > MAX_PROJECT_CHUNKS) {
      throw new Error(
        `Project ${projectId} exceeds the ${MAX_PROJECT_CHUNKS}-chunk D1 scan limit; replace this store with a vector backend.`,
      );
    }
    return result.results;
  }

  async query(request: VectorQuery): Promise<RetrievalHit[]> {
    const rows = await this.rowsForProject(request.projectId);
    const chunks = rows.map(parseChunk);
    const lexicalStartedAt = performance.now();
    const lexicalHits = chunks.map((chunk) => ({
      ...chunk,
      score: lexicalScore(request.text, chunk.text),
    })).filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, Math.max(request.topK, DEFAULT_CANDIDATE_K));
    const lexicalMs = elapsed(lexicalStartedAt);
    if (this.mode === "lexical") return lexicalHits.slice(0, request.topK);

    const vectorStartedAt = performance.now();
    const queryVector = await this.embeddings!.embedQuery(request.text);
    const vectorHits = rows.map((row, index) => {
      if (!row.embedding_json || row.embedding_model !== this.embeddings!.model) {
        throw new Error("Persisted chunks must be reindexed for the configured embedding model.");
      }
      return {
        ...chunks[index],
        score: Number(cosineSimilarity(queryVector, finiteVector(JSON.parse(row.embedding_json))).toFixed(8)),
      };
    }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, Math.max(request.topK, DEFAULT_CANDIDATE_K));
    const vectorMs = elapsed(vectorStartedAt);
    if (this.mode === "embedding") return vectorHits.slice(0, request.topK);

    const merged = new Map<string, HybridCandidate>();
    lexicalHits.forEach((hit, index) => merged.set(hit.id, {
      chunk: { id: hit.id, text: hit.text, metadata: structuredClone(hit.metadata) },
      lexical: { rank: index + 1, score: hit.score },
    }));
    vectorHits.forEach((hit, index) => {
      const candidate = merged.get(hit.id);
      if (candidate) candidate.vector = { rank: index + 1, score: hit.score };
      else merged.set(hit.id, {
        chunk: { id: hit.id, text: hit.text, metadata: structuredClone(hit.metadata) },
        vector: { rank: index + 1, score: hit.score },
      });
    });
    const candidates: CandidateSet = {
      candidateK: Math.max(request.topK, DEFAULT_CANDIDATE_K),
      lexicalHits,
      vectorHits,
      candidates: Array.from(merged.values()),
      latency: {
        lexicalMs,
        vectorMs,
        wallMs: Number((lexicalMs + vectorMs).toFixed(3)),
        mergeMs: 0,
        totalMs: Number((lexicalMs + vectorMs).toFixed(3)),
      },
    };
    return fuseCandidates(candidates, fixedQueryProfile(), DEFAULT_RRF_K, "fixed")
      .results.slice(0, request.topK);
  }

  async listChunks(projectId?: string): Promise<KnowledgeChunk[]> {
    const statement = projectId
      ? bindings().DB.prepare(`
          SELECT id, project_id, document_id, text, metadata_json, embedding_json, embedding_model
          FROM rag_chunks WHERE project_id = ? ORDER BY id LIMIT ?
        `).bind(projectId, MAX_PROJECT_CHUNKS)
      : bindings().DB.prepare(`
          SELECT id, project_id, document_id, text, metadata_json, embedding_json, embedding_model
          FROM rag_chunks ORDER BY project_id, id LIMIT ?
        `).bind(MAX_PROJECT_CHUNKS);
    const result = await statement.all<ChunkRow>();
    return result.results.map(parseChunk);
  }
}

export async function putOriginalDocument(source: SourceDocument): Promise<void> {
  const bucket = bindings().RAG_FILES;
  if (!bucket) throw new Error("Cloudflare R2 binding `RAG_FILES` is unavailable.");
  await bucket.put(objectKeyFor(source.projectId, source.documentId), await source.readContent(), {
    httpMetadata: { contentType: source.mimeType },
    customMetadata: {
      projectId: source.projectId,
      documentId: source.documentId,
      fileName: source.fileName,
      checksum: source.checksum,
    },
  });
}

export async function deleteOriginalDocument(projectId: string, documentId: string): Promise<void> {
  const bucket = bindings().RAG_FILES;
  if (!bucket) throw new Error("Cloudflare R2 binding `RAG_FILES` is unavailable.");
  await bucket.delete(objectKeyFor(projectId, documentId));
}
