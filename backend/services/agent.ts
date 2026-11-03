import { conversations, knowledgeModes, type Source } from "@/shared/data/fm06";
import {
  completenessItems,
  completenessSummary,
  handoffDocumentPackage,
  handoffSources,
} from "@/shared/data/handoff-docs";
import {
  fetchWorkspaceContext,
  type CommunicationRecord,
  type WorkspaceConnectorStatus,
} from "@/backend/connectors/workspace-connectors";
import {
  retrieveGuardrailEvidence,
  type RagEvidenceMode,
} from "@/backend/connectors/rag-retriever";

type KnowledgeModeId = (typeof knowledgeModes)[number]["id"];

export type ConversationType = "handoff";

type ConnectorName = "notion" | "slack" | "rag";
type ConnectorState = "ready" | "empty" | "pending";
type AgentProvider = "openclaw" | "local-codex-mock";

export type AgentContentBlock =
  | {
      type: "table";
      title: string;
      columns: string[];
      rows: string[][];
    }
  | {
      type: "checklist";
      title: string;
      items: {
        label: string;
        detail: string;
        status: "todo" | "doing" | "done" | "watch";
      }[];
    }
  | {
      type: "score-bars";
      title: string;
      items: {
        label: string;
        value: number;
        max: number;
        status: "safe" | "review" | "blocked";
      }[];
};

export type ToneProfile = {
  profileId: string;
  speakerName: string;
  source: "notion-slack" | "default";
  status: "matched" | "fallback";
  sampleCount: number;
  traits: string[];
  summary: string;
  styleInstruction: string;
};

export type ConnectorStatus = {
  name: ConnectorName;
  status: ConnectorState;
  records: number;
  note: string;
};

export type RagContext = {
  status: ConnectorState;
  chunks: Source[];
  note: string;
  evidenceMode: RagEvidenceMode;
};

export type GuardrailResult = {
  status: "safe" | "review" | "blocked";
  confidence: number;
  recommendation: string;
  warnings: string[];
  evidenceMode: RagEvidenceMode;
  anchoringScore: number;
  claims: {
    text: string;
    verdict: "支持" | "中立" | "矛盾";
    supportScore?: number;
    contradictionScore?: number;
    evidenceTitle?: string;
    evidenceExcerpt?: string;
    reason?: string;
  }[];
};

export type AgentReply = {
  jobId: string;
  answer: string;
  contentBlocks: AgentContentBlock[];
  status: GuardrailResult["status"];
  confidence: number;
  sources: Source[];
  guardrail: GuardrailResult;
  toneProfile: ToneProfile;
  connectors: ConnectorStatus[];
  rag: RagContext;
  meta: {
    mode: KnowledgeModeId;
    conversationType: ConversationType;
    provider: AgentProvider;
    projectId: string;
    seniorId: string;
  };
};

export type AgentRequest = {
  question?: unknown;
  mode?: unknown;
  conversationType?: unknown;
  projectId?: unknown;
  seniorId?: unknown;
};

type OpenClawConfig = {
  baseUrl: string;
  token: string;
  model: string;
  agentId: string;
  timeoutMs: number;
};

type LocalResponse = {
  answer: string;
  contentBlocks: AgentContentBlock[];
};

const defaultToneProfile: ToneProfile = {
  profileId: "default-senior-tone",
  speakerName: "系統預設前輩",
  source: "default",
  status: "fallback",
  sampleCount: 0,
  traits: ["語氣溫和但明確", "資訊不足時不猜測", "把下一步講清楚"],
  summary:
    "尚未找到可用的 Notion 或 Slack 對話紀錄，因此使用系統預設交接語氣。",
  styleInstruction:
    "用有經驗同事的口吻回答：直接說明要做什麼、原因與下一步；遇到不確定資訊要明確說不足。",
};

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeMode(value: unknown): KnowledgeModeId {
  const input = asString(value, "project-map");
  return knowledgeModes.some((item) => item.id === input)
    ? (input as KnowledgeModeId)
    : "project-map";
}

function normalizeConversationType(): ConversationType {
  return "handoff";
}

function pickConversation(mode: KnowledgeModeId) {
  if (mode === "risks") return conversations[1];
  if (mode === "roadmap") return conversations[0];
  return conversations[0];
}

function buildToneProfile(records: CommunicationRecord[]): ToneProfile {
  if (!records.length) return defaultToneProfile;

  const speakerName = records[0].authorName;
  const sourceTypes = new Set(records.map((record) => record.source));
  const sourceLabel =
    sourceTypes.has("notion") && sourceTypes.has("slack")
      ? "Notion 文件與 Slack 對話"
      : sourceTypes.has("slack")
        ? "Slack 對話"
        : "Notion 文件";

  return {
    profileId: `tone-${records[0].authorId}`,
    speakerName,
    source: "notion-slack",
    status: "matched",
    sampleCount: records.length,
    traits: [
      "說話直接",
      "會把業務、人際、資產三類交接脈絡分開說明",
      "遇到預算、權限或客戶承諾會提醒不要猜",
      "常把下一步拆成可執行的檢查項",
    ],
    summary: `已從${sourceLabel}整理出${speakerName}的交接口吻：直接、重視來源、會提醒新人依三類文件查核。`,
    styleInstruction: `參考${speakerName}在${sourceLabel}中的交接口吻：直接指出來源和文件缺口，最後給新人一個可執行的下一步。`,
  };
}

function buildConnectorStatuses(
  workspaceStatuses: WorkspaceConnectorStatus[],
  ragSources: Source[],
  evidenceMode: RagEvidenceMode,
): ConnectorStatus[] {
  return [
    ...workspaceStatuses,
    {
      name: "rag",
      status: ragSources.length > 0 ? "ready" : "pending",
      records: ragSources.length,
      note:
        evidenceMode === "rag"
          ? "已使用正式 RAG retrieved chunks 進行 output guardrail 比對。"
          : evidenceMode === "demo"
            ? "RAG 介面已預留；目前使用內建 demo sources 驗證 output guardrail 流程。"
            : "RAG 尚未串接或沒有回傳 chunks；output guardrail 只保留安全檢查與攔截流程。",
    },
  ];
}

function buildRagContext(params: {
  ragSources: Source[];
  evidenceMode: RagEvidenceMode;
  note: string;
  status: ConnectorState;
}): RagContext {
  return {
    status: params.status,
    chunks: params.ragSources,
    note: params.note,
    evidenceMode: params.evidenceMode,
  };
}

function recordsToSources(records: CommunicationRecord[]): Source[] {
  return records.map((record) => ({
    title: `${record.source === "notion" ? "Notion" : "Slack"}：${record.threadTitle}`,
    detail: record.text,
    owner: record.authorName,
    date: record.timestamp.slice(0, 10),
  }));
}

