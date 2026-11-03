"use client";

import { useMemo, useState } from "react";

import type { TaskStatus } from "@/lib/onboarding/dataAccess";

import PriorityBadge from "./PriorityBadge";
import TaskDetailDrawer, {
  type EnrichedOnboardingTask,
} from "./TaskDetailDrawer";

type StatusFilter = "全部" | TaskStatus;

interface TaskListPanelProps {
  tasks: EnrichedOnboardingTask[];
  selectedTask: EnrichedOnboardingTask | null;
  onSelectTask: (task: EnrichedOnboardingTask | null) => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
}

const filters: StatusFilter[] = ["全部", "待處理", "進行中", "已完成"];

export default function TaskListPanel({
  tasks,
  selectedTask,
  onSelectTask,
  onStatusChange,
}: TaskListPanelProps) {
  const [filter, setFilter] = useState<StatusFilter>("全部");
  const filteredTasks = useMemo(
    () =>
      filter === "全部"
        ? tasks
        : tasks.filter((task) => task.status === filter),
    [filter, tasks],
  );

  return (
    <section className="orchard-card p-4 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-[var(--sage-dark)]">
            任務清單
          </p>
          <h2 className="mt-2 font-serif text-2xl">你的上手路線</h2>
        </div>

        <div
          className="flex flex-wrap gap-1 rounded-xl bg-white/60 p-1"
          role="group"
          aria-label="依狀態篩選任務"
        >
          {filters.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                filter === status
                  ? "bg-[var(--sage-soft)] text-[var(--sage-dark)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--ink)]"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {filteredTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelectTask(task)}
              className="group rounded-[1.25rem] border border-[var(--line)] bg-white/88 p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--sage)] hover:shadow-[var(--shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sage)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge
                    priority={task.priority}
                    priorityReason={task.priorityReason}
                  />
                  {task.blockingStatus.blocked && (
                    <span className="orchard-chip--warning">
                      阻塞中
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-[var(--paper-soft)] px-2.5 py-1 text-xs font-bold text-[var(--muted)]">
                  {task.status}
                </span>
              </div>

              <h3 className="mt-4 font-serif text-xl leading-snug transition-colors group-hover:text-[var(--sage-dark)]">
                {task.title}
              </h3>

              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="text-[var(--muted)]">截止日期</dt>
                  <dd className="mt-1 font-bold">{task.deadline}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">預估工時</dt>
                  <dd className="mt-1 font-bold">{task.estimateHours} 小時</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">負責部門</dt>
                  <dd className="mt-1 font-bold">{task.department}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">來源資料</dt>
                  <dd className="mt-1 truncate font-bold" title={task.sourceDocument}>
                    {task.sourceDocument}
                  </dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      ) : (
        <p className="orchard-empty mt-5 px-4 py-8 text-center text-[var(--muted)]">
          此狀態目前沒有任務
        </p>
      )}

      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => onSelectTask(null)}
        onStatusChange={onStatusChange}
      />
    </section>
  );
}
