import assert from "node:assert/strict";
import test from "node:test";

import { reviewHandoffFiles } from "../lib/handoff/review.ts";

const checklist = [
  { title: "B2 接手行動", text: "知道目前進度、接手後第一步、重要期限" },
  { title: "A2 取得方式", text: "知道資源在哪裡,以及如何取得權限" },
  { title: "P1 關鍵人物", text: "知道主要內外部窗口是誰、各自負責什麼" },
];

test("passes items whose files cover every required fact", () => {
  const result = reviewHandoffFiles({
    checklist,
    files: [
      {
        fileName: "01.docx",
        mappedItemTitle: "B2 接手行動",
        extractedText: "目前進度：UAT 完成約 78%｜下一步：完成 SSO 安全修正｜預計日期：2026/10/06",
      },
      {
        fileName: "03.docx",
        mappedItemTitle: "A2 取得方式",
        extractedText: "存放位置：KB-ORBIT/20_UAT｜所需權限／申請方式：Viewer；由資料團隊核准",
      },
    ],
  });

  assert.deepEqual(result.checkedItems, ["B2 接手行動", "A2 取得方式"]);
  assert.equal(result.issues.length, 0);
  assert.match(result.summary, /可交給主管審核/);
});

test("flags missing facts, unreadable files and recorded passwords", () => {
  const result = reviewHandoffFiles({
    checklist,
    files: [
      { fileName: "notes.txt", mappedItemTitle: "B2 接手行動", extractedText: "這個專案很重要，請加油。" },
      { fileName: "scan.pdf", mappedItemTitle: "A2 取得方式", extractedText: "", extractionStatus: "unsupported" },
      { fileName: "people.txt", mappedItemTitle: "P1 關鍵人物", extractedText: "窗口：陳柏維 負責工程｜密碼：orbit2026" },
    ],
  });

  const byItem = Object.fromEntries(result.issues.map((issue) => [issue.itemTitle, issue.message]));
  assert.match(byItem["B2 接手行動"], /目前進度、下一步行動、重要期限/);
  assert.match(byItem["A2 取得方式"], /無法讀取「scan\.pdf」/);
  assert.match(byItem["P1 關鍵人物"], /明碼密碼/);
  assert.ok(result.issues.every((issue) => issue.blocking));
  assert.match(result.summary, /3 項需要修正/);
});
