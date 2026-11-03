import type { GoldenQuestion } from "./evaluation";

/** Development split. It may be used to tune deterministic ARRF parameters. */
export const ORBIT_DEVELOPMENT_QUESTIONS: GoldenQuestion[] = [
  {
    id: "stage",
    question: "Project ORBIT 現在進行到哪一個階段？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "使用者驗收測試（UAT）",
  },
  {
    id: "launch-date",
    question: "ORBIT 預計什麼時候上線？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "2026 年 10 月 6 日",
  },
  {
    id: "invoice-risk",
    question: "發票公司名稱或金額不符時要怎麼處理？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "停止該批次下載",
  },
  {
    id: "sso-report",
    question: "新版 SSO 測試報告目前是什麼狀態？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "等待供應商交付",
  },
  {
    id: "uat-owner",
    question: "UAT 阻塞問題接下來要做什麼？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "逐項更新 owner 與修正日期",
  },
  {
    id: "security-contact",
    question: "登入、權限或疑似資料外洩應該聯絡誰？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "郭芷晴",
  },
  {
    id: "date-decision",
    question: "需要改變上線日期時由誰做決策？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "許雅婷",
  },
  {
    id: "vendor-meeting",
    question: "供應商技術會議固定在什麼時間？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "週四 16:00",
  },
  {
    id: "engineering-report",
    question: "工程問題應該附上哪些資訊？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "附工單編號、重現步驟及畫面",
  },
  {
    id: "bi-permission",
    question: "BI-042 儀表板權限移交完成了嗎？",
    relevantEvidence: [{
      fileNameIncludes: "公司資產交接",
      allTextIncludes: ["BI-042 儀表板權限", "目前狀態：待處理"],
    }, {
      fileNameIncludes: "公司資產交接",
      allTextIncludes: ["BI-042 儀表板", "移交狀態：待處理"],
    }],
  },
  {
    id: "decision-location",
    question: "專案的重要決策紀錄放在哪裡？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "KB-ORBIT/30_Decisions",
  },
  {
    id: "laptop-return",
    question: "公司的筆電在離職時如何歸還？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "離職日交由 IT 回收",
  },
  {
    id: "password-policy",
    question: "交接文件裡可以記錄帳號密碼嗎？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "不在交接文件記錄密碼",
  },
  {
    id: "test-phone",
    question: "測試用 Android 手機放在哪裡？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "QA 設備櫃 A-03",
  },
  {
    id: "uat-site-access",
    question: "要使用 UAT 測試網站需要申請什麼權限？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "Tenant Tester",
  },
  {
    id: "nimbus-stage",
    question: "NIMBUS 現在導入多少正式流量？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "正式流量 25%",
  },
  {
    id: "nimbus-freeze",
    question: "NIMBUS 每週的變更凍結窗是幾點？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "每週五 18:00-22:00",
  },
  {
    id: "nimbus-rollback",
    question: "錯誤率達到什麼條件時需要回滾 NIMBUS？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "錯誤率連續 5 分鐘高於 2%",
  },
  {
    id: "nimbus-room",
    question: "NIMBUS 的事故協作 Slack 頻道在哪裡？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "Slack #inc-nimbus",
  },
  {
    id: "nimbus-vault",
    question: "NIMBUS 正式環境 secrets 的 Vault 路徑是什麼？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "sec/nimbus/prod",
  },
  {
    id: "lantern-renewal",
    question: "LANTERN 的續約日是哪一天？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "2026 年 11 月 30 日",
  },
  {
    id: "lantern-health",
    question: "LANTERN 的帳戶健康度為什麼是黃色？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "行動版 MAU 較上月下降 18%",
  },
  {
    id: "lantern-sponsor",
    question: "LANTERN 的主要客戶贊助人是誰？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "Evelyn Wang／營運副總",
  },
  {
    id: "lantern-qbr",
    question: "LANTERN 的 QBR 固定安排在什麼時間？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "每季第一週週二 14:00",
  },
  {
    id: "lantern-demo",
    question: "LANTERN 的展示環境 tenant 代碼是什麼？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "LTN-DEMO-07",
  },
  {
    id: "aurora-vendor",
    question: "AURORA 的主要供應商是哪一家？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "NovaPay Systems",
  },
  {
    id: "aurora-po",
    question: "AURORA 目前使用的採購單編號是什麼？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "AUR-PO-2026-117",
  },
  {
    id: "aurora-cfo-threshold",
    question: "AURORA 單筆金額超過多少需要 CFO 核准？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "單筆超過新台幣 150,000 元須由 CFO 核准",
  },
  {
    id: "aurora-invoice-folder",
    question: "AURORA 發票要放到哪個資料夾？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "FIN/AP/AURORA/2026",
  },
  {
    id: "aurora-contract-end",
    question: "NovaPay 的 AURORA 合約何時到期？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "2027 年 3 月 31 日",
  },
];

/**
 * Query-level holdout: these paraphrases are not used by the parameter search.
 * They cover the same evidence facts, so this is a robustness check rather than
 * an independent-domain benchmark.
 */
