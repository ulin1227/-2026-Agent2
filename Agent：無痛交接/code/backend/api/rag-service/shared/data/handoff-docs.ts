import type { Source } from "./fm06";

export type HandoffCategoryId = "business" | "people" | "asset";
export type HandoffItemId =
  | "B1"
  | "B2"
  | "B3"
  | "P1"
  | "P2"
  | "P3"
  | "A1"
  | "A2"
  | "A3";

export type CompletenessItem = {
  id: HandoffItemId;
  category: HandoffCategoryId;
  label: string;
  priority: "P0" | "P1" | "P2";
  score: 0 | 1 | 2;
  status: "missing" | "partial" | "actionable" | "conflict";
  evidenceTitles: string[];
  note: string;
};

export const handoffDocumentPackage = {
  projectName: "Project ORBIT",
  projectSubtitle: "企業客戶自助服務入口網站",
  asOf: "2026-07-22",
  handoffDate: "2026-08-14",
  handoffOwner: "林書妍｜專案營運經理",
  receiver: "周以晨｜專案營運專員",
  files: [
    "01_業務內容交接_Project_ORBIT.docx",
    "02_人際關係交接_Project_ORBIT.docx",
    "03_公司資產交接_Project_ORBIT.docx",
    "[2026_0725 ulin] 交接文件完備性檢查規範.pdf",
  ],
};

export const handoffSources: Source[] = [
  {
    title: "業務內容交接：文件資訊",
    detail:
      "文件編號 ORBIT-HO-BIZ-001，版本 v1.0；交接者林書妍，接手者周以晨；資料基準日 2026-07-22，預定交接日 2026-08-14。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "業務內容交接：工作概述",
    detail:
      "Project ORBIT 目前處於 UAT；主要職責包含任務追蹤、UAT 問題整理、會議與決議紀錄、客戶回饋整理；預計上線日為 2026-10-06。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "業務內容交接：定期工作",
    detail:
      "週二會前更新專案週報；每日整理 UAT 問題；週四確認供應商 SSO 測試報告與未完成交付日；週五彙整客服紀錄與客戶回饋。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "業務內容交接：進行中專案",
    detail:
      "Project ORBIT UAT 完成約 78%，核心功能已可測試；下一步是完成 SSO 安全修正及發票下載測試；負責人為周以晨，文件位置為 KB-ORBIT/00_Project-Overview。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "業務內容交接：背景與風險",
    detail:
      "上線日期因 SSO 安全測試與發票資料錯配風險，由 9 月 22 日調整至 10 月 6 日；第一階段不包含線上付款；發票下載不得出現跨公司資料，測試時必須確認公司別。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "業務內容交接：待辦事項",
    detail:
      "高優先待辦包含 8/18 確認 UAT 阻塞問題負責人，以及 8/21 取得新版 SSO 測試報告；中優先待辦包含 8/16 完成批次發票下載壓力測試與 9/18 更新客服操作說明。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "人際關係交接：團隊成員",
    detail:
      "許雅婷負責專案贊助、上線日期與重大資源決策；陳柏維負責工程開發與修正；郭芷晴負責 SSO、測試帳號與安全問題；李沛蓉負責客服說明；楊舒涵負責個資與客戶條款。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "人際關係交接：外部聯絡人",
    detail:
      "安域科技何俊叡負責 SSO 閘道及安全測試，新版測試報告尚未交付；晨曦物流謝采芸重視登入穩定與批次發票下載；禾木餐飲吳昱廷需在測試前一天取得測試資料。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "人際關係交接：固定溝通與升級",
    detail:
      "每日 10:00 UAT 問題同步；週二 15:00 跨部門專案會議；週四 16:00 供應商技術會議；週五 14:00 客服與客戶回饋整理。核心功能無法使用或資料可能錯配時，需通知陳柏維、郭芷晴並立即升級許雅婷。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "公司資產交接：系統與權限",
    detail:
      "必要系統包含 ORBIT 工單系統、KB-ORBIT 文件庫、UAT 測試網站、BI-042 儀表板與客服知識庫。BI-042 權限尚待處理，其餘多數權限已完成或有明確申請方式。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "公司資產交接：安全規則",
    detail:
      "交接文件不記錄明碼密碼；接手者應以自己的公司帳號申請權限。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "公司資產交接：重要文件位置",
    detail:
      "專案總覽在 KB-ORBIT/00_Project-Overview；需求與流程在 KB-ORBIT/10_Requirements，正式需求版本為 BRD v1.6；UAT 資料在 KB-ORBIT/20_UAT；決策紀錄在 KB-ORBIT/30_Decisions；客服資料在 CS-KB/ORBIT。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "公司資產交接：尚待完成的移交",
    detail:
      "BI-042 儀表板權限預計 8/8 完成；測試帳號清點預計 8/9 完成；實體設備歸還與離職者帳號停用預計 8/14 完成，並各有完成標準。",
    owner: "林書妍",
    date: "2026-07-22",
  },
  {
    title: "完備性檢查規範：流程與基本條件",
    detail:
      "任意格式上傳後先分類為業務內容、人際關係、公司資產，再分項檢查完備度並輸出統計分數與缺漏項目；每個結論需附來源，未知不可猜測，衝突需並列來源。",
    owner: "小組規範",
    date: "2026-07-25",
  },
  {
    title: "完備性檢查規範：九項檢查",
    detail:
      "業務內容檢查 B1 工作內容、B2 接手行動、B3 例行與風險；人際關係檢查 P1 關鍵人物、P2 聯絡時機、P3 上級與外部承諾；公司資產檢查 A1 必要資源、A2 取得方式、A3 待移交事項。",
    owner: "小組規範",
    date: "2026-07-25",
  },
  {
    title: "完備性檢查規範：狀態門檻",
    detail:
      "complete 需達 80 分以上、無阻斷項且所有 P0 欄位至少 actionable；needs_work 為 50-79 分且無阻斷項；high_risk 為低於 50 分或存在任一阻斷項；conflict 需額外標記。",
    owner: "小組規範",
    date: "2026-07-25",
  },
];

