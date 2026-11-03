interface RiskSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function RiskSearchBar({
  value,
  onChange,
}: RiskSearchBarProps) {
  return (
    <label className="block">
      <span className="text-xs font-bold tracking-[0.1em] text-[var(--sage-dark)]">
        搜尋風險知識
      </span>
      <span className="mt-2 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/84 px-4 transition focus-within:border-[var(--sage)] focus-within:ring-2 focus-within:ring-[var(--sage-soft)]">
        <span className="text-lg text-[var(--muted)]" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="搜尋名稱、情境或原因"
          className="h-12 w-full border-0 bg-transparent text-sm outline-none placeholder:text-[var(--orchard-ink-faint)]"
        />
      </span>
    </label>
  );
}
