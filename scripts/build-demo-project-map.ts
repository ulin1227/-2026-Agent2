// Builds shared/data/demo-project-map.json, the default project map shown before any upload.
// Evidence comes from parsing data/無痛交接Demo資料_v1; the classification below is a
// pre-authored stand-in for the LLM step, so the demo needs no OPENAI_API_KEY.
// Run: npx tsx scripts/build-demo-project-map.ts
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseDocx } from "../lib/docx/parse";
import { buildMindMap, type AgentClassification } from "../lib/mindmap";

const sourceDirectory = new URL("../data/無痛交接Demo資料_v1/", import.meta.url);
const outputFile = new URL("../shared/data/demo-project-map.json", import.meta.url);

const classification: AgentClassification = {
  projectName: "Project ORBIT 企業客戶自助服務入口網站",
  nodes: [
    {
      key: "orbit-uat",
      category: "project_state",
      title: "UAT 完成約 78%",
      summary: "專案正處於使用者驗收測試，核心功能已可測試，預計 2026/10/06 上線。",
      details: [
        "目前階段：使用者驗收測試（UAT）",
        "下一步：完成 SSO 安全修正及發票下載測試",
        "專案總覽文件：KB-ORBIT/00_Project-Overview",
      ],
      sourceIds: ["ev-d1-t2-r3", "ev-d1-t4-r2", "ev-d1-t2-r4"],
    },
    {
      key: "orbit-sso-report",
      category: "project_state",
      title: "取得新版 SSO 測試報告",
      summary: "高優先待辦，預計 8/21 完成；等待供應商交付後請資安確認。",
      details: [
        "優先程度：高",
        "每週四與安域科技確認交付進度",
        "交付後由資安郭芷晴確認",
      ],
      sourceIds: ["ev-d1-t6-r3", "ev-d1-t3-r4"],
    },
    {
      key: "orbit-invoice-test",
      category: "project_state",
      title: "批次發票下載壓力測試",
      summary: "中優先待辦，預計 8/16 完成；需等工程修正後重新測試。",
      details: ["工程修正後重新測試", "測試時必須確認公司別"],
      sourceIds: ["ev-d1-t6-r4"],
    },
    {
      key: "orbit-routine",
      category: "project_state",
      title: "每週固定工作節奏",
      summary: "週二週報、每日 UAT 問題整理、週四供應商進度、週五客戶回饋。",
      details: [
        "專案週報：每週二會前更新進度、阻塞與需決策事項",
        "UAT 問題整理：每日確認嚴重度、負責人與預計修正日",
        "客戶回饋整理：每週五彙整，必要時建立新工單",
      ],
      sourceIds: ["ev-d1-t3-r2", "ev-d1-t3-r3", "ev-d1-t3-r5"],
    },
    {
      key: "decision-golive",
      category: "decision_context",
      title: "上線日由 9/22 延至 10/6",
      summary: "因 SSO 安全測試與發票資料錯配風險，決定延後上線兩週。",
      details: ["原定上線日：9 月 22 日", "調整後上線日：10 月 6 日"],
      sourceIds: ["ev-d1-t5-r2"],
    },
    {
      key: "decision-scope",
      category: "decision_context",
      title: "第一階段不含線上付款",
      summary: "第一階段範圍為訂單查詢、發票下載與售後案件。",
      details: ["包含：訂單查詢、發票下載、售後案件", "不包含：線上付款"],
      sourceIds: ["ev-d1-t5-r3"],
    },
    {
      key: "decision-requests",
      category: "decision_context",
      title: "客戶需求先評估、不承諾日期",
      summary: "試行客戶提出新功能時，先記錄需求與情境，週五統一評估是否納入。",
      details: ["不直接承諾功能或完成日期", "口頭決議會後寫入會議紀錄並標示責任人"],
      sourceIds: ["ev-d1-t7-r4", "ev-d2-t5-r4", "ev-d2-t5-r5"],
    },
    {
      key: "decision-credentials",
      category: "decision_context",
      title: "權限以本人帳號申請",
      summary: "交接文件不記錄密碼，接手者以自己的公司帳號與安全金鑰申請權限。",
      details: ["FIDO2 安全金鑰離職日交回 IT", "接手者使用自己的金鑰"],
      sourceIds: ["ev-d3-t3-r2", "ev-d3-t5-r3"],
    },
    {
      key: "people-sponsor",
      category: "people_ownership",
      title: "許雅婷｜營運副總",
      summary: "專案贊助人，負責上線日期、範圍與重大資源決策。",
      details: ["上線日期、預算或客戶承諾改變時由她決策", "重大風險需整理現況、影響與最晚決策日後提供"],
      sourceIds: ["ev-d2-t2-r2", "ev-d2-t6-r4", "ev-d2-t5-r3"],
    },
    {
      key: "people-engineering",
      category: "people_ownership",
      title: "陳柏維（工程）・郭芷晴（資安）",
      summary: "工程主管負責缺陷修正與上線安排；資安負責 SSO、測試帳號與安全問題。",
      details: ["工程問題需附工單編號、重現步驟及畫面", "登入、權限或疑似外洩問題找郭芷晴"],
      sourceIds: ["ev-d2-t2-r3", "ev-d2-t2-r4", "ev-d2-t5-r2"],
    },
    {
      key: "people-vendor",
      category: "people_ownership",
      title: "安域科技｜何俊叡",
      summary: "SSO 閘道與安全測試供應商；新版測試報告尚未交付。",
      details: ["每週四 16:00 供應商技術會議"],
      sourceIds: ["ev-d2-t3-r2", "ev-d2-t4-r4"],
    },
    {
      key: "people-customers",
      category: "people_ownership",
      title: "UAT 試行客戶",
      summary: "晨曦物流重視登入穩定與批次發票下載；禾木餐飲負責發票與對帳測試。",
      details: ["晨曦物流｜謝采芸", "禾木餐飲｜吳昱廷：測試前一天要提供測試資料"],
      sourceIds: ["ev-d2-t3-r3", "ev-d2-t3-r4"],
    },
    {
      key: "risk-invoice",
      category: "history_risk_error",
      title: "發票跨公司資料錯配",
      summary: "發票下載不得出現跨公司資料；發生時停止批次並交由工程確認 tenant。",
      details: ["保留畫面與時間", "聯絡窗口：陳柏維／工程"],
      sourceIds: ["ev-d1-t5-r4", "ev-d1-t7-r3"],
    },
    {
      key: "risk-login",
      category: "history_risk_error",
      title: "系統無法登入",
      summary: "先確認是否只有單一測試帳號受影響；多帳號同時失敗立即建立高優先工單。",
      details: ["聯絡窗口：郭芷晴／資安"],
      sourceIds: ["ev-d1-t7-r2"],
    },
    {
      key: "risk-escalation",
      category: "history_risk_error",
      title: "核心功能異常的升級路徑",
      summary: "核心功能無法使用或資料可能錯配時，由工程與資安處理並立即通知許雅婷。",
      details: ["一般進度問題在週二專案會議處理"],
      sourceIds: ["ev-d2-t6-r3", "ev-d2-t6-r2"],
    },
    {
      key: "risk-pending-assets",
      category: "history_risk_error",
      title: "尚未完成的權限移交",
      summary: "BI-042 儀表板權限待處理（8/8），測試帳號清點進行中（8/9）。",
      details: ["BI-042 需由資料團隊核准 Viewer 權限", "每個測試帳號均需有用途及到期日"],
      sourceIds: ["ev-d3-t6-r2", "ev-d3-t6-r3", "ev-d3-t2-r5"],
    },
  ],
  relations: [
    { fromKey: "decision-golive", toKey: "risk-invoice", label: "延期原因：發票資料錯配風險" },
    { fromKey: "decision-golive", toKey: "orbit-sso-report", label: "延期原因：SSO 安全測試未完成" },
    { fromKey: "orbit-sso-report", toKey: "people-vendor", label: "SSO 測試報告由安域科技交付" },
    { fromKey: "risk-invoice", toKey: "people-engineering", label: "錯配時交由工程確認 tenant 資料" },
    { fromKey: "risk-escalation", toKey: "people-sponsor", label: "重大問題升級給專案贊助人" },
    { fromKey: "orbit-invoice-test", toKey: "people-customers", label: "晨曦物流重視批次發票下載" },
  ],
};

const names = (await readdir(sourceDirectory)).filter((name) => name.endsWith(".docx")).sort();
const documents = await Promise.all(
  names.map(async (name, index) => {
    const bytes = await readFile(new URL(name, sourceDirectory));
    return parseDocx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), name, index + 1);
  }),
);

const result = {
  ...buildMindMap(classification, documents, "demo-fixture"),
  ingestion: { scannedFiles: names.length, processedFiles: names.length, skippedFiles: 0 },
};
result.meta.generatedAt = "2026-07-22T09:00:00.000Z";

const missingSources = result.branches
  .flatMap((branch) => branch.nodes)
  .filter((node) => node.sources.length === 0)
  .map((node) => node.id);
if (missingSources.length) throw new Error(`Nodes without evidence: ${missingSources.join(", ")}`);

await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(`wrote ${fileURLToPath(outputFile)}: ${result.branches.map((branch) => `${branch.id}=${branch.nodes.length}`).join(" ")}, relations=${result.relations.length}`);