export const completenessItems: CompletenessItem[] = [
  {
    id: "B1",
    category: "business",
    label: "工作內容",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["業務內容交接：工作概述", "業務內容交接：定期工作"],
    note:
      "已說明主要負責任務追蹤、UAT 問題整理、會議與決議紀錄、客戶回饋整理，並列出預期產出。",
  },
  {
    id: "B2",
    category: "business",
    label: "接手行動",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["業務內容交接：進行中專案", "業務內容交接：待辦事項"],
    note:
      "已知道目前 UAT 約 78%，下一步是 SSO 安全修正與發票下載測試，高優先待辦有日期與下一步。",
  },
  {
    id: "B3",
    category: "business",
    label: "例行與風險",
    priority: "P1",
    score: 2,
    status: "actionable",
    evidenceTitles: ["業務內容交接：定期工作", "業務內容交接：背景與風險"],
    note:
      "固定週期、觸發條件與發票跨公司資料風險都有處理方式。",
  },
  {
    id: "P1",
    category: "people",
    label: "關鍵人物",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["人際關係交接：團隊成員", "人際關係交接：外部聯絡人"],
    note:
      "已能對應主要內外部窗口與各自負責事項。",
  },
  {
    id: "P2",
    category: "people",
    label: "聯絡時機",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["人際關係交接：固定溝通與升級"],
    note:
      "固定會議節奏、工程問題、重大風險與客戶需求的處理時機清楚。",
  },
  {
    id: "P3",
    category: "people",
    label: "上級與外部承諾",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["人際關係交接：外部聯絡人", "人際關係交接：固定溝通與升級"],
    note:
      "重大問題升級至許雅婷，外部 SSO 測試報告與客戶測試注意事項有目前狀態。",
  },
  {
    id: "A1",
    category: "asset",
    label: "必要資源",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["公司資產交接：系統與權限", "公司資產交接：重要文件位置"],
    note:
      "日常工作需要的系統、文件庫、測試網站、儀表板與客服知識庫已列出用途。",
  },
  {
    id: "A2",
    category: "asset",
    label: "取得方式",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["公司資產交接：系統與權限", "公司資產交接：重要文件位置"],
    note:
      "必要資源已列出位置、權限角色或申請方式，足以讓接手者自行申請或開始使用。",
  },
  {
    id: "A3",
    category: "asset",
    label: "待移交事項",
    priority: "P0",
    score: 2,
    status: "actionable",
    evidenceTitles: ["公司資產交接：尚待完成的移交"],
    note:
      "BI-042、測試帳號、實體設備、離職者帳號停用均有日期、狀態與完成標準。",
  },
];

export const completenessSummary = {
  businessScore: 100,
  peopleScore: 100,
  assetScore: 100,
  overallScore: 100,
  status: "complete",
  blockers: [] as string[],
  conflict: false,
};
