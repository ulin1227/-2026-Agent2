import assert from "node:assert/strict";
import test from "node:test";

import {
  computePriorityScore,
  getPriorityReason,
  scoreToPriority,
} from "../lib/onboarding/priorityEngine.ts";

function futureDeadline(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createTask(overrides = {}) {
  return {
    id: "task-test",
    title: "測試交接任務",
    description: "供優先級引擎測試使用",
    status: "待處理",
    deadline: futureDeadline(10),
    estimateHours: 2,
    department: "工程",
    sourceDocument: "test.md",
    isBlocking: false,
    riskLevel: "low",
    crossDeptDependencyCount: 0,
    prerequisites: [],
    ...overrides,
  };
}

test("computePriorityScore covers all four priority score ranges", () => {
  const p0Score = computePriorityScore(
    createTask({
      deadline: futureDeadline(1),
      isBlocking: true,
      riskLevel: "high",
      crossDeptDependencyCount: 4,
    }),
  );
  const p1Score = computePriorityScore(
    createTask({ deadline: futureDeadline(3), isBlocking: true }),
  );
  const p2Score = computePriorityScore(
    createTask({
      deadline: futureDeadline(5),
      riskLevel: "medium",
      crossDeptDependencyCount: 1,
    }),
  );
  const p3Score = computePriorityScore(createTask());

  assert.equal(p0Score, 100);
  assert.equal(p1Score, 55);
  assert.equal(p2Score, 30);
  assert.equal(p3Score, 5);
  assert.deepEqual(
    [p0Score, p1Score, p2Score, p3Score].map(scoreToPriority),
    ["P0", "P1", "P2", "P3"],
  );
});

test("scoreToPriority handles every threshold boundary", () => {
  assert.equal(scoreToPriority(70), "P0");
  assert.equal(scoreToPriority(69), "P1");
  assert.equal(scoreToPriority(45), "P1");
  assert.equal(scoreToPriority(44), "P2");
  assert.equal(scoreToPriority(25), "P2");
  assert.equal(scoreToPriority(24), "P3");
});

test("getPriorityReason describes urgent, blocking, high-risk dependencies", () => {
  const reason = getPriorityReason(
    createTask({
      deadline: futureDeadline(1),
      isBlocking: true,
      riskLevel: "high",
      crossDeptDependencyCount: 2,
    }),
  );

  assert.match(reason, /截止日僅剩 1 天/);
  assert.match(reason, /阻斷性任務/);
  assert.match(reason, /風險程度為高/);
  assert.match(reason, /2 個跨部門相依/);
});

test("getPriorityReason omits inactive factors and reflects low risk", () => {
  const reason = getPriorityReason(
    createTask({ deadline: futureDeadline(10), riskLevel: "low" }),
  );

  assert.match(reason, /截止日剩餘 10 天/);
  assert.match(reason, /風險程度為低/);
  assert.doesNotMatch(reason, /阻斷性任務|跨部門相依/);
});
