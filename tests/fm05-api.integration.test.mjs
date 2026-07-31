import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const baseUrl = process.env.FM05_BASE_URL;
const fixtureUrl = new URL("./fixtures/fm05-source-document.json", import.meta.url);

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  return { response, body };
}

test(
  "FM05 source-to-roadmap API flow keeps case data isolated",
  { skip: !baseUrl },
  async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const caseId = `fm05-integration-${Date.now()}`;
    const emptyCaseId = `${caseId}-empty`;
    const preservedCaseId = `${caseId}-preserved`;

    const sourceResult = await request("/api/onboarding/source-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, ...fixture }),
    });
    assert.equal(sourceResult.response.status, 201);
    assert.equal(sourceResult.body.document.chunkCount, 1);

    const generationResult = await request("/api/onboarding/generation-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, executeNow: true }),
    });
    assert.equal(generationResult.response.status, 201);
    assert.equal(generationResult.body.run.status, "completed");

    const tasksResult = await request(
      `/api/onboarding/tasks?caseId=${encodeURIComponent(caseId)}`,
    );
    const risksResult = await request(
      `/api/onboarding/risks?caseId=${encodeURIComponent(caseId)}`,
    );
    assert.equal(tasksResult.body.tasks.length, 8);
    assert.equal(risksResult.body.risks.length, 5);
    assert.ok(tasksResult.body.tasks.every((task) => task.id.startsWith(`${caseId}:`)));
    assert.ok(risksResult.body.risks.every((risk) => risk.id.startsWith(`${caseId}:`)));

    const pendingTask = tasksResult.body.tasks.find((task) => task.status === "待處理");
    assert.ok(pendingTask);
    const updateResult = await request(
      `/api/onboarding/tasks/${encodeURIComponent(pendingTask.id)}?caseId=${encodeURIComponent(caseId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "已完成" }),
      },
    );
    assert.equal(updateResult.response.status, 200);
    assert.equal(updateResult.body.task.status, "已完成");

    const summaryResult = await request(
      `/api/onboarding/summary?caseId=${encodeURIComponent(caseId)}`,
    );
    assert.equal(summaryResult.body.summary.total, 8);
    assert.equal(summaryResult.body.summary.completed, 3);
    assert.equal(summaryResult.body.summary.completionRate, 38);

    const emptyResult = await request(
      `/api/onboarding/tasks?caseId=${encodeURIComponent(emptyCaseId)}`,
    );
    assert.deepEqual(emptyResult.body.tasks, []);

    const bootstrapResult = await request("/api/onboarding/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId: preservedCaseId }),
    });
    assert.equal(bootstrapResult.response.status, 201);
    assert.equal(bootstrapResult.body.taskCount, 8);

    const emptyGenerationResult = await request(
      "/api/onboarding/generation-runs",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: preservedCaseId, executeNow: true }),
      },
    );
    assert.equal(emptyGenerationResult.response.status, 500);
    assert.match(emptyGenerationResult.body.error, /non-empty source document/);

    const preservedTasksResult = await request(
      `/api/onboarding/tasks?caseId=${encodeURIComponent(preservedCaseId)}`,
    );
    assert.equal(preservedTasksResult.body.tasks.length, 8);
  },
);
