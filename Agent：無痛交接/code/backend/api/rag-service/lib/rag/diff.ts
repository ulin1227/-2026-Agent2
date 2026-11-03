import type { IndexedDocument, SourceDocument } from "./contracts";

export interface DocumentDiff {
  added: SourceDocument[];
  updated: SourceDocument[];
  unchanged: SourceDocument[];
  deleted: IndexedDocument[];
}

export function calculateDocumentDiff(
  current: SourceDocument[],
  indexed: IndexedDocument[],
): DocumentDiff {
  const currentById = new Map<string, SourceDocument>();
  for (const document of current) {
    if (currentById.has(document.documentId)) {
      throw new Error(`Duplicate source documentId: ${document.documentId}`);
    }
    currentById.set(document.documentId, document);
  }

  const indexedById = new Map(indexed.map((document) => [document.documentId, document]));
  const result: DocumentDiff = { added: [], updated: [], unchanged: [], deleted: [] };

  for (const document of current) {
    const previous = indexedById.get(document.documentId);
    if (!previous) result.added.push(document);
    else if (previous.checksum === document.checksum) result.unchanged.push(document);
    else result.updated.push(document);
  }

  for (const document of indexed) {
    if (!currentById.has(document.documentId)) result.deleted.push(document);
  }
  return result;
}
