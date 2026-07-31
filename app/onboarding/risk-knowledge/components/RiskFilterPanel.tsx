import type {
  RiskCategory,
  RiskSeverity,
} from "@/lib/onboarding/dataAccess";

interface RiskFilterPanelProps {
  selectedCategories: RiskCategory[];
  selectedSeverities: RiskSeverity[];
  onToggleCategory: (category: RiskCategory) => void;
  onToggleSeverity: (severity: RiskSeverity) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

const categories: RiskCategory[] = ["常見錯誤", "延期原因", "特殊規則"];
const severities: RiskSeverity[] = ["high", "medium", "low"];

const severityStyles: Record<RiskSeverity, string> = {
  high: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]",
  medium:
    "border-[var(--warning)] bg-[var(--warning-soft)] text-[#8d642d]",
  low: "border-[var(--sage)] bg-[var(--sage-soft)] text-[var(--sage-dark)]",
};

export default function RiskFilterPanel({
  selectedCategories,
  selectedSeverities,
  onToggleCategory,
  onToggleSeverity,
  onClear,
  hasActiveFilters,
}: RiskFilterPanelProps) {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
      <fieldset>
        <legend className="text-xs font-bold text-[var(--muted)]">分類</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((category) => {
            const selected = selectedCategories.includes(category);

            return (
              <button
                key={category}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleCategory(category)}
                className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                  selected
                    ? "border-[var(--sage)] bg-[var(--sage)] text-white"
                    : "border-[var(--line)] bg-white/84 text-[var(--muted)] hover:bg-[var(--sage-soft)] hover:text-[var(--sage-dark)]"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-bold text-[var(--muted)]">
          風險程度
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {severities.map((severity) => {
            const selected = selectedSeverities.includes(severity);

            return (
              <button
                key={severity}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleSeverity(severity)}
                className={`rounded-full border px-3 py-2 text-xs font-bold uppercase transition ${
                  selected
                    ? severityStyles[severity]
                    : "border-[var(--line)] bg-white/84 text-[var(--muted)] hover:bg-[var(--paper-soft)]"
                }`}
              >
                {severity}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={onClear}
        disabled={!hasActiveFilters}
        className="h-9 rounded-lg border border-[var(--line)] bg-white/84 px-3 text-xs font-bold text-[var(--muted)] transition hover:bg-[var(--paper-soft)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        清除篩選
      </button>
    </div>
  );
}
