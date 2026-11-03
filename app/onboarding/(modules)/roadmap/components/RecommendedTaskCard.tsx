import PriorityBadge from "./PriorityBadge";
import type { EnrichedOnboardingTask } from "./TaskDetailDrawer";

interface RecommendedTaskCardProps {
  tasks: EnrichedOnboardingTask[];
  onSelectTask: (task: EnrichedOnboardingTask) => void;
}

export default function RecommendedTaskCard({
  tasks,
  onSelectTask,
}: RecommendedTaskCardProps) {
  const recommendedTask = tasks
    .filter((task) => !task.blockingStatus.blocked)
    .reduce<EnrichedOnboardingTask | null>(
      (best, task) =>
        !best || task.priorityScore > best.priorityScore ? task : best,
      null,
    );

  return (
    <section className="orchard-card orchard-card--accent relative overflow-hidden p-6 sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border border-[var(--sage)]/15 shadow-[0_0_0_28px_rgba(136,168,50,0.08),0_0_0_56px_rgba(136,168,50,0.05)]" />
      <div className="relative">
        <p className="text-xs font-bold tracking-[0.12em] text-[var(--sage-dark)]">
          目前最建議處理
        </p>

        {recommendedTask ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-serif text-2xl leading-tight sm:text-3xl">
                {recommendedTask.title}
              </h2>
              <PriorityBadge
                priority={recommendedTask.priority}
                priorityReason={recommendedTask.priorityReason}
              />
            </div>
            <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
              {recommendedTask.priorityReason}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                <b className="text-[var(--muted)]">截止日期：</b>
                {recommendedTask.deadline}
              </span>
              <span>
                <b className="text-[var(--muted)]">負責部門：</b>
                {recommendedTask.department}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectTask(recommendedTask)}
              className="orchard-button mt-6"
            >
              查看任務詳情
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-[var(--warning-soft)] px-4 py-4 font-bold text-[#8d642d]">
            目前所有任務皆有前置條件尚未完成
          </p>
        )}
      </div>
    </section>
  );
}