function getOpenClawConfig(): OpenClawConfig | null {
  const baseUrl = process.env.OPENCLAW_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;
  const agentId = process.env.OPENCLAW_AGENT_ID ?? "main";
  const configuredModel = process.env.OPENCLAW_MODEL ?? `openclaw/${agentId}`;

  return {
    baseUrl,
    token: process.env.OPENCLAW_AUTH_TOKEN ?? "",
    model: configuredModel.startsWith("openclaw") ? configuredModel : `openclaw/${agentId}`,
    agentId,
    timeoutMs: Number(process.env.OPENCLAW_TIMEOUT_MS ?? 30000),
  };
}

function evaluateGuardrail(question: string, baseConfidence: number) {
  const normalized = question.toLowerCase();
  const mentionsMoney = /預算|金額|報價|合約|50\s*萬/.test(question);
  const mentionsSecret = /密碼|password|token|api key|secret/.test(normalized);

  if (mentionsSecret) {
    return {
      status: "blocked" as const,
      confidence: 34,
      recommendation:
        "偵測到可能涉及密碼或金鑰，Agent 不輸出敏感資訊，請改查權限申請流程或詢問管理者。",
      warnings: ["敏感資訊"],
    };
  }

  if (mentionsMoney) {
    return {
      status: "review" as const,
      confidence: Math.min(baseConfidence, 58),
      recommendation:
        "問題可能涉及預算、合約或金額，目前缺少 RAG 原始證據，回答需保留並請管理者確認。",
      warnings: ["需要原始文件佐證"],
    };
  }

  return {
    status: "safe" as const,
    confidence: baseConfidence,
    recommendation: "回答已通過基本缺漏與敏感資訊檢查。",
    warnings: [],
  };
}

type PreflightGuardrailResult = ReturnType<typeof evaluateGuardrail>;

type ExtractedClaim = {
  text: string;
  source: "answer" | "content-block";
};

type ClaimEvaluation = GuardrailResult["claims"][number];

const passThreshold = 0.8;
const warnThreshold = 0.45;

const importantTerms = [
  "Project ORBIT",
  "UAT",
  "SSO",
  "BI-042",
  "KB-ORBIT",
  "CS-KB",
  "ORBIT 工單系統",
  "UAT 測試網站",
  "客服知識庫",
  "線上付款",
  "明碼密碼",
  "密碼",
  "token",
  "API key",
  "secret",
  "許雅婷",
  "陳柏維",
  "郭芷晴",
  "李沛蓉",
  "楊舒涵",
  "周以晨",
  "林書妍",
  "安域科技",
  "何俊叡",
  "晨曦物流",
  "禾木餐飲",
  "新版 SSO 測試報告",
  "發票下載",
  "批次發票下載",
  "壓力測試",
  "客服操作說明",
  "完備性檢查",
  "業務內容",
  "人際關係",
  "公司資產",
  "B1",
  "B2",
  "B3",
  "P1",
  "P2",
  "P3",
  "A1",
  "A2",
  "A3",
  "complete",
  "needs_work",
  "high_risk",
  "actionable",
  "conflict",
];

const lowSignalTerms = new Set([
  "Project",
  "ORBIT",
  "目前",
  "需要",
  "確認",
  "接手",
  "文件",
  "交接",
  "資料",
  "問題",
  "系統",
  "工作",
  "來源",
  "狀態",
  "完成",
  "待辦",
  "測試",
  "處理",
  "說明",
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[，。；：、！？!?()[\]【】「」『』"'`*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getImportantTokens(text: string) {
  const tokens = new Set<string>();
  const normalized = normalizeForMatch(text);

  for (const term of importantTerms) {
    if (normalized.includes(term.toLowerCase())) tokens.add(term.toLowerCase());
  }

  for (const match of normalized.matchAll(/\b[a-z]+-\d+\b|\b[a-z]{2,}\b|\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,2})?\b|\b\d+(?:\.\d+)?%?\b/g)) {
    const token = match[0];
    if (!lowSignalTerms.has(token)) tokens.add(token);
  }

  return tokens;
}

function getSearchTokens(text: string) {
  const tokens = getImportantTokens(text);
  const normalized = normalizeForMatch(text);
  const cjk = normalized.replace(/[^\u4e00-\u9fff]/g, "");

  for (let index = 0; index < cjk.length - 1; index += 1) {
    const token = cjk.slice(index, index + 2);
    if (!lowSignalTerms.has(token)) tokens.add(token);
  }

  for (let index = 0; index < cjk.length - 2; index += 2) {
    const token = cjk.slice(index, index + 3);
    if (!lowSignalTerms.has(token)) tokens.add(token);
  }

  return tokens;
}

function hasSensitiveLeak(text: string) {
  const normalized = text.toLowerCase();
  return (
    /\b(?:password|passwd|pwd|token|api[_ -]?key|secret)\s*[:=]\s*\S{6,}/i.test(text) ||
    /(密碼|金鑰|憑證)\s*(?:是|為|:|：)\s*[^\s，。；]{6,}/.test(text) ||
    /sk-[a-z0-9_-]{12,}/i.test(normalized)
  );
}

function hasKnownContradiction(claim: string, evidence: string) {
  const claimHasPayment =
    !/不包含|不含|不可|不可以|沒有|未/.test(claim) &&
    /包含|支援|可以|可使用/.test(claim) &&
    /線上付款/.test(claim);
  const evidenceRejectsPayment = /不包含線上付款|第一階段不包含線上付款/.test(evidence);
  if (claimHasPayment && evidenceRejectsPayment) return true;

  const claimAllowsSecrets =
    !/不可|不可以|不要|不得|不記錄|不可記錄|不可留下|不能|不輸出/.test(claim) &&
    /可以|可|直接|留下|交給/.test(claim) &&
    /密碼|明碼|token|api key|secret|憑證/i.test(claim);
  const evidenceRejectsSecrets = /不記錄明碼密碼|不得.*密碼|不可.*密碼/.test(evidence);
  if (claimAllowsSecrets && evidenceRejectsSecrets) return true;

  const claimSaysBiDone =
    /BI-042/i.test(claim) &&
    /已完成|已處理|已能使用|權限已|權限.*完成|可正常使用/.test(claim);
  const evidenceSaysBiPending = /BI-042/i.test(evidence) && /尚待處理|待處理|預計\s*8\/8|預計 8\/8/.test(evidence);
  if (claimSaysBiDone && evidenceSaysBiPending) return true;

  const claimSaysSeptLaunch = /上線/.test(claim) && /9\s*月\s*22|9\/22/.test(claim);
  const evidenceSaysOctLaunch = /上線日期/.test(evidence) && /10\s*月\s*6|10\/6|2026-10-06/.test(evidence);
  if (claimSaysSeptLaunch && evidenceSaysOctLaunch && /調整至|預計上線日/.test(evidence)) {
    return true;
  }

  const claimSaysNoConflict = /沒有|無/.test(claim) && /阻斷|衝突|風險/.test(claim);
  const evidenceSaysHighRisk = /high_risk|阻斷項|conflict|風險/.test(evidence);
  if (claimSaysNoConflict && evidenceSaysHighRisk && /存在|低於|需額外標記/.test(evidence)) {
    return true;
  }

  return false;
}

