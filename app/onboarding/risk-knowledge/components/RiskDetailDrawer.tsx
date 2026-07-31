"use client";

import { useEffect, useState } from "react";

import {
  fetchTasks,
  type RiskKnowledge,
  type RiskSeverity,
} from "@/lib/onboarding/dataAccess";

interface RiskDetailDrawerProps {
  risk: RiskKnowledge | null;
  onClose: () => void;
}

const severityStyles: Record<RiskSeverity, string> = {
  high: "bg-[var(--danger-soft)] text-[var(--danger)]",
  medium: "bg-[var(--warning-soft)] text-[#8d642d]",
  low: "bg-[var(--sage-soft)] text-[var(--sage-dark)]",
};

export default function RiskDetailDrawer({
  risk,
  onClose,
}: RiskDetailDrawerProps) {
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");

  useEffect(() => {
    if (!risk) return;

    let cancelled = false;
    const loadTaskTitles = async () => {
      setTasksLoading(true);
      setTasksError("");
      try {
        const tasks = await fetchTasks();
        if (!cancelled) {
          setTaskTitles(
            Object.fromEntries(tasks.map((task) => [task.id, task.title])),
          );
        }
      } catch {
        if (!cancelled) {
          setTasksError("相關任務暫時無法載入。");
        }
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    };

    void loadTaskTitles();
    return () => {
      cancelled = true;
    };
  }, [risk]);

  useEffect(() => {
    if (!risk) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, risk]);

  if (!risk) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[#24332d]/35 backdrop-blur-[2px]"
        aria-label="關閉風險詳情"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-detail-title"
        className="orchard-drawer relative z-10 h-full w-full max-w-2xl overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[rgba(255,254,251,0.94)] px-5 py-4 backdrop-blur-xl sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="orchard-chip--info">
              {risk.category}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${severityStyles[risk.severity]}`}
            >
              {risk.severity}
            </span>
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
              風險詳情
            </p>
            <h2
              id="risk-detail-title"
              className="mt-2 font-serif text-3xl leading-tight"
            >
              {risk.name}
            </h2>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white/88 p-5">
            <h3 className="font-serif text-xl">發生情境</h3>
            <p className="mt-3 leading-7 text-[var(--muted)]">{risk.scenario}</p>
          </section>

          <section className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5">
            <h3 className="font-serif text-xl text-[var(--danger)]">主要原因</h3>
            <p className="mt-3 leading-7 text-[#744c47]">{risk.cause}</p>
          </section>

          <section className="rounded-2xl border border-[var(--sage)]/30 bg-[var(--sage-soft)] p-5">
            <h3 className="font-serif text-xl text-[var(--sage-dark)]">
              建議處理方式
            </h3>
            <p className="mt-3 leading-7 text-[var(--sage-dark)]">
              {risk.resolution}
            </p>
          </section>

          <section>
            <h3 className="font-serif text-xl">關聯任務</h3>
            {tasksLoading ? (
              <p className="mt-3 text-sm text-[var(--muted)]">正在載入任務…</p>
            ) : tasksError ? (
              <p className="mt-3 text-sm text-[var(--danger)]">{tasksError}</p>
            ) : risk.relatedTaskIds.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {risk.relatedTaskIds.map((taskId) => (
                  <li key={taskId} className="rounded-xl border border-[var(--line)] bg-white/88 px-4 py-3">
                    <b className="block text-sm">
                      {taskTitles[taskId] ?? "找不到對應任務"}
                    </b>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--muted)]">
                      {taskId}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">無關聯任務</p>
            )}
          </section>

          <section className="border-t border-[var(--line)] pt-5">
            <span className="text-xs text-[var(--muted)]">來源資料</span>
            <p className="mt-1.5 break-words text-sm font-bold">
              {risk.sourceDocument}
            </p>
            {risk.sourceReferences
              ?.filter((reference) => reference.excerpt)
              .map((reference) => (
                <blockquote
                  key={reference.id}
                  className="mt-3 border-l-2 border-[var(--sage)] pl-3 text-sm leading-6 text-[var(--muted)]"
                >
                  {reference.excerpt}
                </blockquote>
              ))}
          </section>
        </div>
      </aside>
    </div>
  );
}
