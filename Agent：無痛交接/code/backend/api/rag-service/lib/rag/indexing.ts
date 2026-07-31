import { parseDocx } from "../docx/parse";
import { chunkDocument } from "./chunker";
import type {
  DocumentRepository,
  IndexedDocument,
  KnowledgeSource,
  SourceDocument,
  VectorStore,
} from "./contracts";
import { DOCX_MIME_TYPE } from "./contracts";
import { calculateDocumentDiff } from "./diff";
import { sha256 } from "./digest";

export interface SyncFailure {
  documentId: string;
  fileName: string;
  operation: "index" | "delete";
  code: "CONTENT_CHANGED" | "UNSUPPORTED_TYPE" | "PROCESSING_FAILED";
}

export interface SyncSummary {
  projectId: string;
  sourceKey: string;
  added: number;
  updated: number;
  unchanged: number;
  deleted: number;
  indexedChunks: number;
  failures: SyncFailure[];
}

export class IndexingService {
  private readonly documents: DocumentRepository;
  private readonly vectors: VectorStore;

  constructor(
    documents: DocumentRepository,
    vectors: VectorStore,
  ) {
    this.documents = documents;
    this.vectors = vectors;
  }

  async sync(projectId: string, source: KnowledgeSource): Promise<SyncSummary> {
    const current = await source.listDocuments(projectId);
    const indexed = await this.documents.listBySource(projectId, source.sourceKey);
    const diff = calculateDocumentDiff(current, indexed);
    const summary: SyncSummary = {
      projectId,
      sourceKey: source.sourceKey,
      added: diff.added.length,
      updated: diff.updated.length,
      unchanged: diff.unchanged.length,
      deleted: 0,
      indexedChunks: 0,
      failures: [],
    };

    for (const previous of diff.deleted) {
      try {
        await this.vectors.deleteDocument(projectId, previous.documentId);
        await this.documents.delete(projectId, previous.documentId);
        summary.deleted += 1;
      } catch {
        summary.failures.push({
          documentId: previous.documentId,
          fileName: previous.fileName,
          operation: "delete",
          code: "PROCESSING_FAILED",
        });
      }
    }

    for (const [index, document] of [...diff.added, ...diff.updated].entries()) {
      await this.indexDocument(document, source.sourceKey, index, summary);
    }
    return summary;
  }

  private async indexDocument(
    source: SourceDocument,
    sourceKey: string,
    documentIndex: number,
    summary: SyncSummary,
  ): Promise<void> {
    if (source.mimeType !== DOCX_MIME_TYPE) {
      summary.failures.push({
        documentId: source.documentId,
        fileName: source.fileName,
        operation: "index",
        code: "UNSUPPORTED_TYPE",
      });
      return;
    }

    try {
      const content = await source.readContent();
      if (await sha256(content) !== source.checksum) {
        summary.failures.push({
          documentId: source.documentId,
          fileName: source.fileName,
          operation: "index",
          code: "CONTENT_CHANGED",
        });
        return;
      }
      const parsed = await parseDocx(content, source.fileName, documentIndex + 1);
      const chunks = chunkDocument(source, parsed);
      await this.vectors.replaceDocumentChunks(source.projectId, source.documentId, chunks);
      const record: IndexedDocument = {
        documentId: source.documentId,
        projectId: source.projectId,
        sourceKey,
        relativePath: source.relativePath,
        fileName: source.fileName,
        mimeType: source.mimeType,
        size: source.size,
        modifiedAt: source.modifiedAt,
        checksum: source.checksum,
        version: source.version,
        indexedAt: new Date().toISOString(),
        chunkCount: chunks.length,
      };
      await this.documents.upsert(record);
      summary.indexedChunks += chunks.length;
    } catch {
      summary.failures.push({
        documentId: source.documentId,
        fileName: source.fileName,
        operation: "index",
        code: "PROCESSING_FAILED",
      });
    }
  }
}