function supportScoreFor(claim: string, evidence: string) {
  const claimTokens = getSearchTokens(claim);
  const evidenceTokens = getSearchTokens(evidence);
  if (!claimTokens.size) return 0;

  let shared = 0;
  for (const token of claimTokens) {
    if (evidenceTokens.has(token)) shared += 1;
  }

  const importantClaimTokens = getImportantTokens(claim);
  const importantShared = [...importantClaimTokens].filter((token) => evidenceTokens.has(token)).length;
  const coverage = shared / Math.max(4, Math.ceil(claimTokens.size * 0.48));
  const importantCoverage = importantClaimTokens.size
    ? importantShared / importantClaimTokens.size
    : 0.7;
  const sourceBoost = importantShared >= 2 ? 0.12 : importantShared === 1 ? 0.05 : 0;

  return clamp(Math.min(coverage, 1) * 0.72 + importantCoverage * 0.23 + sourceBoost, 0, 0.98);
}

function classifyClaimAgainstSource(claim: string, source: Source) {
  const evidence = `${source.title} ${source.detail}`;
  const supportScore = supportScoreFor(claim, evidence);
  const contradictionScore = hasKnownContradiction(claim, evidence)
    ? clamp(0.78 + supportScore * 0.18, 0, 0.98)
    : 0;

  return {
    supportScore,
    contradictionScore,
    evidenceTitle: source.title,
    evidenceExcerpt: source.detail,
  };
}

function extractClaimsFromText(text: string, source: ExtractedClaim["source"]) {
  return text
    .replace(/\r/g, "\n")
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter((item) => item.length >= 8 && item.length <= 180)
    .filter((item) => {
      const hasConcreteMarker =
        /\d|UAT|SSO|BI-042|KB-ORBIT|CS-KB|Project ORBIT|ORBIT|B[1-3]|P[1-3]|A[1-3]|許雅婷|陳柏維|郭芷晴|李沛蓉|楊舒涵|周以晨|林書妍|安域科技|晨曦物流|禾木餐飲|密碼|token|API key|憑證|預算|合約|上線|完備|權限|來源|負責|待辦|風險|文件|系統|客服|發票|付款|測試/i.test(
          item,
        );
      const isOnlySuggestion = /^建議|^可以|^請|^先/.test(item) && !/\d|UAT|SSO|BI-042|KB-ORBIT|ORBIT|權限|待辦|負責|上線/i.test(item);
      const isConditionalWorkflow = /若|如果|假如/.test(item) && /請|確認|標示|詢問/.test(item);
      return hasConcreteMarker && !isOnlySuggestion && !isConditionalWorkflow;
    })
    .map((item) => ({
      text: item,
      source,
    }));
}

function contentBlocksToClaimText(blocks: AgentContentBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === "table") {
        return [
          block.title,
          block.columns.join(" "),
          ...block.rows.map((row) => row.join(" ")),
        ].join("\n");
      }
      if (block.type === "checklist") {
        return [
          block.title,
          ...block.items.map((item) => `${item.label} ${item.detail}`),
        ].join("\n");
      }
      return [
        block.title,
        ...block.items.map((item) => `${item.label} ${item.value}/${item.max} ${item.status}`),
      ].join("\n");
    })
    .join("\n");
}

