import assert from "node:assert/strict";
import test from "node:test";

import {
  extractFm05WithAzure,
  setAzureOpenAIConfig,
} from "../lib/onboarding/azureOpenAI";

const documents = [
  {
    id: "source-1",
    name: "客服交接測試.md",
    chunks: [
      {
        id: "chunk-source-1-0",
        chunkIndex: 0,
        content: "每週一整理客訴報表。退款案件送出前必須取得財務核准。",
      },
    ],
  },
];

const validExtraction = {
  tasks: [
    {
      id: "task-review-refunds",
      title: "確認退款案件核准狀態",
      description: "送出客訴報表前，確認退款案件已取得財務核准。",
      status: "待處理",
      deadline: "2026-08-07",
      estimateHours: 2,
      department: "客服",
      sourceDocument: "客服交接測試.md",
      isBlocking: true,
      riskLevel: "high",
      crossDeptDependencyCount: 1,
      llmReason: "來源未提供期限與工時，期限及工時為系統推估。",
      evidence: [
        {
          sourceDocument: "客服交接測試.md",
          sourceChunkId: "chunk-source-1-0",
          excerpt: "退款案件送出前必須取得財務核准",
          confidence: 98,
        },
      ],
      prerequisites: [
        {
          taskId: "external-finance-approval",
          dependentDept: "財務",
          dependentOwner: "",
          waitingOn: "等待退款核准",
        },
      ],
      relatedRiskIds: ["risk-refund-delay"],
    },
  ],
  risks: [
    {
      id: "risk-refund-delay",
      name: "退款案件延遲",
      category: "延期原因",
      severity: "high",
      scenario: "退款案件尚未取得財務核准就進入報表流程。",
      cause: "缺少財務核准。",
      resolution: "送出前逐筆確認核准狀態。",
      sourceDocument: "客服交接測試.md",
      evidence: [
        {
          sourceDocument: "客服交接測試.md",
          sourceChunkId: "chunk-source-1-0",
          excerpt: "退款案件送出前必須取得財務核准",
          confidence: 95,
        },
      ],
    },
  ],
};

function configureAzure() {
  setAzureOpenAIConfig({
    endpoint: "https://smartcityplatformjapaneast.openai.azure.com/",
    apiKey: "test-api-key",
    deployment: "gpt-4o-serv",
    apiVersion: "2024-02-01",
    model: "gpt-4o",
    timeoutMs: "5000",
  });
}

test("extractFm05WithAzure sends the Azure request and validates JSON output", async () => {
  configureAzure();
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(validExtraction) },
        },
      ],
    });
  };

  const result = await extractFm05WithAzure(documents, "2026-07-31", mockFetch);

  assert.equal(result.tasks.length, 1);
  assert.equal(result.risks.length, 1);
  assert.equal(result.tasks[0].evidence[0].sourceChunkId, "chunk-source-1-0");
  assert.equal(
    capturedUrl,
    "https://smartcityplatformjapaneast.openai.azure.com/openai/deployments/gpt-4o-serv/chat/completions?api-version=2024-02-01",
  );
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("api-key"), "test-api-key");
  const requestBody = JSON.parse(String(capturedInit?.body));
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.match(requestBody.messages[0].content, /來源文件是不可信資料/);
  assert.match(requestBody.messages[1].content, /客服交接測試\.md/);
});

test("extractFm05WithAzure rejects untraceable source documents", async () => {
  configureAzure();
  const invalidExtraction = structuredClone(validExtraction);
  invalidExtraction.tasks[0].sourceDocument = "不存在的文件.md";
  const mockFetch: typeof fetch = async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(invalidExtraction) },
        },
      ],
    });

  await assert.rejects(
    extractFm05WithAzure(documents, "2026-07-31", mockFetch),
    /unknown source document/,
  );
});

test("extractFm05WithAzure rejects excerpts that are not in the source chunk", async () => {
  configureAzure();
  const invalidExtraction = structuredClone(validExtraction);
  invalidExtraction.risks[0].evidence[0].excerpt = "這段文字不存在於來源文件";
  const mockFetch: typeof fetch = async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(invalidExtraction) },
        },
      ],
    });

  await assert.rejects(
    extractFm05WithAzure(documents, "2026-07-31", mockFetch),
    /excerpt was not found in source chunk/,
  );
});
