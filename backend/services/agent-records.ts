import { conversations, knowledgeModes, type Conversation, type Source } from "@/shared/data/fm06";
import type { AgentReply, ConnectorStatus, RagContext, ToneProfile } from "./agent";

type KnowledgeModeId = (typeof knowledgeModes)[number]["id"];

export type AgentRecord = {
  id: string;
  jobId: string;
  topic: string;
  user: string;
  status: AgentReply["status"];
  confidence: number;
  question: string;
  answer: string;
  recommendation: string;
  sources: Source[];
  claims: AgentReply["guardrail"]["claims"];
  provider: AgentReply["meta"]["provider"];
  mode: KnowledgeModeId;
  modeLabel: string;
  projectId: string;
  seniorId: string;
  createdAt: string;
  toneProfile: ToneProfile;
  connectors: ConnectorStatus[];
  rag: RagContext;
  sourceType: "agent-live" | "seed";
};

type AgentRecordStore = {
  records: AgentRecord[];
};

const globalStore = globalThis as typeof globalThis & {
  __fm06AgentRecordStore?: AgentRecordStore;
};

function getStore() {
  globalStore.__fm06AgentRecordStore ??= { records: [] };
  return globalStore.__fm06AgentRecordStore;
}

function fallbackToneProfile(): ToneProfile {
  return {
    profileId: "seed-admin-tone",
    speakerName: "管理頁範例",
    source: "default",
    status: "fallback",
    sampleCount: 0,
    traits: ["展示審查欄位", "標示來源狀態", "等待真實 Agent 紀錄"],
    summary: "目前尚未收到使用者頁面的真實 Agent 回覆，因此先顯示範例資料。",
    styleInstruction: "這筆資料只用於展示管理者頁面的審查欄位。",
  };
}

function seedRecordFromConversation(conversation: Conversation): AgentRecord {
  return {
    id: conversation.id,
    jobId: `seed-${conversation.id}`,
    topic: conversation.topic,
    user: conversation.user,
    status: conversation.status,
    confidence: conversation.confidence,
    question: conversation.question,
    answer: conversation.answer,
    recommendation: conversation.recommendation,
    sources: conversation.sources,
    claims: conversation.claims,
    provider: "local-codex-mock",
    mode: "project-map",
    modeLabel: "企劃地圖",
    projectId: "fm06",
    seniorId: "senior-lin",
    createdAt: "2026-07-23T09:00:00+08:00",
    toneProfile: fallbackToneProfile(),
    connectors: [
      {
        name: "rag",
        status: "pending",
        records: 0,
        note: "範例資料尚未串接 RAG。",
      },
    ],
    rag: {
      status: "pending",
      chunks: conversation.sources,
      note: "範例資料只用於管理者頁面初始展示。",
      evidenceMode: "demo",
    },
    sourceType: "seed",
  };
}

export function listAgentRecords() {
  const liveRecords = getStore().records;
  if (liveRecords.length) return liveRecords;
  return conversations.map(seedRecordFromConversation);
}

export function saveAgentRecord(params: {
  question: string;
  mode: KnowledgeModeId;
  projectId: string;
  seniorId: string;
  reply: AgentReply;
}) {
  const mode = knowledgeModes.find((item) => item.id === params.mode) ?? knowledgeModes[0];
  const record: AgentRecord = {
    id: params.reply.jobId,
    jobId: params.reply.jobId,
    topic: mode.label,
    user: "新人測試帳號",
    status: params.reply.status,
    confidence: params.reply.confidence,
    question: params.question,
    answer: params.reply.answer,
    recommendation: params.reply.guardrail.recommendation,
    sources: params.reply.sources,
    claims: params.reply.guardrail.claims,
    provider: params.reply.meta.provider,
    mode: params.mode,
    modeLabel: mode.label,
    projectId: params.projectId,
    seniorId: params.seniorId,
    createdAt: new Date().toISOString(),
    toneProfile: params.reply.toneProfile,
    connectors: params.reply.connectors,
    rag: params.reply.rag,
    sourceType: "agent-live",
  };

  const store = getStore();
  store.records = [record, ...store.records].slice(0, 30);
  return record;
}
