import { createAgentReply, type AgentRequest } from "@/backend/services/agent";
import { saveAgentRecord } from "@/backend/services/agent-records";
import { knowledgeModes } from "@/shared/data/fm06";

type KnowledgeModeId = (typeof knowledgeModes)[number]["id"];

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeMode(value: unknown): KnowledgeModeId {
  const input = asString(value, "project-map");
  return knowledgeModes.some((item) => item.id === input)
    ? (input as KnowledgeModeId)
    : "project-map";
}

async function buildReply(request: Request, legacyChat = false) {
  const body = (await request.json().catch(() => ({}))) as AgentRequest;
  const reply = await createAgentReply(
    legacyChat
      ? {
          ...body,
          conversationType: body.conversationType ?? "handoff",
        }
      : body,
  );

  saveAgentRecord({
    question: asString(body.question, "我今天應該先確認哪一段？"),
    mode: normalizeMode(body.mode),
    projectId: asString(body.projectId, "fm06"),
    seniorId: asString(body.seniorId, "senior-lin"),
    reply,
  });

  return reply;
}

export async function postAgentReply(request: Request) {
  const reply = await buildReply(request);
  return Response.json(reply);
}

export async function postLegacyChat(request: Request) {
  const reply = await buildReply(request, true);

  return Response.json({
    jobId: reply.jobId,
    answer: reply.answer,
    contentBlocks: reply.contentBlocks,
    confidence: reply.confidence,
    status: reply.status,
    sources: reply.sources,
    guardrail: reply.guardrail,
    toneProfile: reply.toneProfile,
    connectors: reply.connectors,
    rag: reply.rag,
  });
}
