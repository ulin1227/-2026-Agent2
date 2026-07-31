import type { Priority } from "@/lib/onboarding/dataAccess";

interface PriorityBadgeProps {
  priority: Priority;
  priorityReason: string;
}

const priorityStyles: Record<Priority, string> = {
  P0: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]",
  P1: "border-[var(--warning)] bg-[var(--warning-soft)] text-[#8d642d]",
  P2: "border-[var(--sage)] bg-[var(--sage-soft)] text-[var(--sage-dark)]",
  P3: "border-[var(--line)] bg-[var(--paper-soft)] text-[var(--muted)]",
};

const priorityLabels: Record<Priority, string> = {
  P0: "高優先",
  P1: "中優先",
  P2: "低優先",
  P3: "最低優先",
};

export default function PriorityBadge({
  priority,
  priorityReason,
}: PriorityBadgeProps) {
  const label = priorityLabels[priority];

  return (
    <span
      title={priorityReason}
      aria-label={`${label}（${priority}）：${priorityReason}`}
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 font-serif text-xs font-bold ${priorityStyles[priority]}`}
    >
      {label}
    </span>
  );
}
