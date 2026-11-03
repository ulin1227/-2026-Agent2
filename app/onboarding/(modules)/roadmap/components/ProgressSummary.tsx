import type { OnboardingTask } from "@/lib/onboarding/dataAccess";

interface ProgressSummaryProps {
  tasks: OnboardingTask[];
}

export default function ProgressSummary({ tasks }: ProgressSummaryProps) {
  const completedCount = tasks.filter(
    (task) => task.status === "已完成",
  ).length;
  const percentage =
    tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  return (
    <section className="orchard-card orchard-card--soft p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-[var(--sage-dark)]">
            交接進度
          </p>
          <h2 className="mt-2 font-serif text-2xl">
            已完成 {completedCount} / {tasks.length} 項任務
          </h2>
        </div>
        <strong className="font-serif text-4xl font-medium text-[var(--sage-dark)]">
          {percentage}%
        </strong>
      </div>

      <div
        className="mt-5 h-2.5 overflow-hidden rounded-full bg-[var(--sage-soft)]"
        role="progressbar"
        aria-label="交接任務完成進度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className="h-full rounded-full bg-[var(--sage)] transition-[width] duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </section>
  );
}