export const ORBIT_HOLDOUT_QUESTIONS: GoldenQuestion[] = [
  {
    id: "holdout-stage",
    question: "目前 ORBIT 專案做到什麼進度了？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "使用者驗收測試（UAT）",
  },
  {
    id: "holdout-launch-date",
    question: "這個專案正式上線日預定是哪一天？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "2026 年 10 月 6 日",
  },
  {
    id: "holdout-invoice-risk",
    question: "客戶發票資料對不上時，第一步怎麼處理？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "停止該批次下載",
  },
  {
    id: "holdout-sso-report",
    question: "供應商還沒交新版 SSO 測試報告嗎？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "等待供應商交付",
  },
  {
    id: "holdout-uat-owner",
    question: "UAT 卡住的項目要如何繼續追蹤？",
    expectedFileNameIncludes: "業務內容交接",
    expectedTextIncludes: "逐項更新 owner 與修正日期",
  },
  {
    id: "holdout-security-contact",
    question: "如果懷疑有資料洩漏，我要找哪位窗口？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "郭芷晴",
  },
  {
    id: "holdout-date-decision",
    question: "延期上線需要請誰拍板？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "許雅婷",
  },
  {
    id: "holdout-vendor-meeting",
    question: "每週和供應商開技術會議的時段是？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "週四 16:00",
  },
  {
    id: "holdout-engineering-report",
    question: "回報工程異常時，工單還要附什麼？",
    expectedFileNameIncludes: "人際關係交接",
    expectedTextIncludes: "附工單編號、重現步驟及畫面",
  },
  {
    id: "holdout-bi-permission",
    question: "新人現在能查看 BI-042 報表了嗎？",
    relevantEvidence: [{
      fileNameIncludes: "公司資產交接",
      allTextIncludes: ["BI-042 儀表板權限", "目前狀態：待處理"],
    }, {
      fileNameIncludes: "公司資產交接",
      allTextIncludes: ["BI-042 儀表板", "移交狀態：待處理"],
    }],
  },
  {
    id: "holdout-decision-location",
    question: "要去哪個資料夾查 ORBIT 過去的決策與原因？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "KB-ORBIT/30_Decisions",
  },
  {
    id: "holdout-laptop-return",
    question: "離職前公司配發的 NB-TW-2841 應交給誰？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "離職日交由 IT 回收",
  },
  {
    id: "holdout-password-policy",
    question: "我能把登入密碼直接寫進交接檔嗎？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "不在交接文件記錄密碼",
  },
  {
    id: "holdout-test-phone",
    question: "PHONE-663 目前由哪裡保管？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "QA 設備櫃 A-03",
  },
  {
    id: "holdout-uat-site-access",
    question: "進 UAT 網站的個人測試帳號要有哪種角色？",
    expectedFileNameIncludes: "公司資產交接",
    expectedTextIncludes: "Tenant Tester",
  },
  {
    id: "holdout-nimbus-oncall",
    question: "NIMBUS 發生事故時主要值班工程師與分機是什麼？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "陳昱豪，分機 7312",
  },
  {
    id: "holdout-nimbus-backup",
    question: "NIMBUS 資料庫每天何時備份，會保留多久？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "每日 02:30，自動保留 14 天",
  },
  {
    id: "holdout-nimbus-p1",
    question: "NIMBUS P1 服務中斷要在多久內回應？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "10 分鐘內回應",
  },
  {
    id: "holdout-nimbus-status-page",
    question: "誰核准後才能發布 NIMBUS 狀態頁公告？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "Incident Commander 核准後發布",
  },
  {
    id: "holdout-nimbus-staging-role",
    question: "操作 NIMBUS staging 需要哪個 IAM 角色？",
    expectedFileNameIncludes: "平台維運交接",
    expectedTextIncludes: "NIMBUS-Staging-Operator",
  },
  {
    id: "holdout-lantern-risk",
    question: "什麼情況會讓 LANTERN 被列為高流失風險？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "若 9 月 15 日前未通過 SSO pilot",
  },
  {
    id: "holdout-lantern-escalation",
    question: "LANTERN 的 P1 緊急升級要寄到哪個信箱？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "cs-lantern-urgent@example.com",
  },
  {
    id: "holdout-lantern-weekly",
    question: "LANTERN 每週和客戶同步的時間是？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "每週三 10:30",
  },
  {
    id: "holdout-lantern-nps-owner",
    question: "LANTERN 的 NPS 負評由誰追蹤？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "黃嘉文",
  },
  {
    id: "holdout-lantern-language",
    question: "LANTERN 對客戶提供哪些支援語言？",
    expectedFileNameIncludes: "客戶成功交接",
    expectedTextIncludes: "繁體中文與英文",
  },
  {
    id: "holdout-aurora-payment",
    question: "AURORA 的付款條件是幾天？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "NET45",
  },
  {
    id: "holdout-aurora-invoice-mismatch",
    question: "AURORA 發票資料不符時要如何處理？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "暫停入帳，1 個工作天內通知財務",
  },
  {
    id: "holdout-aurora-owner",
    question: "AURORA 的採購財務作業負責人是誰？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "作業負責人｜作業方式：林慧珊",
  },
  {
    id: "holdout-aurora-licenses",
    question: "AURORA 有多少軟體授權，多久沒用要回收？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "共 48 席；帳號閒置超過 30 天即回收",
  },
  {
    id: "holdout-aurora-retention",
    question: "AURORA 的付款稽核證據需要保存幾年？",
    expectedFileNameIncludes: "採購財務交接",
    expectedTextIncludes: "稽核證據保存 7 年",
  },
];

/** Backward-compatible name for the full development baseline. */
export const ORBIT_GOLDEN_QUESTIONS = ORBIT_DEVELOPMENT_QUESTIONS;
