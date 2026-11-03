import { getRagRuntime } from "../../../../lib/rag/runtime";
import { EmbeddingConfigurationError } from "../../../../lib/rag/embeddings/openai";
import type { FusedRetrievalHit } from "../../../../lib/rag/hybrid";
import { recordRetrievalAudit } from "../../../../lib/rag/audit";
import { authorizeRagService } from "../../../../lib/rag/service-auth";
import {
  parseQueryRequest,
  readJson,
  RequestValidationError,
} from "../../../../lib/rag/validation";

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function fusionRanking(hit: { score: number }): Record<string, unknown> | undefined {
  if (!("fusedRank" in hit)) return undefined;
  const fused = hit as FusedRetrievalHit;
  return {
    fusedRank: fused.fusedRank,
    queryType: fused.queryType,
    lexicalWeight: fused.lexicalWeight,
    vectorWeight: fused.vectorWeight,
    focusWeight: fused.focusWeight,
    fusionReasons: fused.fusionReasons,
    rrfK: fused.rrfK,
    lexicalRank: fused.lexicalRank,
    vectorRank: fused.vectorRank,
    lexicalScore: fused.lexicalScore,
    vectorScore: fused.vectorScore,
    focusRank: fused.focusRank,
    focusScore: fused.focusScore,
    lexicalContribution: fused.lexicalContribution,
    vectorContribution: fused.vectorContribution,
    focusContribution: fused.focusContribution,
    retrievedBy: fused.retrievedBy,
  };
}

export async function POST(request: Request): Promise<Response> {
  const access = authorizeRagService(request);
  if (!access.allowed) return jsonError(access.error, access.status);
  try {
    const input = parseQueryRequest(await readJson(request));
    const runtime = await getRagRuntime();
    const retrievalStartedAt = performance.now();
    const retrieval = await runtime.retrieval.retrieve(input.projectId, input.question, input.topK);
    const retrievalLatencyMs = performance.now() - retrievalStartedAt;
    const answer = await runtime.answerGenerator.generate(input.question, retrieval.hits);
    await recordRetrievalAudit({
      actorEmail: request.headers.get("oai-authenticated-user-email"),
      projectId: input.projectId,
      question: input.question,
      strategy: retrieval.strategy,
      topK: input.topK,
      hits: retrieval.hits,
      latencyMs: retrievalLatencyMs,
    });
    return Response.json({
      projectId: input.projectId,
      question: input.question,
      answer: answer.answer,
      answerGenerated: answer.generated,
      answerGenerator: answer.generator,
      retrievalStrategy: retrieval.strategy,
      evidence: retrieval.hits.map((hit) => ({
        chunkId: hit.id,
        text: hit.text,
        score: hit.score,
        ranking: fusionRanking(hit),
        citation: {
          documentId: hit.metadata.documentId,
          fileName: hit.metadata.fileName,
          locator: hit.metadata.locator,
          locators: hit.metadata.locators,
          chunkIndex: hit.metadata.chunkIndex,
        },
      })),
    });
  } catch (error) {
    if (error instanceof RequestValidationError) return jsonError(error.message, 400);
    if (error instanceof EmbeddingConfigurationError) {
      return jsonError("Embedding retrieval is enabled but its server configuration is incomplete.", 503);
    }
    console.error("assistant query failed", error);
    return jsonError("Assistant query failed.", 500);
  }
}
