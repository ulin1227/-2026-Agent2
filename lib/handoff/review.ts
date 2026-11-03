// Rule-based completeness check for handoff documents (交接文件完備性檢查).
// Each checklist item lists the facts a newcomer needs; a file mapped to the item
// must mention every one of them, otherwise the item is flagged for revision.

export type ReviewFile = {
  fileName: string;
  mappedItemTitle?: string;
  extractedText?: string;
  extractionStatus?: string;
};

export type ReviewChecklistItem = { title: string; text?: string };

export type ReviewIssue = {
  itemTitle: string;
  message: string;
  blocking: boolean;
};

export type ReviewResult = {
  summary: string;
  checkedItems: string[];
  issues: ReviewIssue[];
  engine: "rule-based-v1";
};

type Requirement = { label: string; pattern: RegExp };

const DATE_PATTERN = /\d{1,2}\s*\/\s*\d{1,2}|\d{4}\s*[年/-]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日|每(日|週|周|月)|週[一二三四五六日]/;

const requirementsByCode: Record<string, Requirement[]> = {
  B1: [
    { label: "主要職責或工作目的", pattern: /職責|工作目的|負責|工作項目|工作內容/ },
    { label: "預期產出或定期工作", pattern: /產出|週報|報告|定期|紀錄|整理/ },
  ],
  B2: [
    { label: "目前進度", pattern: /進度|目前階段|目前狀態|完成約|\d+\s*%/ },
    { label: "下一步行動", pattern: /下一步|待辦|接下來|後續/ },
    { label: "重要期限", pattern: DATE_PATTERN },
  ],
  B3: [
    { label: "固定工作節奏", pattern: /每(日|週|周|月)|定期|例行|固定/ },
    { label: "注意事項或風險", pattern: /風險|注意|不得|避免|錯誤/ },
  ],
  P1: [
    { label: "人員姓名與角色", pattern: /姓名|角色|窗口|聯絡人|主管|負責人/ },
    { label: "各自負責事項", pattern: /負責事項|負責|合作內容|分工/ },
  ],
  P2: [
    { label: "聯絡時機", pattern: /什麼情況|情況|時機|需要聯絡|狀況/ },
    { label: "第一聯絡人或升級對象", pattern: /第一聯絡人|升級|通知|找誰|聯絡窗口/ },
  ],
  P3: [
    { label: "重大問題的升級對象", pattern: /升級|決策|贊助人|主管/ },
    { label: "未完成的外部承諾", pattern: /承諾|外部|客戶|供應商|合作/ },
  ],
  A1: [
    { label: "需要的系統、文件或設備", pattern: /系統|文件|設備|儀表板|知識庫/ },
  ],
  A2: [
    { label: "存放位置", pattern: /存放位置|位置|路徑|KB-|資料夾|連結/ },
    { label: "權限取得方式", pattern: /申請|權限|核准|加入.*群組/ },
  ],
  A3: [
    { label: "尚未完成的移交項目", pattern: /待處理|未開始|進行中|尚待|待移交/ },
    { label: "預計日期或完成標準", pattern: new RegExp(`${DATE_PATTERN.source}|完成標準`) },
  ],
};

const SECRET_PATTERN = /(密碼|password|passwd|api[ _-]?key|token)\s*[:：=]\s*[^\s｜|，。]{4,}/i;

function itemCode(title: string): string {
  return title.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
}

export function reviewHandoffFiles(input: {
  checklist: ReviewChecklistItem[];
  files: ReviewFile[];
}): ReviewResult {
  const issues: ReviewIssue[] = [];
  const checkedItems: string[] = [];

  for (const item of input.checklist) {
    const mapped = input.files.filter((file) => file.mappedItemTitle === item.title);
    if (mapped.length === 0) continue;
    checkedItems.push(item.title);

    const readable = mapped.filter((file) => file.extractedText?.trim());
    if (readable.length === 0) {
      issues.push({
        itemTitle: item.title,
        blocking: true,
        message: `無法讀取「${mapped.map((file) => file.fileName).join("、")}」的文字內容，請改上傳 DOCX 或文字檔，讓 Agent 能確認內容。`,
      });
      continue;
    }

    const text = readable.map((file) => file.extractedText).join("\n");
    if (SECRET_PATTERN.test(text)) {
      issues.push({
        itemTitle: item.title,
        blocking: true,
        message: "文件中疑似記錄了明碼密碼或金鑰，請移除後改寫為「由接手者以自己的帳號申請權限」。",
      });
      continue;
    }

    const missing = (requirementsByCode[itemCode(item.title)] ?? [])
      .filter((requirement) => !requirement.pattern.test(text))
      .map((requirement) => requirement.label);
    if (missing.length) {
      issues.push({
        itemTitle: item.title,
        blocking: true,
        message: `內容缺少：${missing.join("、")}。請補充後再上傳，確保新人${item.text ?? "知道如何接手"}。`,
      });
    }
  }

  const blocking = issues.filter((issue) => issue.blocking).length;
  const summary = checkedItems.length === 0
    ? "目前沒有已對應清單項目的檔案可檢查。"
    : blocking
      ? `Agent 已檢查 ${checkedItems.length} 個清單項目，其中 ${blocking} 項需要修正，請點擊黃色項目查看建議。`
      : `Agent 已檢查 ${checkedItems.length} 個清單項目，必要欄位皆已具備，可交給主管審核。`;

  return { summary, checkedItems, issues, engine: "rule-based-v1" };
}