function extractOutputClaims(answer: string, blocks: AgentContentBlock[]) {
  const claims = [
    ...extractClaimsFromText(answer, "answer"),
    ...extractClaimsFromText(contentBlocksToClaimText(blocks), "content-block"),
  ];
  const seen = new Set<string>();

  return claims.filter((claim) => {
    const normalized = normalizeForMatch(claim.text);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function evaluateClaim(claim: ExtractedClaim, sources: Source[]): ClaimEvaluation {
  if (!sources.length) {
    return {
      text: claim.text,
      verdict: "中立",
      supportScore: 0,
      contradictionScore: 0,
      reason: "目前沒有可比對的來源文件；先以無證據處理。",
    };
  }

  let bestSupport = classifyClaimAgainstSource(claim.text, sources[0]);
  let bestContradiction = bestSupport;

  for (const source of sources.slice(1)) {
    const result = classifyClaimAgainstSource(claim.text, source);
    if (result.supportScore > bestSupport.supportScore) bestSupport = result;
    if (result.contradictionScore > bestContradiction.contradictionScore) {
      bestContradiction = result;
    }
  }

  if (bestContradiction.contradictionScore >= 0.72) {
    return {
      text: claim.text,
      verdict: "矛盾",
      supportScore: Number(bestSupport.supportScore.toFixed(2)),
      contradictionScore: Number(bestContradiction.contradictionScore.toFixed(2)),
      evidenceTitle: bestContradiction.evidenceTitle,
      evidenceExcerpt: bestContradiction.evidenceExcerpt,
      reason: "偵測到與來源片段相反的敘述。",
    };
  }

  if (bestSupport.supportScore >= 0.5) {
    return {
      text: claim.text,
      verdict: "支持",
      supportScore: Number(bestSupport.supportScore.toFixed(2)),
      contradictionScore: Number(bestContradiction.contradictionScore.toFixed(2)),
      evidenceTitle: bestSupport.evidenceTitle,
      evidenceExcerpt: bestSupport.evidenceExcerpt,
      reason: "答案聲明可被來源片段支持。",
    };
  }

  return {
    text: claim.text,
    verdict: "中立",
    supportScore: Number(bestSupport.supportScore.toFixed(2)),
    contradictionScore: Number(bestContradiction.contradictionScore.toFixed(2)),
    evidenceTitle: bestSupport.evidenceTitle,
    evidenceExcerpt: bestSupport.evidenceExcerpt,
    reason: "找不到足夠強的來源支持。",
  };
}

function evaluateOutputGuardrail(params: {
  answer: string;
  contentBlocks: AgentContentBlock[];
  sources: Source[];
  baseConfidence: number;
  preflight: PreflightGuardrailResult;
  evidenceMode: RagEvidenceMode;
  allowProceduralGuidanceNeutral?: boolean;
}): GuardrailResult {
  if (params.preflight.status === "blocked") {
    return {
      status: "blocked",
      confidence: params.preflight.confidence,
      recommendation: params.preflight.recommendation,
      warnings: params.preflight.warnings,
      evidenceMode: params.evidenceMode,
      anchoringScore: 0,
      claims: [
        {
          text: "使用者問題可能要求輸出密碼、token、API key 或 secret。",
          verdict: "矛盾",
          contradictionScore: 1,
          reason: "preflight guardrail 已阻擋敏感資訊請求。",
        },
      ],
    };
  }

  const outputText = `${params.answer}\n${contentBlocksToClaimText(params.contentBlocks)}`;
  const claims = extractOutputClaims(params.answer, params.contentBlocks);
  const evaluatedClaims = claims.map((claim) => evaluateClaim(claim, params.sources));
  const contradictionCount = evaluatedClaims.filter((claim) => claim.verdict === "矛盾").length;
  const neutralCount = evaluatedClaims.filter((claim) => claim.verdict === "中立").length;
  const supportCount = evaluatedClaims.filter((claim) => claim.verdict === "支持").length;
  const unsupportedNeutralCount = params.allowProceduralGuidanceNeutral ? 0 : neutralCount;
  const anchoringScore = evaluatedClaims.length
    ? (supportCount + (params.allowProceduralGuidanceNeutral ? neutralCount : 0) - contradictionCount) /
      evaluatedClaims.length
    : 1;
  const hasLeak = hasSensitiveLeak(outputText);
  const hasContradiction = contradictionCount > 0;
  const warnings = [...params.preflight.warnings];

  if (hasLeak) warnings.push("疑似敏感資訊外洩");
  if (unsupportedNeutralCount > 0) warnings.push("部分聲明缺少來源支持");
  if (hasContradiction) warnings.push("偵測到來源矛盾");
  if (params.evidenceMode === "demo") {
    warnings.push("目前使用 demo sources，信心分數不是正式 RAG factual confidence");
  }
  if (params.evidenceMode === "none") {
    warnings.push("尚未取得 RAG retrieved chunks，無法計算正式 factual confidence");
  }

  if (params.evidenceMode === "none" && evaluatedClaims.length > 0 && !hasLeak) {
    return {
      status: "review",
      confidence: Math.min(params.preflight.confidence, 45),
      recommendation:
        "RAG 尚未提供 retrieved chunks；output guardrail 已完成安全檢查，但此回答需要等 RAG evidence 接上後才能做事實錨定。",
      warnings,
      evidenceMode: params.evidenceMode,
      anchoringScore,
      claims: evaluatedClaims,
    };
  }

  if (hasLeak || hasContradiction || anchoringScore < warnThreshold) {
    const firstConflict = evaluatedClaims.find((claim) => claim.verdict === "矛盾");
    return {
      status: "blocked",
      confidence: Math.max(20, Math.round(clamp(anchoringScore, 0, 1) * 100)),
      recommendation: firstConflict?.evidenceExcerpt
        ? `偵測到與歷史決策衝突，請回到來源「${firstConflict.evidenceTitle}」確認：${firstConflict.evidenceExcerpt}`
        : "偵測到高風險輸出，已攔截該次回答並請改查原始來源。",
      warnings,
      evidenceMode: params.evidenceMode,
      anchoringScore,
      claims: evaluatedClaims,
    };
  }

  if (params.preflight.status === "review" || anchoringScore < passThreshold || unsupportedNeutralCount > 0) {
    return {
      status: "review",
      confidence: Math.min(
        params.preflight.confidence,
        Math.round(clamp(anchoringScore, 0, 1) * 100),
      ),
      recommendation:
        unsupportedNeutralCount > 0
          ? "部分內容查無足夠來源支持，請向相關負責人或原始交接文件進一步確認。"
          : params.preflight.recommendation,
      warnings,
      evidenceMode: params.evidenceMode,
      anchoringScore,
      claims: evaluatedClaims,
    };
  }

  return {
    status: "safe",
    confidence: Math.min(params.baseConfidence, Math.round(anchoringScore * 100)),
    recommendation:
      params.evidenceMode === "rag"
        ? "回答已通過 output guardrail：可驗證聲明皆能對應 RAG retrieved chunks，且未偵測到矛盾或敏感資訊外洩。"
        : "回答已通過 output guardrail prototype：可驗證聲明皆能對應 demo sources，且未偵測到矛盾或敏感資訊外洩。",
    warnings,
    evidenceMode: params.evidenceMode,
    anchoringScore,
    claims: evaluatedClaims,
  };
}

function buildLocalAnswer(params: {
  question: string;
  mode: KnowledgeModeId;
  conversationType: ConversationType;
  toneProfile: ToneProfile;
  guardrail: ReturnType<typeof evaluateGuardrail>;
}): LocalResponse {
  const mode = knowledgeModes.find((item) => item.id === params.mode) ?? knowledgeModes[0];
  const selected = pickConversation(params.mode);

  if (params.guardrail.status === "blocked") {
    return {
      answer: `${params.guardrail.recommendation} 我可以改幫你整理應該向誰確認、需要哪份文件，以及後續要留下哪些交接紀錄。`,
      contentBlocks: [buildSafetyChecklistBlock()],
    };
  }

  const handoffAnswer = buildHandoffAnswer(params.question);
  if (handoffAnswer) {
    return {
      answer: handoffAnswer.answer,
      contentBlocks: handoffAnswer.contentBlocks,
    };
  }

  return {
    answer: `${selected.answer}\n\n下一步先按「${mode.label}」回到 Project ORBIT 的業務內容、人際關係、公司資產三類來源查核，並把每個結論標上來源位置。\n\n${selected.recommendation}`,
    contentBlocks: [buildNextActionsChecklistBlock()],
  };
}

function wantsDetailedAnswer(question: string) {
  return /詳細|詳情|說明|原因|來源|依據|展開|補充|完整文字|文字說明|為什麼|脈絡|逐項|解釋/i.test(
    question,
  );
}

function applyDisplayPolicy(response: LocalResponse, question: string): LocalResponse {
  if (!response.contentBlocks.length || wantsDetailedAnswer(question)) return response;
  return {
    ...response,
    answer: "",
  };
}

function asksForTaskExecutionGuidance(question: string) {
  const asksForStructuredList = /表格|table|checklist|清單/i.test(question);
  const asksForExistingTaskList =
    /待辦|哪些事情|有哪些事情|還有哪些|可以做/i.test(question) &&
    !/步驟|怎麼做|如何|怎麼開始|從哪裡開始|帶我/i.test(question);
  if (asksForStructuredList || asksForExistingTaskList) return false;

  return /怎麼做|如何做|如何開始|怎麼開始|步驟|流程|帶我|教我|從哪裡開始|第一步.*怎麼/i.test(
    question,
  );
}

function buildTaskExecutionGuidanceAnswer(question: string): LocalResponse {
  const target = /企劃|規劃|方案|proposal/i.test(question)
    ? "企劃"
    : /SSO|測試報告/i.test(question)
      ? "SSO 測試報告追蹤"
      : /UAT|阻塞/i.test(question)
        ? "UAT 阻塞處理"
        : /發票/i.test(question)
          ? "發票下載測試"
          : /權限|BI-042|資產|系統/i.test(question)
            ? "權限與資產確認"
            : "交接任務";

  if (target === "企劃") {
    return {
      answer: [
        "先不用急著把企劃寫完整，我會帶你把它拆成能開始做的順序。",
        "1. 先確認企劃目標：這份企劃要解決什麼問題、給誰看、最後希望對方做什麼決定。",
        "2. 整理現有背景：先回到 Project ORBIT 的業務內容交接，看目前進度、已知風險、已決策範圍，不要一開始就自己補想法。",
        "3. 找出關係人：確認決策者、執行者、會被影響的人。Project ORBIT 至少要看許雅婷、陳柏維、郭芷晴、客服與客戶窗口。",
        "4. 拆企劃架構：先寫背景、問題、目標、方案、時程、風險、需要決策的事項。",
        "5. 標出來源與缺口：每個重要結論都要能回到交接文件；文件沒寫清楚的地方先標「待確認」，不要猜。",
        "6. 產出第一版草稿：先做可討論版本，再請 Agent 幫你檢查缺漏、風險與下一步。",
        "你現在可以先回我第一題：這份企劃要給誰看，以及你希望對方做出什麼決定？",
      ].join("\n\n"),
      contentBlocks: [],
    };
  }

  if (target === "SSO 測試報告追蹤") {
    return {
      answer: [
        "這件事先照追報告的方式做，不要直接跳到上線判斷。",
        "1. 先確認目前缺的是新版 SSO 測試報告，不是一般進度更新。",
        "2. 找對窗口：外部找安域科技何俊叡，內部安全與測試帳號問題找郭芷晴。",
        "3. 補內部 owner：交接資料只說 8/21 前要取得報告，但實際追蹤 owner 需要在 UAT 阻塞清單裡補清楚。",
        "4. 拿到報告後請資安確認，不要由 Agent 或新人自行判定安全通過。",
        "5. 把結果更新回 KB-ORBIT/20_UAT 或相關追蹤文件，保留日期、窗口和下一步。",
        "你現在可以先確認：這份報告目前是還沒交付，還是已交付但沒有人審？",
      ].join("\n\n"),
      contentBlocks: [],
    };
  }

  if (target === "UAT 阻塞處理") {
    return {
      answer: [
        "UAT 阻塞先用 owner、期限、影響範圍三件事拆開處理。",
        "1. 先列出阻塞項：每一項都要有問題描述、影響功能、目前狀態。",
        "2. 補 owner：工程修正找陳柏維，SSO 或測試帳號問題找郭芷晴；不確定時標待確認。",
        "3. 補期限：高優先項目前要對齊 8/18 的 owner 確認節點。",
        "4. 判斷是否升級：核心功能無法使用、資料可能錯配或影響上線承諾時，立即升級許雅婷。",
        "5. 回寫交接紀錄：把 owner、修正日期、來源與下一步寫回 UAT 追蹤資料。",
        "你現在可以先貼一個 UAT 阻塞項，我幫你判斷要找誰、怎麼補 owner。",
      ].join("\n\n"),
      contentBlocks: [],
    };
  }

  if (target === "發票下載測試") {
    return {
      answer: [
        "發票下載測試的重點是先守住資料不可錯配，再看效能。",
        "1. 先確認測試範圍：目前要做的是批次發票下載壓力測試。",
        "2. 準備測試資料：測試時要逐筆確認公司別，避免跨公司資料出現。",
        "3. 跑功能驗證：先確認下載結果正確，再看大量批次情境。",
        "4. 記錄異常：若出現公司別錯配，這不是一般 bug，要立即標成資料風險。",
        "5. 回報窗口：工程修正找陳柏維，客戶或客服操作影響找李沛蓉同步。",
        "你現在可以先告訴我：你手上有測試資料了嗎，還是缺測試帳號或資料範圍？",
      ].join("\n\n"),
      contentBlocks: [],
    };
  }

  if (target === "權限與資產確認") {
    return {
      answer: [
        "權限和資產不要用借帳號的方式處理，先照申請與確認流程走。",
        "1. 先列必要資源：ORBIT 工單系統、KB-ORBIT 文件庫、UAT 測試網站、BI-042 儀表板、客服知識庫。",
        "2. 逐項確認狀態：已完成的標可用；BI-042 目前是待處理，不能說已完成。",
        "3. 用自己的公司帳號申請：交接文件不可記錄明碼密碼、token、API key 或憑證。",
        "4. 補缺口：若缺少權限持有人、申請方式或完成標準，要標成待確認。",
        "5. 完成後回寫交接紀錄：留下申請日期、核准人、可用狀態與下一步。",
        "你現在可以先告訴我：你卡在哪一個系統，我幫你判斷要補申請方式還是找 owner。",
      ].join("\n\n"),
      contentBlocks: [],
    };
  }

  return {
    answer: [
      "可以，我會先把這件事拆成新人能照著做的順序。",
      "1. 先確認任務目標：這件事要完成什麼結果，以及完成標準是什麼。",
      "2. 回到來源文件：先查業務內容、人際關係、公司資產三類交接資料，找出已知資訊和缺口。",
      "3. 找對人：一般進度找周以晨，工程修正找陳柏維，SSO 或測試帳號找郭芷晴，重大決策升級許雅婷。",
      "4. 拆下一步：把任務拆成 owner、期限、依賴、風險、需要回寫的位置。",
      "5. 不確定就標待確認：缺來源、缺 owner、缺權限或涉及客戶承諾時，不要自行補結論。",
      "6. 做完留下紀錄：把處理結果、來源和下一步寫回交接或追蹤文件。",
      "你現在可以先告訴我：你要做的是哪一件任務，我再幫你拆第一步。",
    ].join("\n\n"),
    contentBlocks: [],
  };
}

function isHandoffQuestion(question: string) {
  return /orbit|交接|完備|完整|缺漏|分數|業務|工作|任務|企劃|規劃|方案|待辦|接手|第一步|進度|uat|sso|發票|例行|風險|人際|關係|窗口|聯絡|升級|外部|承諾|供應商|客戶|許雅婷|陳柏維|郭芷晴|李沛蓉|楊舒涵|周以晨|資產|系統|權限|文件|設備|儀表板|bi-042|kb-orbit|密碼|憑證|今天|下一步|哪些事情|可以做|checklist|清單|怎麼做|如何做|步驟|流程/i.test(
    question,
  );
}

function formatItemList(category: "business" | "people" | "asset") {
  return completenessItems
    .filter((item) => item.category === category)
    .map((item) => `${item.id} ${item.label} ${item.score}/2：${item.note}`)
    .join("；");
}

function buildCompletenessScoreBlock(): AgentContentBlock {
  return {
    type: "score-bars",
    title: "交接完備度",
    items: [
      {
        label: "業務內容",
        value: completenessSummary.businessScore,
        max: 100,
        status: "safe",
      },
      {
        label: "人際關係",
        value: completenessSummary.peopleScore,
        max: 100,
        status: "safe",
      },
      {
        label: "公司資產",
        value: completenessSummary.assetScore,
        max: 100,
        status: "safe",
      },
      {
        label: "整體",
        value: completenessSummary.overallScore,
        max: 100,
        status: "safe",
      },
    ],
  };
}

function buildCompletenessTableBlock(): AgentContentBlock {
  return {
    type: "table",
    title: "九項完備度檢查",
    columns: ["項目", "類別", "優先", "分數", "狀態", "依據"],
    rows: completenessItems.map((item) => [
      `${item.id} ${item.label}`,
      item.category === "business"
        ? "業務內容"
        : item.category === "people"
          ? "人際關係"
          : "公司資產",
      item.priority,
      `${item.score}/2`,
      item.status,
      item.evidenceTitles.join("、"),
    ]),
  };
}

function buildNextActionsChecklistBlock(): AgentContentBlock {
  return {
    type: "checklist",
    title: "接下來可做的事",
    items: [
      {
        label: "確認 UAT 阻塞 owner",
        detail: "逐項更新 owner 與修正日期，優先處理高優先待辦。",
        status: "doing",
      },
      {
        label: "追新版 SSO 測試報告",
        detail: "8/21 前等待供應商交付，並請郭芷晴或資安確認。",
        status: "todo",
      },
      {
        label: "複查發票下載測試",
        detail: "批次發票下載壓力測試完成後，確認公司別不可錯配。",
        status: "watch",
      },
      {
        label: "確認 BI-042 權限",
        detail: "8/8 前確認接手者可以正常查看 ORBIT 報表。",
        status: "todo",
      },
    ],
  };
}

function buildBusinessTodoTableBlock(): AgentContentBlock {
  return {
    type: "table",
    title: "業務內容待辦",
    columns: ["優先", "待辦", "期限", "相關人 / 依賴", "注意事項"],
    rows: [
      [
        "高",
        "確認 UAT 阻塞問題負責人",
        "8/18",
        "陳柏維處理工程修正；郭芷晴處理 SSO / 安全",
        "逐項補齊 owner 與修正日期，不可由 Agent 自行指定。",
      ],
      [
        "高",
        "取得新版 SSO 測試報告",
        "8/21",
        "安域科技何俊叡；週四 16:00 供應商技術會議",
        "需補內部追蹤 owner，交付後請資安確認。",
      ],
      [
        "中",
        "完成批次發票下載壓力測試",
        "8/16",
        "工程修正後重新測試；晨曦物流重視此功能",
        "逐筆確認公司別，避免跨公司資料。",
      ],
      [
        "中",
        "更新客服操作說明",
        "9/18",
        "李沛蓉；CS-KB/ORBIT",
        "待最終畫面確認後補上截圖。",
      ],
    ],
  };
}

function buildPeopleTableBlock(): AgentContentBlock {
  return {
    type: "table",
    title: "遇到情況找誰",
    columns: ["情況", "第一聯絡人", "升級方式"],
    rows: [
      ["一般進度或待辦問題", "周以晨", "帶到週二專案會議處理"],
      ["核心功能異常或修正延誤", "陳柏維", "必要時通知許雅婷"],
      ["SSO、測試帳號或安全問題", "郭芷晴", "資料風險立即升級許雅婷"],
      ["上線日期、範圍或客戶承諾改變", "周以晨", "由許雅婷決策"],
    ],
  };
}

function buildAssetTableBlock(): AgentContentBlock {
  return {
    type: "table",
    title: "資產與權限確認表",
    columns: ["資源", "用途", "取得方式 / 狀態"],
    rows: [
      ["ORBIT 工單系統", "任務及問題追蹤", "Project Operator；已完成"],
      ["KB-ORBIT 文件庫", "專案及交接文件", "加入 ORBIT-Core 群組；已完成"],
      ["UAT 測試網站", "測試功能與客戶流程", "申請個人 Tenant Tester 帳號；已完成"],
      ["BI-042 儀表板", "查看使用率及問題數據", "資料團隊核准；8/8 待處理"],
      ["客服知識庫", "查看及更新客服說明", "客服主管核准；已完成"],
    ],
  };
}

function buildSafetyChecklistBlock(): AgentContentBlock {
  return {
    type: "checklist",
    title: "敏感資訊處理",
    items: [
      {
        label: "不要輸出密碼或憑證",
        detail: "交接文件不可記錄明碼密碼、token、API key 或 secret。",
        status: "watch",
      },
      {
        label: "改查申請流程",
        detail: "接手者應以自己的公司帳號申請權限。",
        status: "todo",
      },
      {
        label: "留下來源與缺口",
        detail: "若缺少權限持有人或申請方式，標示缺漏並請管理者確認。",
        status: "todo",
      },
    ],
  };
}

function buildCompletenessAnswer(): LocalResponse {
  const blockerText = completenessSummary.blockers.length
    ? completenessSummary.blockers.join("、")
    : "目前沒有阻斷項";

  return {
    answer: [
      `${handoffDocumentPackage.projectName} 目前依小組規範判定為 ${completenessSummary.status}，整體完備度 ${completenessSummary.overallScore} 分。`,
      `業務內容 ${completenessSummary.businessScore} 分、人際關係 ${completenessSummary.peopleScore} 分、公司資產 ${completenessSummary.assetScore} 分，${blockerText}。`,
      "判定依據是 B1-B3、P1-P3、A1-A3 九項；BI-042 儀表板仍待處理，但已有日期、狀態與完成標準，所以不構成阻斷。",
    ].join("\n\n"),
    contentBlocks: [buildCompletenessScoreBlock(), buildCompletenessTableBlock()],
  };
}

function buildBusinessAnswer(): LocalResponse {
  return {
    answer: [
      "Project ORBIT 先處理兩個高優先待辦：8/18 確認 UAT 阻塞問題的實際負責人，以及 8/21 取得新版 SSO 測試報告。",
      "同時排入 8/16 批次發票下載壓力測試；不要先跳到上線排程。",
      "UAT 目前約完成 78%，下一階段是 SSO 安全修正與發票下載測試，預計上線日為 2026-10-06。第一階段不含線上付款。",
      `完備度對應：${formatItemList("business")}。`,
    ].join("\n\n"),
    contentBlocks: [buildBusinessTodoTableBlock(), buildNextActionsChecklistBlock()],
  };
}

function buildPeopleAnswer(): LocalResponse {
  return {
    answer: [
      "遇到事情先按情境找人，不要只靠聊天紀錄轉述。",
      "一般進度或待辦由周以晨帶到週二專案會議；核心功能異常找陳柏維，SSO、測試帳號或資料外洩疑慮找郭芷晴。",
      `外部供應商安域科技何俊叡還欠新版 SSO 測試報告，週四技術會議要追。完備度對應：${formatItemList("people")}。`,
    ].join("\n\n"),
    contentBlocks: [buildPeopleTableBlock()],
  };
}

function buildAssetAnswer(): LocalResponse {
  return {
    answer: [
      "接手者需要先確認 ORBIT 工單系統、KB-ORBIT 文件庫、UAT 測試網站、BI-042 儀表板與客服知識庫。",
      "文件位置包含 KB-ORBIT/00_Project-Overview、10_Requirements、20_UAT、30_Decisions 與 CS-KB/ORBIT。",
      `BI-042 權限預計 8/8 完成，測試帳號清點 8/9。交接文件不可記錄明碼密碼或憑證。完備度對應：${formatItemList("asset")}。`,
    ].join("\n\n"),
    contentBlocks: [buildAssetTableBlock(), buildSafetyChecklistBlock()],
  };
}

function asksForDocumentLocation(question: string) {
  const asksWhere = /在哪|在哪裡|位置|路徑|放哪|放在哪|哪裡找|哪裡看|folder|path/i.test(
    question,
  );
  const mentionsDocument =
    /文件|檔案|交接|docx|pdf|01_|02_|03_|業務內容交接|人際關係交接|公司資產交接|KB-ORBIT|CS-KB/i.test(
      question,
    );

  return asksWhere && mentionsDocument;
}

function buildDocumentLocationAnswer(question: string): LocalResponse {
  const asksBusinessDoc = /01_|業務內容交接/i.test(question);
  const answer = asksBusinessDoc
    ? [
        "那份在 KB-ORBIT/00_Project-Overview，檔名是 01_業務內容交接_Project_ORBIT.docx。",
        "如果你打不開，先確認自己有加入 ORBIT-Core 群組；交接資料裡寫 KB-ORBIT 文件庫權限目前是已完成。",
      ]
    : [
        "Project ORBIT 的交接文件主要在 KB-ORBIT 文件庫。專案總覽在 KB-ORBIT/00_Project-Overview，需求與流程在 KB-ORBIT/10_Requirements，UAT 資料在 KB-ORBIT/20_UAT，決策紀錄在 KB-ORBIT/30_Decisions。",
        "客服資料另外放在 CS-KB/ORBIT。若你找不到，先看自己有沒有 ORBIT-Core 群組權限，不要用別人的帳號借看。",
      ];

  return {
    answer: answer.join("\n\n"),
    contentBlocks: [],
  };
}

function buildHandoffAnswer(question: string): LocalResponse | null {
  if (!isHandoffQuestion(question)) return null;
  if (/密碼|password|token|api key|secret|憑證/i.test(question)) return null;

  if (asksForTaskExecutionGuidance(question)) {
    return buildTaskExecutionGuidanceAnswer(question);
  }

  if (/完備|完整|缺漏|分數|檢查|B1|B2|B3|P1|P2|P3|A1|A2|A3/i.test(question)) {
    return buildCompletenessAnswer();
  }

  if (asksForDocumentLocation(question)) {
    return buildDocumentLocationAnswer(question);
  }

  if (/人際|關係|誰|窗口|聯絡|升級|外部|承諾|供應商|客戶|許雅婷|陳柏維|郭芷晴|李沛蓉|楊舒涵/i.test(question)) {
    return buildPeopleAnswer();
  }

  if (/資產|系統|權限|文件|設備|儀表板|BI-042|KB-ORBIT|客服知識庫|測試帳號/i.test(question)) {
    return buildAssetAnswer();
  }

  if (/業務|工作|任務|待辦|接手|第一步|進度|UAT|SSO|發票|例行|風險|今天|下一步|ORBIT|哪些事情|可以做|checklist|清單/i.test(question)) {
    return buildBusinessAnswer();
  }

  return {
    answer:
      "這份交接資料應依三類格式回答：業務內容說明接下來要做什麼，人際關係說明遇到事情找誰，公司資產說明需要的系統、文件與設備在哪裡以及能不能用。若要做完備性檢查，請用 B1-B3、P1-P3、A1-A3 九項列出分數、缺漏、阻斷項與來源。",
    contentBlocks: [buildCompletenessTableBlock()],
  };
}

function buildOpenClawPrompt(params: {
  question: string;
  mode: KnowledgeModeId;
  toneProfile: ToneProfile;
  guardrail: ReturnType<typeof evaluateGuardrail>;
  sources: Source[];
}) {
  const mode = knowledgeModes.find((item) => item.id === params.mode) ?? knowledgeModes[0];
  const sourceText = params.sources
    .map(
      (source, index) =>
        `${index + 1}. ${source.title}｜${source.owner}｜${source.date}\n${source.detail}`,
    )
    .join("\n\n");

  return [
    "你是「接續」FM06 的 Project ORBIT 交接輔助 Agent，請使用繁體中文回答。",
    "你要同時做到三件事：用前輩視角回覆、回答工作相關問題、給出任務執行引導。",
    "資料格式必須依小組規範分為業務內容、人際關係、公司資產三類；完備性檢查必須使用 B1-B3、P1-P3、A1-A3 九項。",
    params.toneProfile.styleInstruction,
    "回答規則：",
    "- 模仿前同事自然交代工作的口吻，不要使用「結論：」或「先講結論」這類標籤式文字。",
    "- 只根據提供的交接脈絡回答；資訊不足時要明確說不足，不可自行補。",
    "- 每個結論都要能對應來源；不同來源衝突時並列，不自行選邊。",
    "- 如果使用者詢問怎麼做、步驟或流程，要像帶新人做事一樣用 1. 2. 3. 拆解，最後追問第一步需要的資訊。",
    "- 最後給新人下一步，可以用短句或 2-3 個步驟。",
    "- 使用者要求詳細內容時，文字回答要有段落換行，避免把所有內容塞成一段。",
    "- 不要輸出 Markdown 表格；若適合用表格、Checklist 或視覺摘要，系統會另以 UI 結構化呈現。",
    "- 不要輸出密碼、token、API key 或未驗證的預算/合約結論。",
    "",
    `目前左側選擇：${mode.label} - ${mode.description}`,
    `Guardrail 狀態：${params.guardrail.status}；${params.guardrail.recommendation}`,
    "",
    "可用交接脈絡：",
    sourceText || "目前沒有可用來源。",
    "",
    `新人問題：${params.question}`,
  ].join("\n");
}

function extractOpenClawText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = body as {
    output_text?: unknown;
    output?: unknown;
    choices?: unknown;
  };

  if (typeof value.output_text === "string" && value.output_text.trim()) {
    return value.output_text.trim();
  }

  if (Array.isArray(value.output)) {
    const parts = value.output.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const outputItem = item as { content?: unknown };
      if (!Array.isArray(outputItem.content)) return [];
      return outputItem.content.flatMap((content) => {
        if (!content || typeof content !== "object") return [];
        const contentItem = content as { text?: unknown };
        return typeof contentItem.text === "string" ? [contentItem.text] : [];
      });
    });
    const text = parts.join("").trim();
    if (text) return text;
  }

  if (Array.isArray(value.choices)) {
    const first = value.choices[0] as
      | { message?: { content?: unknown }; text?: unknown }
      | undefined;
    if (typeof first?.message?.content === "string") {
      return first.message.content.trim();
    }
    if (typeof first?.text === "string") return first.text.trim();
  }

  return null;
}

