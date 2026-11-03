export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface SourceDocument {
  /** Stable for a document path inside a project, independent of its contents. */
  documentId: string;
  projectId: string;
  relativePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  modifiedAt: string;
  checksum: string;
  version?: string;
  readContent(): Promise<ArrayBuffer>;
}

export interface KnowledgeSource {
  /** Identifies both the physical source and the enumerated range for diffing. */
  readonly sourceKey: string;
  listDocuments(projectId: string): Promise<SourceDocument[]>;
}

export interface IndexedDocument {
  documentId: string;
  projectId: string;
  sourceKey: string;
  relativePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  modifiedAt: string;
  checksum: string;
  version?: string;
  indexedAt: string;
  chunkCount: number;
}

export interface ChunkMetadata {
  projectId: string;
  documentId: string;
  relativePath: string;
  fileName: string;
  locator: string;
  locators: string[];
  chunkIndex: number;
  kind: string;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface RetrievalHit extends KnowledgeChunk {
  score: number;
}

export interface EmbeddingProvider {
  readonly model: string;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface DocumentRepository {
  listBySource(projectId: string, sourceKey: string): Promise<IndexedDocument[]>;
  upsert(document: IndexedDocument): Promise<void>;
  delete(projectId: string, documentId: string): Promise<void>;
}

export interface VectorQuery {
  projectId: string;
  text: string;
  topK: number;
}

export interface VectorStore {
  /** Public strategy label returned by the retrieval API. */
  readonly strategy: string;
  /** Replaces all chunks for one document, preventing stale chunk remnants. */
  replaceDocumentChunks(
    projectId: string,
    documentId: string,
    chunks: KnowledgeChunk[],
  ): Promise<void>;
  deleteDocument(projectId: string, documentId: string): Promise<void>;
  query(request: VectorQuery): Promise<RetrievalHit[]>;
}

export interface RetrievalResult {
  strategy: string;
  hits: RetrievalHit[];
}

export interface AnswerResult {
  answer: string;
  generated: boolean;
  generator: string;
}

export interface AnswerGenerator {
  generate(question: string, evidence: RetrievalHit[]): Promise<AnswerResult>;
}
