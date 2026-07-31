import { DOCX_MIME_TYPE } from "../../../../lib/rag/contracts";
import { EmbeddingConfigurationError } from "../../../../lib/rag/embeddings/openai";
import { getRagRuntime } from "../../../../lib/rag/runtime";
import { authorizeRagService } from "../../../../lib/rag/service-auth";
import {
  createUploadedDocument,
  UploadedDocumentError,
} from "../../../../lib/rag/sources/uploaded-document";
import {
  projectIdValue,
  readJson,
  RequestValidationError,
} from "../../../../lib/rag/validation";

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function authorize(request: Request): Response | undefined {
  const access = authorizeRagService(request);
  return access.allowed ? undefined : errorResponse(access.error, access.status);
}

export async function GET(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    const projectId = projectIdValue(new URL(request.url).searchParams.get("projectId"));
    const runtime = await getRagRuntime();
    const documents = await runtime.knowledge.listDocuments(projectId);
    return Response.json({
      projectId,
      storage: runtime.knowledge.storage,
      durable: runtime.knowledge.storage === "d1+r2",
      documents: documents.map((document) => ({
        documentId: document.documentId,
        relativePath: document.relativePath,
        fileName: document.fileName,
        mimeType: document.mimeType,
        size: document.size,
        modifiedAt: document.modifiedAt,
        checksum: document.checksum,
        version: document.version,
        indexedAt: document.indexedAt,
        chunkCount: document.chunkCount,
      })),
    });
  } catch (error) {
    if (error instanceof RequestValidationError) return errorResponse(error.message, 400);
    console.error("knowledge documents list failed", error);
    return errorResponse("Unable to list knowledge documents.", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    if (!/^multipart\/form-data\b/iu.test(request.headers.get("content-type") ?? "")) {
      throw new RequestValidationError("Content-Type must be multipart/form-data.");
    }
    const form = await request.formData();
    const projectId = projectIdValue(form.get("projectId"));
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) {
      throw new RequestValidationError("file is required.");
    }
    if (uploaded.type && uploaded.type !== DOCX_MIME_TYPE && uploaded.type !== "application/octet-stream") {
      throw new RequestValidationError("file must be a DOCX document.");
    }
    const requestedPath = form.get("relativePath");
    if (requestedPath !== null && typeof requestedPath !== "string") {
      throw new RequestValidationError("relativePath must be a string.");
    }
    const { source, document } = await createUploadedDocument({
      projectId,
      relativePath: requestedPath?.trim() || uploaded.name,
      content: await uploaded.arrayBuffer(),
    });
    const runtime = await getRagRuntime();
    await runtime.knowledge.persistOriginal(document);
    const result = await runtime.indexing.sync(projectId, source);
    if (result.failures.length > 0) {
      await runtime.knowledge.deleteDocument(projectId, document.documentId).catch(() => undefined);
      return Response.json({
        status: "rejected",
        projectId,
        documentId: document.documentId,
        failures: result.failures,
      }, { status: 422 });
    }
    return Response.json({
      status: result.added > 0 ? "created" : result.updated > 0 ? "updated" : "unchanged",
      projectId,
      documentId: document.documentId,
      fileName: document.fileName,
      relativePath: document.relativePath,
      checksum: document.checksum,
      indexedChunks: result.indexedChunks,
      storage: runtime.knowledge.storage,
      durable: runtime.knowledge.storage === "d1+r2",
    }, { status: result.added > 0 ? 201 : 200 });
  } catch (error) {
    if (error instanceof RequestValidationError || error instanceof UploadedDocumentError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof EmbeddingConfigurationError) {
      return errorResponse("Embedding retrieval is enabled but its server configuration is incomplete.", 503);
    }
    console.error("knowledge document upload failed", error);
    return errorResponse("Unable to store and index the knowledge document.", 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestValidationError("Request body must be a JSON object.");
    }
    const values = body as Record<string, unknown>;
    const projectId = projectIdValue(values.projectId);
    const documentId = typeof values.documentId === "string" ? values.documentId : "";
    if (!/^doc_[a-f0-9]{32}$/u.test(documentId)) {
      throw new RequestValidationError("documentId has an invalid format.");
    }
    const runtime = await getRagRuntime();
    await runtime.knowledge.deleteDocument(projectId, documentId);
    return Response.json({ status: "deleted", projectId, documentId });
  } catch (error) {
    if (error instanceof RequestValidationError) return errorResponse(error.message, 400);
    console.error("knowledge document deletion failed", error);
    return errorResponse("Unable to delete the knowledge document.", 500);
  }
}
