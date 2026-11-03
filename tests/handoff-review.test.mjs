import assert from "node:assert/strict";
import test from "node:test";

import { reviewHandoffDocuments } from "../lib/handoff/review-engine.ts";

const businessText = "工作目的：追蹤進度並負責 UAT。目前進度：完成約 78%。下一步：完成 SSO 測試，期限 2026/10/06。";
const peopleText = "窗口：陳柏維｜工程主管｜負責系統開發。什麼情況需要聯絡：核心功能異常時找誰處理。";
const assetsText = "系統：ORBIT 工單系統｜文件存放位置：KB-ORBIT｜權限申請方式：由專案管理員加入。";

test("one document per B/P/A category covers the fast-mode checklist", () => {
  const review = reviewHandoffDocuments({
    mode: "fast",
    files: [
      { fileName: "01.docx", mappedItemTitle: "B1 工作內容", extractedText: businessText, extractionStatus: "ok" },
      { fileName: "02.docx", mappedItemTitle: "P1 關鍵人物", extractedText: peopleText, extractionStatus: "ok" },
      { fileName: "03.docx", mappedItemTitle: "A1 必要資源", extractedText: assetsText, extractionStatus: "ok" },
    ],
  });

  assert.equal(review.ok, true);
  assert.equal(review.canSubmit, true);
  assert.equal(review.itemResults.length, 6);
  assert.ok(review.itemResults.every((item) => !item.blocking));
  assert.match(review.summary, /可交由主管審核/);
});

test("blocks missing categories, unreadable files and plaintext credentials", () => {
  const review = reviewHandoffDocuments({
    mode: "fast",
    files: [
      { fileName: "scan.pdf", mappedItemTitle: "B1 工作內容", extractedText: "", extractionStatus: "unsupported" },
      { fileName: "people.txt", mappedItemTitle: "P1 關鍵人物", extractedText: `${peopleText} 密碼：orbit2026`, extractionStatus: "ok" },
    ],
  });

  const byItem = Object.fromEntries(review.itemResults.map((item) => [item.itemTitle, item]));
  assert.equal(review.canSubmit, false);
  assert.equal(byItem["B1 工作內容"].state, "unreadable");
  assert.equal(byItem["P1 關鍵人物"].state, "high_risk");
  assert.equal(byItem["A1 必要資源"].state, "missing");
  assert.equal(review.status, "high_risk");
});

test("treats security policy statements as safe", () => {
  const review = reviewHandoffDocuments({
    mode: "fast",
    files: [
      {
        fileName: "03.docx",
        mappedItemTitle: "A2 取得方式",
        extractedText: `${assetsText} 本文件不保存任何明碼密碼、token 或 API key，請使用公司帳號與正式權限流程。`,
        extractionStatus: "ok",
      },
    ],
  });

  const a2 = review.itemResults.find((item) => item.itemTitle === "A2 取得方式");
  assert.notEqual(a2.state, "high_risk");
});
