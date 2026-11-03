import type {
  RiskKnowledge,
  RiskSeverity,
} from "@/lib/onboarding/dataAccess";

interface RiskCardListProps {
  risks: RiskKnowledge[];
  onSelectRisk: (risk: RiskKnowledge) => void;
}

const severityStyles: Record<RiskSeverity, string> = {
  high: "bg-[var(--danger)] text-white",
  medium: "bg-[var(--warning)] text-white",
  low: "bg-[var(--sage)] text-white",
};

export default function RiskCardList({
  risks,
  onSelectRisk,
}: RiskCardListProps) {
  if (risks.length === 0) {
    return (
      <div className="orchard-empty px-6 py-14 text-center">
        <p className="font-serif text-xl">找不到符合條件的風險項目</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          試著調整搜尋文字或清除部分篩選條件。
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {risks.map((risk) => (
        <button
          key={risk.id}
          type="button"
          onClick={() => onSelectRisk(risk)}
          className="group flex min-h-60 flex-col rounded-[1.25rem] border border-[var(--line)] bg-white/88 p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--sage)] hover:shadow-[var(--shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sage)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="orchard-chip--info">
              {risk.category}
            </span>
            <span
              className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${severityStyles[risk.severity]}`}
            >
              {risk.severity}
            </span>
          </div>

          <h2 className="mt-5 font-serif text-xl leading-snug transition-colors group-hover:text-[var(--sage-dark)]">
            {risk.name}
          </h2>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
            {risk.scenario}
          </p>

          <span className="mt-auto pt-5 text-xs font-bold text-[var(--sage)]">
            查看處理方式 →
          </span>
        </button>
      ))}
    </div>
  );
}
