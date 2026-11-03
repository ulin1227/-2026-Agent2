import { getRagAdminAccess } from "../../../../../lib/rag/admin-auth";
import { buildRagAdminOverview } from "../../../../../lib/rag/admin-overview";
import { EmbeddingConfigurationError } from "../../../../../lib/rag/embeddings/openai";

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const access = await getRagAdminAccess();
  if (access.status === "unauthenticated") return errorResponse("Authentication required.", 401);
  if (access.status === "forbidden") return errorResponse("Administrator access required.", 403);

  try {
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || undefined;
    if (projectId && projectId.length > 120) return errorResponse("projectId is too long.", 400);
    return Response.json(await buildRagAdminOverview(projectId, {
      email: access.user.email,
      displayName: access.user.displayName,
      localDevelopment: access.localDevelopment,
    }));
  } catch (error) {
    if (error instanceof EmbeddingConfigurationError) {
      return errorResponse("RAG embedding configuration is incomplete.", 503);
    }
    console.error("RAG admin overview failed", error);
    return errorResponse("Unable to load the RAG administration overview.", 500);
  }
}
