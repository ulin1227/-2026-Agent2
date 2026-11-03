// Handoff document completeness check (交接文件完備性檢查), ported from the
// InsightShift handoff demo backend (backend/review-engine.mjs).

export type ReviewMode = "fast" | "full";
type ChecklistRule = { title: string; priority: "P0" | "P1"; signals: string[] };
type ItemState = "missing" | "high_risk" | "unreadable" | "invalid_content" | "partial" | "verified" | "actionable";

export type ReviewInputFile = {
  id?: string;
  fileName?: string;
  name?: string;
  mappedItemTitle?: string;
  size?: number;
  type?: string;
  extractedText?: string;
  text?: string;
  textPreview?: string;
  extractionStatus?: string;
};

export type ReviewInput = {
  projectTitle?: string;
  mode?: string;
  checklist?: Array<{ title: string; text?: string }>;
  files?: ReviewInputFile[];
};

export type ReviewIssue = {
  itemTitle: string;
  state: string;
  level: "info" | "warning" | "danger";
  blocking: boolean;
  message: string;
  sourceFiles: string[];
};

export type ItemResult = {
  itemTitle: string;
  priority: "P0" | "P1";
  state: ItemState;
  score: number;
  percentScore: number;
  blocking: boolean;
  message: string;
  sourceFiles: string[];
};

export type RuleReview = {
  ok: true;
  mode: ReviewMode;
  status: "complete" | "needs_work" | "high_risk";
  completeness: number;
  canSubmit: boolean;
  summary: string;
  itemResults: ItemResult[];
  issues: ReviewIssue[];
};

type NormalizedFile = Required<Pick<ReviewInputFile, "id" | "fileName" | "mappedItemTitle" | "size" | "type" | "extractedText" | "extractionStatus">>;

const MODE_ITEMS: Record<ReviewMode, ChecklistRule[]> = {
  fast: [
    { title: "B1 工作內容", priority: "P0", signals: ["負責", "工作", "產出", "任務", "目標", "內容"] },
    { title: "B2 接手行動", priority: "P0", signals: ["目前", "進度", "下一步", "期限", "待辦", "接手"] },
    { title: "P1 關鍵人物", priority: "P0", signals: ["窗口", "負責", "聯絡", "團隊", "部門", "人員"] },
    { title: "P2 聯絡時機", priority: "P1", signals: ["情況", "時機", "找誰", "聯絡", "管道", "群組"] },
    { title: "A1 必要資源", priority: "P0", signals: ["系統", "文件", "設備", "資源", "工具", "資料夾"] },
    { title: "A2 取得方式", priority: "P0", signals: ["位置", "權限", "申請", "取得", "存取", "連結"] }
  ],
  full: [
    { title: "B1 工作內容", priority: "P0", signals: ["負責", "工作", "產出", "任務", "目標", "內容"] },
    { title: "B2 接手行動", priority: "P0", signals: ["目前", "進度", "下一步", "期限", "待辦", "接手"] },
    { title: "B3 例行與風險", priority: "P1", signals: ["例行", "固定", "風險", "注意", "觸發", "應對"] },
    { title: "P1 關鍵人物", priority: "P0", signals: ["窗口", "負責", "聯絡", "團隊", "部門", "人員"] },
    { title: "P2 聯絡時機", priority: "P1", signals: ["情況", "時機", "找誰", "聯絡", "管道", "群組"] },
    { title: "P3 上級與外部承諾", priority: "P1", signals: ["升級", "主管", "承諾", "客戶", "外部", "狀態"] },
    { title: "A1 必要資源", priority: "P0", signals: ["系統", "文件", "設備", "資源", "工具", "資料夾"] },
    { title: "A2 取得方式", priority: "P0", signals: ["位置", "權限", "申請", "取得", "存取", "連結"] },
    { title: "A3 待移交事項", priority: "P1", signals: ["移交", "權限", "資產", "下一步", "完成", "待處理"] }
  ]
};

const DANGEROUS_SECRET_PATTERNS = [
  /(?:密碼|password|passwd|token|secret|api[_ -]?key|憑證|金鑰)\s*[:：=]\s*\S+/i,
  /(?:bearer\s+)[a-z0-9._-]{12,}/i,
  /sk-[a-z0-9_-]{12,}/i,
  /ghp_[a-z0-9_]{20,}/i
];

