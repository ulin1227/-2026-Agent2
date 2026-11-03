"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getBlockingStatus } from "@/lib/onboarding/dependencyEngine";
import {
  fetchTasks,
  type OnboardingTask,
  type TaskStatus,
  updateTaskStatus,
} from "@/lib/onboarding/dataAccess";
import {
  computePriorityScore,
  getPriorityReason,
  scoreToPriority,
} from "@/lib/onboarding/priorityEngine";

import ProgressSummary from "./components/ProgressSummary";
import RecommendedTaskCard from "./components/RecommendedTaskCard";
import TaskListPanel from "./components/TaskListPanel";
import type { EnrichedOnboardingTask } from "./components/TaskDetailDrawer";

function enrichTasks(tasks: OnboardingTask[]): EnrichedOnboardingTask[] {
  const taskStatuses = new Map(tasks.map((task) => [task.id, task.status]));

  return tasks.map((task) => {
    const taskWithCurrentDependencies: OnboardingTask = {
      ...task,
      prerequisites: task.prerequisites.map((prerequisite) => ({
        ...prerequisite,
        status: taskStatuses.get(prerequisite.taskId) ?? prerequisite.status,
      })),
    };
    const priorityScore = computePriorityScore(taskWithCurrentDependencies);

    return {
      ...taskWithCurrentDependencies,
      priorityScore,
      priority: scoreToPriority(priorityScore),
      priorityReason: getPriorityReason(taskWithCurrentDependencies),
      blockingStatus: getBlockingStatus(taskWithCurrentDependencies),
    };
  });
}

export default function RoadmapPage() {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTasks = useCallback(async () => {
    const nextTasks = await fetchTasks();
    setTasks(nextTasks);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        await loadTasks();
      } catch {
        setError("任務資料載入失敗，請重新整理頁面。");
      } finally {
        setLoading(false);
      }
    };

    void initialize();
  }, [loadTasks]);

  const enrichedTasks = useMemo(() => enrichTasks(tasks), [tasks]);
  const selectedTask =
    enrichedTasks.find((task) => task.id === selectedTaskId) ?? null;

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    setError("");
    try {
      await updateTaskStatus(id, status);
      await loadTasks();
    } catch (updateError) {
      setError("任務狀態更新失敗，請稍後再試。");
      throw updateError;
    }
  };

  return (
    <main className="orchard-content">
      <header className="orchard-section">
        <h1 className="orchard-hero-title">新人上手路線圖</h1>
        <p className="orchard-hero-copy">
          依截止日、阻斷性、風險與跨部門相依自動排序，逐步完成交接任務。
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="orchard-section rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-4 py-3 text-sm font-bold text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      {loading ? (
        <section
          className="orchard-card orchard-section px-6 py-20 text-center text-[var(--muted)]"
          aria-live="polite"
        >
          正在整理你的交接任務…
        </section>
      ) : (
        <div className="orchard-panel-grid">
          <ProgressSummary tasks={tasks} />
          <RecommendedTaskCard
            tasks={enrichedTasks}
            onSelectTask={(task) => setSelectedTaskId(task.id)}
          />
          <TaskListPanel
            tasks={enrichedTasks}
            selectedTask={selectedTask}
            onSelectTask={(task) => setSelectedTaskId(task?.id ?? null)}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}
    </main>
  );
}
