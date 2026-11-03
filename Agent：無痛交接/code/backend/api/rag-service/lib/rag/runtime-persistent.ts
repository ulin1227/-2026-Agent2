import {
  D1DocumentRepository,
  D1PersistentVectorStore,
  deleteOriginalDocument,
  putOriginalDocument,
  type D1RetrievalMode,
} from "../../db/rag-store";
import { EvidenceOnlyAnswerGenerator } from "./answer";
import { createOpenAIEmbeddingProviderFromEnvironment } from "./embeddings/openai";
import { IndexingService } from "./indexing";
import { RetrievalService } from "./retrieval";
import type { RagRuntime } from "./runtime";

export function createPersistentRuntime(): RagRuntime {
  const mode = (process.env.RAG_RETRIEVAL_MODE?.trim().toLocaleLowerCase() || "hybrid") as D1RetrievalMode;
  if (mode !== "lexical" && mode !== "embedding" && mode !== "hybrid") {
    throw new Error("RAG_RETRIEVAL_MODE must be lexical, embedding, or hybrid.");
  }
  const embeddings = mode === "lexical" ? undefined : createOpenAIEmbeddingProviderFromEnvironment();
  const documents = new D1DocumentRepository();
  const vectors = new D1PersistentVectorStore(mode, embeddings);
  const initializedAt = new Date().toISOString();

  return {
    indexing: new IndexingService(documents, vectors),
    retrieval: new RetrievalService(vectors),
    answerGenerator: new EvidenceOnlyAnswerGenerator(),
    knowledge: {
      storage: "d1+r2",
      persistOriginal: putOriginalDocument,
      async deleteDocument(projectId, documentId) {
        await vectors.deleteDocument(projectId, documentId);
        await documents.delete(projectId, documentId);
        await deleteOriginalDocument(projectId, documentId);
      },
      listDocuments: (projectId) => documents.listAll(projectId),
    },
    admin: {
      async snapshot(projectId) {
        let embeddingHost: string | null = null;
        try {
          embeddingHost = process.env.RAG_EMBEDDING_BASE_URL
            ? new URL(process.env.RAG_EMBEDDING_BASE_URL).host
            : null;
        } catch {
          embeddingHost = "invalid-url";
        }
        const [storedDocuments, chunks] = await Promise.all([
          documents.listAll(projectId),
          vectors.listChunks(projectId),
        ]);
        return {
          retrievalMode: mode,
          strategy: vectors.strategy,
          embeddingConfigured: Boolean(embeddings),
          embeddingModel: embeddings?.model ?? null,
          embeddingHost,
          storage: "d1+r2",
          initializedAt,
          documents: storedDocuments,
          chunks,
        };
      },
    },
  };
}