const SAFE_SECRET_CONTEXT_PATTERNS = [
  /不保存任何(?:明碼)?密碼/i,
  /不保存任何.*(?:token|api[_ -]?key|secret)/i,
  /不要(?:沿用|保存|提供|填寫).*(?:密碼|token|api[_ -]?key|secret)/i,
  /請使用公司帳號與正式權限流程/i
];

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMode(mode: unknown): ReviewMode {
  return mode === "full" ? "full" : "fast";
}

function normalizeFiles(files: unknown): NormalizedFile[] {
  if (!Array.isArray(files)) return [];

  return (files as ReviewInputFile[]).map((file, index) => ({
    id: normalize(file.id) || `file-${index + 1}`,
    fileName: normalize(file.fileName || file.name),
    mappedItemTitle: normalize(file.mappedItemTitle),
    size: Number(file.size || 0),
    type: normalize(file.type),
    extractedText: normalize(file.extractedText || file.text || file.textPreview),
    extractionStatus: normalize(file.extractionStatus)
  }));
}

function getSecretEvidence(text: string): string[] {
  const normalizedText = String(text || "");
  const evidence: string[] = [];

  DANGEROUS_SECRET_PATTERNS.forEach((pattern) => {
    const match = normalizedText.match(pattern);
    if (!match) return;

    const matchedText = match[0];
    const index = match.index ?? 0;
    const start = Math.max(0, index - 24);
    const end = Math.min(normalizedText.length, index + matchedText.length + 24);
    const snippet = normalizedText.slice(start, end).replace(/\s+/g, " ").trim();

    if (SAFE_SECRET_CONTEXT_PATTERNS.some((safePattern) => safePattern.test(snippet))) return;
    evidence.push(snippet);
  });

  return evidence;
}

function hasDateOrEvidence(text: string): boolean {
  return /\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}|已確認|確認紀錄|完成證據|簽核|會議紀錄|版本/.test(text);
}

function countSignals(text: string, signals: string[]): number {
  return signals.reduce((count, signal) => count + (text.includes(signal.toLowerCase()) ? 1 : 0), 0);
}

