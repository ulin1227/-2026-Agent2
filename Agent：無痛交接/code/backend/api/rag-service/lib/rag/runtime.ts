import { EvidenceOnlyAnswerGenerator } from "./answer";
import type {
  AnswerGenerator,
  IndexedDocument,
  KnowledgeChunk,
  SourceDocument,
  VectorStore,
} from "./contracts";
import { MemoryEmbeddingVectorStore } from "./embedding-memory";
import { createOpenAIEmbeddingProviderFromEnvironment } from "./embeddings/openai";
import { HybridVectorStore } from "./hybrid";
import { IndexingService } from "./indexing";
import { MemoryDocumentRepository, MemoryLexicalVectorStore } from "./memory";
import { RetrievalService } from "./retrieval";

export interface RagRuntime {
  indexing: IndexingService;
  retrieval: RetrievalService;
  answerGenerator: AnswerGenerator;
  knowledge: {
    storage: "memory" | "d1+r2";
    persistOriginal(document: SourceDocument): Promise<void>;
    deleteDocument(projectId: string, documentId: string): Promise<void>;
    listDocuments(projectId?: string): Promise<IndexedDocument[]>;
  };
  admin: {
    snapshot(projectId?: string): Promise<{
      retrievalMode: string;
      strategy: string;
      embeddingConfigured: boolean;
      embeddingModel: string | null;
      embeddingHost: string | null;
      storage: "memory" | "d1+r2";
      initializedAt: string;
      documents: IndexedDocument[];
      chunks: KnowledgeChunk[];
    }>;
  };
}

const runtimeKey = Symbol.for("handoff-atlas.rag-runtime-v4");
type GlobalWithRag = typeof globalThis & { [runtimeKey]?: Promise<RagRuntime> };

function createMemoryRuntime(): RagRuntime {
  const documents = new MemoryDocumentRepository();
  const mode = process.env.RAG_RETRIEVAL_MODE?.trim().toLocaleLowerCase() || "lexical";
  if (mode !== "lexical" && mode !== "embedding" && mode !== "hybrid") {
    throw new Error("RAG_RETRIEVAL_MODE must be lexical, embedding, or hybrid.");
  }
  const hybridFusionMode = process.env.RAG_HYBRID_FUSION_MODE?.trim().toLocaleLowerCase() || "fixed";
  if (hybridFusionMode !== "fixed" && hybridFusionMode !== "adaptive") {
    throw new Error("RAG_HYBRID_FUSION_MODE must be fixed or adaptive.");
  }
  const lexical = new MemoryLexicalVectorStore();
  let vectors: VectorStore;
  let inspectChunks: (projectId?: string) => KnowledgeChunk[];
  if (mode === "lexical") {
    vectors = lexical;
    inspectChunks = (projectId) => lexical.getChunks(projectId);
  } else {
    const embedding = new MemoryEmbeddingVectorStore(createOpenAIEmbeddingProviderFromEnvironment());
    if (mode === "embedding") {
      vectors = embedding;
      inspectChunks = (projectId) => embedding.getChunks(projectId);
    } else {
      vectors = new HybridVectorStore(lexical, embedding, { mode: hybridFusionMode });
      inspectChunks = (projectId) => lexical.getChunks(projectId);
    }
  }
  const initializedAt = new Date().toISOString();
  return {
    indexing: new IndexingService(documents, vectors),
    retrieval: new RetrievalService(vectors),
    answerGenerator: new EvidenceOnlyAnswerGenerator(),
    knowledge: {
      storage: "memory",
      persistOriginal: async () => undefined,
      async deleteDocument(projectId, documentId) {
        await vectors.deleteDocument(projectId, documentId);
        await documents.delete(projectId, documentId);
      },
      listDocuments: async (projectId) => documents.listAll(projectId),
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
        return {
          retrievalMode: mode,
          strategy: vectors.strategy,
          embeddingConfigured: Boolean(
            process.env.RAG_EMBEDDING_API_KEY &&
            process.env.RAG_EMBEDDING_BASE_URL &&
            process.env.RAG_EMBEDDING_MODEL,
          ),
          embeddingModel: process.env.RAG_EMBEDDING_MODEL ?? null,
          embeddingHost,
          storage: "memory",
          initializedAt,
          documents: documents.listAll(projectId),
          chunks: inspectChunks(projectId),
        };
      },
    },
  };
}

export async function getRagRuntime(): Promise<RagRuntime> {
  const target = globalThis as GlobalWithRag;
  if (!target[runtimeKey]) {
    const configured = process.env.RAG_STORAGE_MODE?.trim().toLocaleLowerCase();
    if (configured && configured !== "memory" && configured !== "d1") {
      throw new Error("RAG_STORAGE_MODE must be memory or d1.");
    }
    const mode = configured || (process.env.NODE_ENV === "production" ? "d1" : "memory");
    target[runtimeKey] = mode === "d1"
      ? import("./runtime-persistent").then((module) => module.createPersistentRuntime())
      : Promise.resolve(createMemoryRuntime());
  }
  return target[runtimeKey];
}
