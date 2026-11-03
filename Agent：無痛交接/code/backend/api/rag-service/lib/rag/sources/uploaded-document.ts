import { MAX_SOURCE_FILE_SIZE } from "../config";
import { DOCX_MIME_TYPE, type KnowledgeSource, type SourceDocument } from "../contracts";
import { sha256, stableDocumentId } from "../digest";

export class UploadedDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadedDocumentError";
  }
}

export function normalizeUploadedRelativePath(value: string): string {
  const normalized = value.normalize("NFKC").replaceAll("\\", "/").trim();
  if (!normalized || normalized.length > 512 || normalized.includes("\0") ||
      normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)) {
    throw new UploadedDocumentError("relativePath must be a safe relative DOCX path.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new UploadedDocumentError("relativePath cannot traverse or contain empty segments.");
  }
  if (!parts.at(-1)?.toLocaleLowerCase().endsWith(".docx")) {
    throw new UploadedDocumentError("Only DOCX files are supported.");
  }
  return parts.join("/");
}

export async function createUploadedDocument(input: {
  projectId: string;
  relativePath: string;
  content: ArrayBuffer;
  modifiedAt?: string;
}): Promise<{ source: KnowledgeSource; document: SourceDocument }> {
  const relativePath = normalizeUploadedRelativePath(input.relativePath);
  if (input.content.byteLength <= 0 || input.content.byteLength > MAX_SOURCE_FILE_SIZE) {
    throw new UploadedDocumentError(
      `DOCX size must be between 1 byte and ${MAX_SOURCE_FILE_SIZE} bytes.`,
    );
  }
  const bytes = input.content.slice(0);
  const checksum = await sha256(bytes);
  const documentId = await stableDocumentId(input.projectId, relativePath);
  const document: SourceDocument = {
    documentId,
    projectId: input.projectId,
    relativePath,
    fileName: relativePath.split("/").at(-1)!,
    mimeType: DOCX_MIME_TYPE,
    size: bytes.byteLength,
    modifiedAt: input.modifiedAt ?? new Date().toISOString(),
    checksum,
    version: checksum.slice(0, 16),
    readContent: async () => bytes.slice(0),
  };
  return {
    document,
    source: {
      sourceKey: `upload:${documentId}`,
      listDocuments: async (projectId) => projectId === input.projectId ? [document] : [],
    },
  };
}
