// LLM pass of the handoff completeness check, ported from the InsightShift handoff demo
// backend (backend/llm-client.mjs). Reads AGENT_LLM_* only: the OPENCLAW_* names are already
// used by the assist chat gateway (backend/services/agent.ts).
import type { ReviewInput, ReviewIssue, RuleReview } from "./review-engine";

type LlmReview = {
  summary?: string;
  status?: string;
  canSubmit?: boolean;
  issues?: Array<Partial<ReviewIssue>>;
};

export type MergedReview = RuleReview & {
  agentProvider: "llm" | "rules";
  llmSkippedReason?: string;
};

const CHECKLIST_RUBRIC: Record<string, string> = {
  "B1 工作內容": "主要職責、工作範圍、預期產出、目前狀態、目標。",
  "B2 接手行動": "下一步、待辦、第一個可執行動作、期限、優先順序、負責人。",
  "B3 例行與風險": "固定例行工作、風險、觸發條件、注意事項、應對方式。",
  "P1 關鍵人物": "主要內外部窗口、角色、負責事項、決策關係。",
  "P2 聯絡時機": "什麼情境找誰、聯絡順序、聯絡方式、升級條件。",
  "P3 上級與外部承諾": "主管或外部對象、尚未完成承諾、狀態、到期日。",
  "A1 必要資源": "必要系統、文件、工具、設備、資料夾。",
  "A2 取得方式": "資源位置、連結、權限申請方式、窗口、存取流程。",
  "A3 待移交事項": "待移交帳號、權限、資產、文件、狀態、後續動作。"
};

function getLlmConfig() {
  return {
    apiKey: process.env.AGENT_LLM_API_KEY || "",
    baseUrl: process.env.AGENT_LLM_BASE_URL || "",
    model: process.env.AGENT_LLM_MODEL || "",
    path: process.env.AGENT_LLM_CHAT_COMPLETIONS_PATH || "/chat/completions"
  };
}

