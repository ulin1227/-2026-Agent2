import { getRagRuntime } from "../../../../lib/rag/runtime";
import { EmbeddingConfigurationError } from "../../../../lib/rag/embeddings/openai";
import {
  createDefaultLocalFolderSource,
  LocalFolderSourceError,
} from "../../../../lib/rag/sources/local-folder";
import {
  parseSyncRequest,
  readJson,
  RequestValidationError,
} from "../../../../lib/rag/validation";
import { authorizeRagService } from "../../../../lib/rag/service-auth";

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const access = authorizeRagService(request);
  if (!access.allowed) return jsonError(access.error, access.status);
  try {
    const input = parseSyncRequest(await readJson(request));
    const source = createDefaultLocalFolderSource(input.source.scope);
    const result = await (await getRagRuntime()).indexing.sync(input.projectId, source);
    return Response.json({ status: result.failures.length ? "completed_with_errors" : "completed", result });
  } catch (error) {
    if (error instanceof RequestValidationError ||
        error instanceof LocalFolderSourceError && error.code === "INVALID_SCOPE") {
      return jsonError(error.message, 400);
    }
    if (error instanceof LocalFolderSourceError) {
      return jsonError(
        "Local folder source is unavailable in this runtime. Configure a server-side KnowledgeSource adapter.",
        503,
      );
    }
    if (error instanceof EmbeddingConfigurationError) {
      return jsonError("Embedding retrieval is enabled but its server configuration is incomplete.", 503);
    }
    console.error("knowledge sync failed", error);
    return jsonError("Knowledge sync failed.", 500);
  }
}
