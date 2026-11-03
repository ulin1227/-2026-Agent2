import { listRetrievalAudits, type RetrievalAuditRecord } from "./audit";
import { getRagRuntime } from "./runtime";

export interface AdminOverview {
  admin: { email: string; displayName: string; localDevelopment: boolean };
  status: {
    retrievalMode: string;
    strategy: string;
    embeddingConfigured: boolean;
    embeddingModel: string | null;
    embeddingHost: string | null;
    indexStorage: string;
    auditStorage: string;
    initializedAt: string;
    lastIndexedAt: string | null;
  };
  projects: string[];
  counts: { documents: number; chunks: number; retrievals: number };
  documents: Array<{
    documentId: string;
    projectId: string;
    fileName: string;
    mimeType: string;
    size: number;
    modifiedAt: string;
    indexedAt: string;
    chunkCount: number;
    checksumPrefix: string;
  }>;
  chunks: Array<{
    chunkId: string;
    text: string;
    projectId: string;
    documentId: string;
    fileName: string;
    locator: string;
    locators: string[];
    chunkIndex: number;
    kind: string;
  }>;
  retrievals: RetrievalAuditRecord[];
}

export async function buildRagAdminOverview(
  projectId: string | undefined,
  admin: AdminOverview["admin"],
): Promise<AdminOverview> {
  const snapshot = await (await getRagRuntime()).admin.snapshot();
  const audits = await listRetrievalAudits(projectId, 50);
  const projects = Array.from(new Set([
    ...snapshot.documents.map((document) => document.projectId),
    ...snapshot.chunks.map((chunk) => chunk.metadata.projectId),
    ...audits.records.map((record) => record.projectId),
  ])).sort();
  const documents = snapshot.documents.filter((document) =>
    !projectId || document.projectId === projectId);
  const chunks = snapshot.chunks.filter((chunk) =>
    !projectId || chunk.metadata.projectId === projectId);

  return {
    admin,
    status: {
      retrievalMode: snapshot.retrievalMode,
      strategy: snapshot.strategy,
      embeddingConfigured: snapshot.embeddingConfigured,
      embeddingModel: snapshot.embeddingModel,
      embeddingHost: snapshot.embeddingHost,
      indexStorage: snapshot.storage,
      auditStorage: audits.backend,
      initializedAt: snapshot.initializedAt,
      lastIndexedAt: documents.map((item) => item.indexedAt).sort().at(-1) ?? null,
    },
    projects,
    counts: {
      documents: documents.length,
      chunks: chunks.length,
      retrievals: audits.records.length,
    },
    documents: documents.map((document) => ({
      documentId: document.documentId,
      projectId: document.projectId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      modifiedAt: document.modifiedAt,
      indexedAt: document.indexedAt,
      chunkCount: document.chunkCount,
      checksumPrefix: document.checksum.slice(0, 12),
    })),
    chunks: chunks.map((chunk) => ({
      chunkId: chunk.id,
      text: chunk.text,
      projectId: chunk.metadata.projectId,
      documentId: chunk.metadata.documentId,
      fileName: chunk.metadata.fileName,
      locator: chunk.metadata.locator,
      locators: chunk.metadata.locators,
      chunkIndex: chunk.metadata.chunkIndex,
      kind: chunk.metadata.kind,
    })),
    retrievals: audits.records,
  };
}
