import type { RiskKnowledge } from "./types";

export const mockRisks: RiskKnowledge[] = [
  {
    id: "risk-contract-commitment",
    name: "遺漏合約外的對客承諾",
    category: "常見錯誤",
    severity: "high",
    scenario:
      "新負責人只閱讀正式合約，未得知前任曾以郵件承諾特定報表格式與較短回覆時限，導致首次交付即違反客戶期待。",
    cause:
      "口頭或郵件承諾未集中記錄，也沒有在合約交接時邀請業務與客服共同確認。",
    resolution:
      "建立逐客戶承諾清單，將正式條款與例外承諾分欄記錄，並由法務、業務、客服三方簽認後交給接手人。",
    relatedTaskIds: ["task-contract-handover", "task-support-escalation"],
    sourceDocument: "客戶合約交接清單_v3.pdf",
  },
  {
    id: "risk-external-signoff",
    name: "外部簽核延誤後續交接",
    category: "延期原因",
    severity: "medium",
    scenario:
      "客戶尚未簽回續約條款確認書，但團隊仍以原日期安排對帳與服務交接，導致多項任務在截止日前無法定案。",
    cause:
      "任務排程未將客戶簽核列為外部依賴，也沒有設定追蹤人與最晚回覆日。",
    resolution:
      "把外部簽核建立為明確前置條件，指定單一追蹤窗口，於最晚回覆日前兩個工作日升級通知業務主管。",
    relatedTaskIds: ["task-contract-handover", "task-finance-reconciliation"],
    sourceDocument: "續約作業時程表.xlsx",
  },
  {
    id: "risk-access-scope",
    name: "移轉過度或不足的系統權限",
    category: "特殊規則",
    severity: "high",
    scenario:
      "接手工程師在部署當日才發現缺少正式環境權限，或為求方便直接複製前任的管理員角色，形成營運與資安風險。",
    cause:
      "權限交接未依職責拆分，且缺少實際登入、部署與回滾的驗證步驟。",
    resolution:
      "依最小權限原則逐項核准，完成登入與預演後記錄驗證結果；前任帳號僅在接手驗收完成後停用。",
    relatedTaskIds: ["task-system-access", "task-deployment-runbook"],
    sourceDocument: "系統權限矩陣.xlsx",
  },
  {
    id: "risk-reconciliation-cutoff",
    name: "月結切點認知不一致",
    category: "常見錯誤",
    severity: "medium",
    scenario:
      "接手人依發票日期認列收入，但既有流程依驗收日切帳，造成應收帳款與總帳金額不一致。",
    cause:
      "交接文件只描述操作步驟，未說明認列原則、例外案例與異常帳款的核准路徑。",
    resolution:
      "用最近一期實際帳務共同跑完對帳，標示切帳規則與例外，並由財務主管確認差異調整分錄。",
    relatedTaskIds: ["task-finance-reconciliation", "task-vendor-payments"],
    sourceDocument: "月結與應收帳款SOP.docx",
  },
  {
    id: "risk-data-retention",
    name: "交接副本超期留存",
    category: "特殊規則",
    severity: "low",
    scenario:
      "為方便交接而匯出的客戶資料持續留在個人雲端資料夾，超過合約約定的保存期限。",
    cause:
      "臨時匯出檔未登記保存期限與刪除責任人，交接完成後也沒有清理檢核。",
    resolution:
      "所有交接匯出檔需放入受控資料夾並標註到期日；任務結案時由資料責任人確認刪除並留下稽核紀錄。",
    relatedTaskIds: ["task-data-retention-review"],
    sourceDocument: "客戶資料保存政策_2026.pdf",
  },
];