function stripMarkdownTablesWhenStructured(answer: string, blocks: AgentContentBlock[]) {
  if (!blocks.some((block) => block.type === "table")) return answer;

  const lines = answer.split(/\r?\n/);
  const cleaned: string[] = [];
  let skippingTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isTableLine = trimmed.startsWith("|") && trimmed.endsWith("|");
    const isDividerLine = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);

    if (isTableLine || isDividerLine) {
      skippingTable = true;
      continue;
    }

    if (skippingTable && !trimmed) {
      skippingTable = false;
      continue;
    }

    skippingTable = false;
    cleaned.push(line);
  }

  return cleaned
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeColleagueVoice(answer: string) {
  return answer
    .replace(/先講結論[，：:]\s*/g, "")
    .replace(/結論[：:]\s*/g, "")
    .trim();
}

async function callOpenClaw(prompt: string) {
  const config = getOpenClawConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-openclaw-agent-id": config.agentId,
    };
    if (config.token) headers.authorization = `Bearer ${config.token}`;

    const response = await fetch(`${config.baseUrl}/v1/responses`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        input: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.warn("OpenClaw request failed", response.status, await response.text());
      return null;
    }

    return extractOpenClawText(await response.json());
  } catch (error) {
    console.warn("OpenClaw request error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createAgentReply(body: AgentRequest): Promise<AgentReply> {
  const question = asString(body.question, "我今天應該先確認哪一段？");
  const mode = normalizeMode(body.mode);
  const conversationType = normalizeConversationType();
  const projectId = asString(body.projectId, "fm06");
  const seniorId = asString(body.seniorId, "senior-lin");
  const selected = pickConversation(mode);
  const workspaceContext = await fetchWorkspaceContext({ projectId, seniorId });
  const records = workspaceContext.records;
  const toneProfile = buildToneProfile(records);
  const fallbackEvidenceSources = [
    ...selected.sources,
    ...handoffSources,
    ...workspaceContext.handoffSources,
  ];
  const ragEvidence = await retrieveGuardrailEvidence({
    question,
    projectId,
    seniorId,
    fallbackSources: fallbackEvidenceSources,
  });
  const ragSources = ragEvidence.chunks;
  const connectors = buildConnectorStatuses(
    workspaceContext.statuses,
    ragSources,
    ragEvidence.mode,
  );
  const rag = buildRagContext({
    ragSources,
    evidenceMode: ragEvidence.mode,
    note: ragEvidence.note,
    status: ragEvidence.status,
  });
  const baseConfidence = toneProfile.status === "fallback" ? 72 : selected.confidence;
  const guardrailCheck = evaluateGuardrail(question, baseConfidence);
  const sources = [...ragSources, ...recordsToSources(records)];
  const localResponse = buildLocalAnswer({
    question,
    mode,
    conversationType,
    toneProfile,
    guardrail: guardrailCheck,
  });
  const displayResponse =
    guardrailCheck.status === "blocked"
      ? localResponse
      : applyDisplayPolicy(localResponse, question);
  const openClawAnswer = await callOpenClaw(
    buildOpenClawPrompt({
      question,
      mode,
      toneProfile,
      guardrail: guardrailCheck,
      sources,
    }),
  );
  const provisionalAnswer =
    openClawAnswer && wantsDetailedAnswer(question)
      ? sanitizeColleagueVoice(
          stripMarkdownTablesWhenStructured(openClawAnswer, displayResponse.contentBlocks),
        )
      : sanitizeColleagueVoice(displayResponse.answer);
  const provider: AgentProvider = openClawAnswer ? "openclaw" : "local-codex-mock";
  const guardrail = evaluateOutputGuardrail({
    answer: provisionalAnswer,
    contentBlocks: displayResponse.contentBlocks,
    sources: ragSources,
    baseConfidence,
    preflight: guardrailCheck,
    evidenceMode: ragEvidence.mode,
    allowProceduralGuidanceNeutral: asksForTaskExecutionGuidance(question),
  });
  const shouldInterceptOutput =
    guardrail.status === "blocked" && guardrailCheck.status !== "blocked";
  const answer = shouldInterceptOutput
    ? `${guardrail.recommendation} 我先不把原回答交給新人，避免把未確認或衝突的資訊當成正式交接結論。`
    : provisionalAnswer;
  const contentBlocks = shouldInterceptOutput ? [] : displayResponse.contentBlocks;

  return {
    jobId: `job-agent-${Date.now()}`,
    answer,
    contentBlocks,
    status: guardrail.status,
    confidence: guardrail.confidence,
    sources,
    guardrail,
    toneProfile,
    connectors,
    rag,
    meta: {
      mode,
      conversationType,
      provider,
      projectId,
      seniorId,
    },
  };
}