function meaningfulLength(text: string): number {
  return String(text || "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .length;
}

function isLowInformationText(text: string): boolean {
  const normalizedText = String(text || "").trim();
  if (meaningfulLength(normalizedText) < 20) return true;

  const repeatedCharacters = normalizedText.match(/(.)\1{4,}/u);
  if (repeatedCharacters) return true;

  return false;
}

function categoryPrefix(title: string): string {
  return String(title || "").trim().slice(0, 1);
}

function hasSameCategory(leftTitle: string, rightTitle: string): boolean {
  const leftPrefix = categoryPrefix(leftTitle);
  const rightPrefix = categoryPrefix(rightTitle);
  return Boolean(leftPrefix && rightPrefix && leftPrefix === rightPrefix && ["B", "P", "A"].includes(leftPrefix));
}

function evaluateItem(item: ChecklistRule, files: NormalizedFile[]): ItemResult {
  const exactMappedFiles = files.filter((file) => file.mappedItemTitle === item.title);
  const categoryMappedFiles = files.filter((file) => hasSameCategory(file.mappedItemTitle, item.title));
  const mappedFiles = exactMappedFiles.length > 0 ? exactMappedFiles : categoryMappedFiles;

  if (mappedFiles.length === 0) {
    return {
      itemTitle: item.title,
      priority: item.priority,
      state: "missing",
      score: 0,
      percentScore: 0,
      blocking: item.priority === "P0",
      message: "找不到對應此交接項目的檔案。",
      sourceFiles: []
    };
  }

  const combinedText = mappedFiles
    .map((file) => file.extractedText)
    .join("\n")
    .toLowerCase();

  const secretEvidence = getSecretEvidence(combinedText);
  if (secretEvidence.length > 0) {
    return {
      itemTitle: item.title,
      priority: item.priority,
      state: "high_risk",
      score: 0,
      percentScore: 0,
      blocking: true,
      message: `文件疑似包含敏感憑證，請確認以下片段並移除後重新上傳：${secretEvidence.join("；")}`,
      sourceFiles: mappedFiles.map((file) => file.fileName)
    };
  }

  const hasReadableText = mappedFiles.some((file) => file.extractedText.length > 0);
  const signalCount = countSignals(combinedText, item.signals);

  if (!hasReadableText) {
    const unreadableFiles = mappedFiles
      .filter((file) => file.extractionStatus !== "ok")
      .map((file) => file.fileName);

    return {
      itemTitle: item.title,
      priority: item.priority,
      state: "unreadable",
      score: 0,
      percentScore: 0,
      blocking: item.priority === "P0",
      message: unreadableFiles.length > 0
        ? `目前無法讀取檔案正文，因此不能確認此項目是否符合交接規範。請改上傳可讀取的文字文件，或之後接 OCR/文件解析：${unreadableFiles.join("、")}`
        : "目前沒有讀到檔案正文，因此不能確認此項目是否符合交接規範。請補上可讀取的文件內容。",
      sourceFiles: mappedFiles.map((file) => file.fileName)
    };
  }

  if (signalCount === 0) {
    if (isLowInformationText(combinedText)) {
      return {
        itemTitle: item.title,
        priority: item.priority,
        state: "invalid_content",
        score: 0,
        percentScore: 0,
        blocking: item.priority === "P0",
        message: "文件內容太短或缺乏可判斷的交接資訊，無法確認此項目是否符合規範。請上傳包含資源位置、權限申請方式、窗口或存取流程的正式文件。",
        sourceFiles: mappedFiles.map((file) => file.fileName)
      };
    }

    return {
      itemTitle: item.title,
      priority: item.priority,
      state: "partial",
      score: 1,
      percentScore: 1,
      blocking: false,
      message: "文件有對應到此項目，但未找到足夠的欄位線索，建議補充到可執行的程度。",
      sourceFiles: mappedFiles.map((file) => file.fileName)
    };
  }

  const verified = hasDateOrEvidence(combinedText);

  return {
    itemTitle: item.title,
    priority: item.priority,
    state: verified ? "verified" : "actionable",
    score: verified ? 3 : 2,
    percentScore: 2,
    blocking: false,
    message: verified
      ? "此項目可行動，且包含日期、版本或確認紀錄。"
      : "此項目已有足夠線索，可供接手者行動。",
    sourceFiles: mappedFiles.map((file) => file.fileName)
  };
}

function detectDuplicateMappings(files: NormalizedFile[]): ReviewIssue[] {
  const grouped = new Map<string, NormalizedFile[]>();
  files.forEach((file) => {
    if (!file.mappedItemTitle || file.mappedItemTitle === "其他補充資料") return;
    const list = grouped.get(file.mappedItemTitle) || [];
    list.push(file);
    grouped.set(file.mappedItemTitle, list);
  });

  return [...grouped.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([itemTitle, list]) => ({
      itemTitle,
      state: "duplicate",
      level: "info" as const,
      blocking: false,
      message: `此項目對應了 ${list.length} 份檔案，送審前可確認是否有重複或版本差異。`,
      sourceFiles: list.map((file) => file.fileName)
    }));
}

export function reviewHandoffDocuments(input: ReviewInput | null | undefined): RuleReview {
  const mode = normalizeMode(input?.mode);
  const requiredItems = MODE_ITEMS[mode];
  const files = normalizeFiles(input?.files);
  const itemResults = requiredItems.map((item) => evaluateItem(item, files));
  const duplicateIssues = detectDuplicateMappings(files);
  const scoreTotal = itemResults.reduce((sum, item) => sum + item.percentScore, 0);
  const maxScore = requiredItems.length * 2;
  const completeness = maxScore === 0 ? 0 : Math.round((scoreTotal / maxScore) * 100);
  const blockingIssues = itemResults.filter((item) => item.blocking);
  const visibleIssues = itemResults
    .filter((item) => item.state === "partial" || item.state === "missing" || item.state === "high_risk" || item.state === "unreadable" || item.state === "invalid_content")
    .map((item): ReviewIssue => ({
      itemTitle: item.itemTitle,
      state: item.state,
      level: item.state === "high_risk" ? "danger" : item.blocking ? "danger" : "warning",
      blocking: item.blocking,
      message: item.message,
      sourceFiles: item.sourceFiles
    }))
    .concat(duplicateIssues);

  let status: RuleReview["status"] = "complete";
  if (blockingIssues.length > 0 || completeness < 50) {
    status = "high_risk";
  } else if (completeness < 80 || visibleIssues.some((issue) => issue.level !== "info")) {
    status = "needs_work";
  }

  const canSubmit = blockingIssues.length === 0;
  const summary = canSubmit
    ? `Agent 快速檢查完成：整體完備度 ${completeness}%，目前沒有阻斷項，可交由主管審核。`
    : `Agent 快速檢查完成：發現 ${blockingIssues.length} 個阻斷項，請補齊後再送主管審核。`;

  return {
    ok: true as const,
    mode,
    status,
    completeness,
    canSubmit,
    summary,
    itemResults,
    issues: visibleIssues
  };
}

export { MODE_ITEMS };
