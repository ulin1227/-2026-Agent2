import assert from "node:assert/strict";
import test from "node:test";

import { getBlockingStatus } from "../lib/onboarding/dependencyEngine.ts";

function createTask(prerequisites) {
  return {
    id: "task-test",
    title: "測試交接任務",
    description: "供相依性引擎測試使用",
    status: "待處理",
    deadline: "2099-12-31",
    estimateHours: 2,
    department: "客服",
    sourceDocument: "test.md",
    isBlocking: false,
    riskLevel: "low",
    crossDeptDependencyCount: 0,
    prerequisites,
  };
}

test("getBlockingStatus returns blocked false when prerequisites are complete", () => {
  const task = createTask([
    {
      taskId: "task-complete",
      taskTitle: "已完成的權限移轉",
      status: "已完成",
      dependentDept: "工程",
    },
  ]);

  assert.deepEqual(getBlockingStatus(task), { blocked: false });
});

test("getBlockingStatus returns unfinished reasons and preserves waitingOn", () => {
  const task = createTask([
    {
      taskId: "task-complete",
      taskTitle: "已完成的資料盤點",
      status: "已完成",
    },
    {
      taskId: "external-signoff",
      taskTitle: "取得客戶簽核",
      status: "進行中",
      dependentDept: "業務",
      dependentOwner: "陳怡君",
      waitingOn: "等待客戶簽回續約確認書",
    },
  ]);

  assert.deepEqual(getBlockingStatus(task), {
    blocked: true,
    reasons: [
      {
        taskTitle: "取得客戶簽核",
        status: "進行中",
        dept: "業務",
        owner: "陳怡君",
        waitingOn: "等待客戶簽回續約確認書",
      },
    ],
  });
});