function trimText(value: unknown, maxLength = 6000): string {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function categoryFromTitle(title: unknown): string {
  const normalizedTitle = String(title || "").trim();
  if (normalizedTitle.startsWith("B")) return "Business";
  if (normalizedTitle.startsWith("P")) return "People";
  if (normalizedTitle.startsWith("A")) return "Assets";
  return "Other";
}

function buildEndpoint(baseUrl: string, apiPath: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${apiPath.replace(/^\//, "")}`;
}

function buildMessages(input: ReviewInput, ruleReview: RuleReview) {
  const checklist = Array.isArray(input?.checklist) ? input.checklist : [];
  const files = Array.isArray(input?.files) ? input.files : [];
  const enrichedChecklist = checklist.map((item) => ({
    ...item,
    category: categoryFromTitle(item.title),
    expectedEvidence: CHECKLIST_RUBRIC[item.title] || ""
  }));
  const compactFiles = files.map((file) => ({
    fileName: file.fileName || file.name || "",
    mappedItemTitle: file.mappedItemTitle || "",
    mappedCategory: categoryFromTitle(file.mappedItemTitle),
    type: file.type || "",
    size: file.size || 0,
    extractionStatus: file.extractionStatus || (file.extractedText || file.text || file.textPreview ? "ok" : "missing"),
    contentAvailable: Boolean(file.extractedText || file.text || file.textPreview),
    textPreview: trimText(file.extractedText || file.text || file.textPreview || "")
  }));

  return [
    {
      role: "system",
      content: [
        "你是企業交接文件完備性檢查 Agent。",
        "你必須依據 B/P/A 交接規範檢查資料是否足以讓新人接手。",
        "",
        "B/P/A 規範：",
        "B = Business 業務交接：B1 工作內容、B2 接手行動、B3 例行與風險。",
        "P = People 人際關係交接：P1 關鍵人物、P2 聯絡時機、P3 上級與外部承諾。",
        "A = Assets 公司資產交接：A1 必要資源、A2 取得方式、A3 待移交事項。",
        "",
        "各項目合格標準：",
        "B1 工作內容：能說明主要職責、範圍、產出、目前狀態或目標。",
        "B2 接手行動：能說明下一步、待辦、負責人、期限、優先順序或第一個可執行動作。",
        "B3 例行與風險：能說明固定例行事項、風險、觸發條件、注意事項或應對方式。",
        "P1 關鍵人物：能列出主要內外部窗口、角色、負責事項或決策關係。",
        "P2 聯絡時機：能說明什麼情境找誰、聯絡順序、聯絡方式或升級條件。",
        "P3 上級與外部承諾：能說明主管/外部對象、尚未完成的承諾、狀態或到期日。",
        "A1 必要資源：能列出新人工作所需系統、文件、工具、設備或資料夾。",
        "A2 取得方式：能說明資源位置、連結、權限申請方式、窗口或存取流程。",
        "A3 待移交事項：能說明待移交帳號、權限、資產、文件、狀態或後續動作。",
        "",
        "判斷原則：",
        "1. 一份 B 類文件可以同時支援 B1/B2/B3；一份 P 類文件可以同時支援 P1/P2/P3；一份 A 類文件可以同時支援 A1/A2/A3。",
        "2. 如果檔案有 textPreview，必須根據 textPreview 內容判斷，不要只看檔名。",
        "3. 如果 extractionStatus 不是 ok 或 contentAvailable 是 false，代表你沒有正文；此時不可宣稱文件內容合格。",
        "4. P0 項目若只有不可讀檔案，例如圖片、JPG、PNG 或尚未解析的二進位檔案，必須 blocking=true，並要求上傳可讀文件或進行 OCR/文件解析。",
        "5. 如果 textPreview 是亂打、測試字串、無意義短句，或完全沒有交接資訊，P0 項目必須 blocking=true，不能因為檔案已被分類就通過。",
        "6. 不要編造文件中沒有的資訊；不確定時請標記需要補充。",
        "7. 只有 P0 缺漏、P0 無法讀取正文、P0 正文無實質交接資訊、實際出現可登入或可存取的明碼密碼/token/secret/API key、完全無法接手的情況才 blocking=true。",
        "8. 若文件只是寫「不保存任何明碼密碼、token、API key」或「請使用正式權限流程」，這是安全聲明，不是敏感資訊洩漏，不可因此列 issue。",
        "9. 如果你認為有敏感資訊，message 必須指出具體可疑片段或欄位名稱；不能只籠統說疑似包含密碼/token。",
        "10. 如果內容已足以讓新人做出下一步，即使格式不完美，也不要列為 blocking。",
        "11. issues 只列真正需要修改的項目；已合格項目不要放進 issues。",
        "12. 只回傳 JSON，不要加 markdown。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "檢查上傳文件是否符合交接清單欄位，並指出阻擋送審的問題。",
        outputSchema: {
          summary: "一句繁體中文摘要",
          status: "complete | needs_work | high_risk",
          canSubmit: "boolean",
          issues: [
            {
              itemTitle: "清單項目標題，必須對應既有清單",
              level: "info | warning | danger",
              blocking: "boolean",
              message: "給離職同事看的具體修改建議",
              sourceFiles: ["相關檔名"]
            }
          ]
        },
        rules: {
          p0MissingBlocksSubmit: true,
          plaintextCredentialsBlockSubmit: true,
          securityPolicyStatementIsNotCredentialLeak: true,
          credentialIssueMustIncludeEvidence: true,
          conflictMustBeMarked: true,
          doNotInventEvidence: true
        },
        projectTitle: input?.projectTitle || "",
        mode: input?.mode || "fast",
        checklist: enrichedChecklist,
        files: compactFiles,
        ruleReview
      })
    }
  ];
}

function extractJsonObject(text: unknown): LlmReview | null {
  const trimmed = String(text ?? "").trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeLlmIssue(issue: Partial<ReviewIssue>): ReviewIssue {
  return {
    itemTitle: String(issue?.itemTitle || "").trim(),
    state: issue?.state || "llm_issue",
    level: issue?.level && ["info", "warning", "danger"].includes(issue.level) ? issue.level : "warning",
    blocking: Boolean(issue?.blocking),
    message: String(issue?.message || "").trim(),
    sourceFiles: Array.isArray(issue?.sourceFiles) ? issue.sourceFiles.map(String) : []
  };
}

function mergeReviews(ruleReview: RuleReview, llmReview: LlmReview): MergedReview {
  const llmIssues = Array.isArray(llmReview?.issues)
    ? llmReview.issues.map(normalizeLlmIssue).filter((issue) => issue.itemTitle && issue.message)
    : [];
  const preservedRuleIssues = ruleReview.issues.filter((issue) => {
    return issue.state === "missing" || issue.state === "high_risk" || issue.state === "unreadable" || issue.state === "invalid_content";
  });
  const mergedIssues = [...preservedRuleIssues, ...llmIssues];
  const hasBlockingIssue = mergedIssues.some((issue) => issue.blocking);
  const canSubmit = ruleReview.canSubmit && llmReview?.canSubmit !== false && !hasBlockingIssue;

  let status: RuleReview["status"] = ruleReview.status;
  if (hasBlockingIssue || llmReview?.status === "high_risk") {
    status = "high_risk";
  } else if (llmReview?.status === "needs_work" && status === "complete") {
    status = "needs_work";
  }

  return {
    ...ruleReview,
    status,
    canSubmit,
    summary: llmReview?.summary || ruleReview.summary,
    issues: mergedIssues,
    agentProvider: "llm" as const
  };
}

export function hasLlmConfig() {
  const config = getLlmConfig();
  return Boolean(config.apiKey && config.baseUrl && config.model);
}

export function getPublicLlmConfig() {
  const config = getLlmConfig();
  return {
    enabled: Boolean(config.apiKey && config.baseUrl && config.model),
    baseUrl: config.baseUrl,
    model: config.model,
    path: config.path
  };
}

export async function reviewWithLlm(input: ReviewInput, ruleReview: RuleReview): Promise<MergedReview> {
  const config = getLlmConfig();

  if (!config.apiKey || !config.baseUrl || !config.model) {
    return {
      ...ruleReview,
      agentProvider: "rules",
      llmSkippedReason: "AGENT_LLM_API_KEY、AGENT_LLM_BASE_URL 或 AGENT_LLM_MODEL 尚未設定。"
    };
  }

  const response = await fetch(buildEndpoint(config.baseUrl, config.path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: buildMessages(input, ruleReview),
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API failed (${response.status}): ${trimText(errorText, 500)}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload?.choices?.[0]?.message?.content;
  const llmReview = extractJsonObject(content);

  if (!llmReview) {
    throw new Error("LLM 回傳內容不是可解析的 JSON。");
  }

  return mergeReviews(ruleReview, llmReview);
}
