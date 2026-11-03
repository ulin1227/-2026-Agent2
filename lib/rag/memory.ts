import type {
  DocumentRepository,
  IndexedDocument,
  KnowledgeChunk,
  RetrievalHit,
  VectorQuery,
  VectorStore,
} from "./contracts";
import { lexicalScore } from "./lexical-scoring";

function documentKey(projectId: string, documentId: string): string {
  return `${projectId}\u0000${documentId}`;
}

export class MemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, IndexedDocument>();

  async listBySource(projectId: string, sourceKey: string): Promise<IndexedDocument[]> {
    return Array.from(this.documents.values())
      .filter((document) => document.projectId === projectId && document.sourceKey === sourceKey)
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  async upsert(document: IndexedDocument): Promise<void> {
    this.documents.set(documentKey(document.projectId, document.documentId), structuredClone(document));
  }

  async delete(projectId: string, documentId: string): Promise<void> {
    this.documents.delete(documentKey(projectId, documentId));
  }

  listAll(projectId?: string): IndexedDocument[] {
    return Array.from(this.documents.values())
      .filter((document) => !projectId || document.projectId === projectId)
      .sort((left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        left.relativePath.localeCompare(right.relativePath))
      .map((document) => structuredClone(document));
  }
}

/** Deterministic test backend. It is not a production vector database. */
export class MemoryLexicalVectorStore implements VectorStore {
  readonly strategy = "deterministic-lexical-v1";
  private readonly chunks = new Map<string, KnowledgeChunk>();

  async replaceDocumentChunks(
    projectId: string,
    documentId: string,
    chunks: KnowledgeChunk[],
  ): Promise<void> {
    await this.deleteDocument(projectId, documentId);
    for (const chunk of chunks) {
      if (chunk.metadata.projectId !== projectId || chunk.metadata.documentId !== documentId) {
        throw new Error("Chunk metadata does not match its document boundary.");
      }
      this.chunks.set(`${projectId}\u0000${chunk.id}`, structuredClone(chunk));
    }
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    for (const [key, chunk] of this.chunks) {
      if (chunk.metadata.projectId === projectId && chunk.metadata.documentId === documentId) {
        this.chunks.delete(key);
      }
    }
  }

  async query(request: VectorQuery): Promise<RetrievalHit[]> {
    return Array.from(this.chunks.values())
      .filter((chunk) => chunk.metadata.projectId === request.projectId)
      .map((chunk) => ({ ...structuredClone(chunk), score: lexicalScore(request.text, chunk.text) }))
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, request.topK);
  }

  getChunks(projectId?: string): KnowledgeChunk[] {
    return Array.from(this.chunks.values())
      .filter((chunk) => !projectId || chunk.metadata.projectId === projectId)
      .map((chunk) => structuredClone(chunk));
  }
}
