import type {
  EmbeddingProvider,
  KnowledgeChunk,
  RetrievalHit,
  VectorQuery,
  VectorStore,
} from "./contracts";

interface EmbeddedChunk {
  chunk: KnowledgeChunk;
  vector: number[];
}

function vectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("Cannot compare vectors with different dimensions.");
  }
  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);
  if (leftNorm === 0 || rightNorm === 0) throw new Error("Cannot compare zero-length vectors.");
  let dotProduct = 0;
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
  }
  return dotProduct / (leftNorm * rightNorm);
}

/** Real embeddings with in-memory cosine search; useful for evaluation, not production storage. */
export class MemoryEmbeddingVectorStore implements VectorStore {
  readonly strategy: string;
  private readonly entries = new Map<string, EmbeddedChunk>();
  private readonly embeddings: EmbeddingProvider;

  constructor(embeddings: EmbeddingProvider) {
    this.embeddings = embeddings;
    this.strategy = `memory-cosine:${embeddings.model}`;
  }

  async replaceDocumentChunks(
    projectId: string,
    documentId: string,
    chunks: KnowledgeChunk[],
  ): Promise<void> {
    for (const chunk of chunks) {
      if (chunk.metadata.projectId !== projectId || chunk.metadata.documentId !== documentId) {
        throw new Error("Chunk metadata does not match its document boundary.");
      }
    }
    const vectors = await this.embeddings.embedDocuments(chunks.map((chunk) => chunk.text));
    if (vectors.length !== chunks.length) throw new Error("Embedding count does not match chunk count.");
    const dimension = vectors[0]?.length;
    if (vectors.some((vector) => vector.length === 0 || vector.length !== dimension || vectorNorm(vector) === 0)) {
      throw new Error("Embedding provider returned invalid vector dimensions.");
    }

    await this.deleteDocument(projectId, documentId);
    chunks.forEach((chunk, index) => {
      this.entries.set(`${projectId}\u0000${chunk.id}`, {
        chunk: structuredClone(chunk),
        vector: [...vectors[index]],
      });
    });
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.chunk.metadata.projectId === projectId &&
          entry.chunk.metadata.documentId === documentId) {
        this.entries.delete(key);
      }
    }
  }

  async query(request: VectorQuery): Promise<RetrievalHit[]> {
    const queryVector = await this.embeddings.embedQuery(request.text);
    return Array.from(this.entries.values())
      .filter((entry) => entry.chunk.metadata.projectId === request.projectId)
      .map((entry) => ({
        ...structuredClone(entry.chunk),
        score: Number(cosineSimilarity(queryVector, entry.vector).toFixed(8)),
      }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, request.topK);
  }

  getChunks(projectId?: string): KnowledgeChunk[] {
    return Array.from(this.entries.values())
      .filter((entry) => !projectId || entry.chunk.metadata.projectId === projectId)
      .map((entry) => structuredClone(entry.chunk));
  }
}
