import type { RetrievalResult, VectorStore } from "./contracts";

export class RetrievalService {
  private readonly vectors: VectorStore;

  constructor(vectors: VectorStore) {
    this.vectors = vectors;
  }

  async retrieve(projectId: string, question: string, topK: number): Promise<RetrievalResult> {
    return {
      strategy: this.vectors.strategy,
      hits: await this.vectors.query({ projectId, text: question, topK }),
    };
  }
}
