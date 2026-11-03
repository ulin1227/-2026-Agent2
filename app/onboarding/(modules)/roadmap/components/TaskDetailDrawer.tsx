"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { getBlockingStatus } from "@/lib/onboarding/dependencyEngine";
import type {
  OnboardingTask,
  Priority,
  TaskStatus,
} from "@/lib/onboarding/dataAccess";

import PriorityBadge from "./PriorityBadge";

export type EnrichedOnboardingTask = OnboardingTask & {
  priority: Priority;
  priorityReason: string;
  priorityScore: number;
  blockingStatus: ReturnType<typeof getBlockingStatus>;
};

interface TaskDetailDrawerProps {
  task: EnrichedOnboardingTask | null;
  onClose: () => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
}

const statuses: TaskStatus[] = ["待處理", "進行中", "已完成"];

export default function TaskDetailDrawer({
  task,
  onClose,
  onStatusChange,
}: TaskDetailDrawerProps) {
  const [savingStatus, setSavingStatus] = useState<TaskStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!task) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, task]);

  if (!task) return null;

  const handleStatusChange = async (status: TaskStatus) => {
    if (status === task.status || savingStatus) return;

    setError("");
    setSavingStatus(status);
    try {
      await onStatusChange(task.id, status);
      onClose();
    } catch {
      setError("狀態更新失敗，請稍後再試。");
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[#24332d]/35 backdrop-blur-[2px]"
        aria-label="關閉任務詳情"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        className="orchard-drawer relative z-10 h-full w-full max-w-xl overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[rgba(255,254,251,0.94)] px-5 py-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
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
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] bg-white text-lg text-[var(--muted)] transition hover:bg-[var(--sage-soft)] hover:text-[var(--sage-dark)]"
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <div className="space-y-7 px-5 py-6 sm:px-7 sm:py-8">
          <section>
            <p className="text-xs font-bold tracking-[0.12em] text-[var(--sage-dark)]">
              任務詳情
            </p>
            <h2
              id="task-detail-title"
              className="mt-2 font-serif text-3xl leading-tight"
            >
              {task.title}
            </h2>
            <p className="mt-4 leading-7 text-[var(--muted)]">
              {task.description}
            </p>
            <p className="mt-3 rounded-xl bg-[var(--sage-soft)] px-4 py-3 text-sm leading-6 text-[var(--sage-dark)]">
              {task.priorityReason}
            </p>
          </section>

          <dl className="orchard-metric-grid">
            {[
              ["截止日期", task.deadline],
              ["預估工時", `${task.estimateHours} 小時`],
              ["負責部門", task.department],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-[var(--muted)]">{label}</dt>
                <dd className="mt-1.5 break-words text-sm font-bold">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-[var(--muted)]">來源資料</dt>
              <dd className="mt-1.5 break-words text-sm font-bold">
                {task.sourceDocument}
              </dd>
              {task.sourceReferences
                ?.filter((reference) => reference.excerpt)
                .map((reference) => (
                  <blockquote
                    key={reference.id}
                    className="mt-2 border-l-2 border-[var(--sage)] pl-2 text-xs font-normal leading-5 text-[var(--muted)]"
                  >
                    {reference.excerpt}
                  </blockquote>
                ))}
            </div>
          </dl>

          {task.blockingStatus.blocked && (
            <section>
              <h3 className="font-serif text-xl">前置條件尚未完成</h3>
              <div className="mt-3 space-y-3">
                {task.blockingStatus.reasons?.map((reason, index) => (
                  <article
                    key={`${reason.taskTitle}-${index}`}
                    className={`rounded-xl border p-4 ${
                      reason.waitingOn
                        ? "border-[var(--warning)] bg-[var(--warning-soft)]"
                        : "border-[var(--line)] bg-white/88"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold leading-6">
                        因為「{reason.taskTitle}」任務尚未完成
                      </p>
                      {reason.waitingOn && (
                        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[var(--warning)]">
                          外部條件
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      狀態：{reason.status}
                      {reason.dept ? `，負責部門：${reason.dept}` : ""}
                      {reason.owner ? `，負責人：${reason.owner}` : ""}
                    </p>
                    {reason.waitingOn && (
                      <p className="mt-3 border-t border-[var(--warning)]/30 pt-3 text-sm font-bold text-[#8d642d]">
                        等待事項：{reason.waitingOn}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-serif text-xl">關聯風險</h3>
            {task.relatedRiskIds && task.relatedRiskIds.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {task.relatedRiskIds.map((riskId) => (
                  <li key={riskId}>
                    <Link
                      href={{
                        pathname: "/onboarding/risk-knowledge",
                        query: { riskId },
                      }}
                      className="block rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-mono text-xs text-[var(--sage-dark)] transition hover:border-[var(--sage)] hover:bg-[var(--sage-soft)]"
                    >
                      {riskId} →
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">無關聯風險</p>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white/84 p-4">
            <h3 className="font-serif text-lg">更新任務狀態</h3>
            <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="任務狀態">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={savingStatus !== null}
                  aria-pressed={task.status === status}
                  onClick={() => void handleStatusChange(status)}
                  className={`rounded-lg border px-2 py-2.5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                    task.status === status
                      ? "border-[var(--sage)] bg-[var(--sage)] text-white"
                      : "border-[var(--line)] bg-white text-[var(--muted)] hover:bg-[var(--sage-soft)]"
                  }`}
                >
                  {savingStatus === status ? "更新中…" : status}
                </button>
              ))}
            </div>
            {error && (
              <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
