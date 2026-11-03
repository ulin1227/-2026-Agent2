"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  fetchRisks,
  type RiskCategory,
  type RiskKnowledge,
  type RiskSeverity,
} from "@/lib/onboarding/dataAccess";

import RiskCardList from "./components/RiskCardList";
import RiskDetailDrawer from "./components/RiskDetailDrawer";
import RiskFilterPanel from "./components/RiskFilterPanel";
import RiskSearchBar from "./components/RiskSearchBar";

function RiskKnowledgeContent() {
  const searchParams = useSearchParams();
  const requestedRiskId = searchParams.get("riskId");
  const [risks, setRisks] = useState<RiskKnowledge[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<RiskCategory[]>(
    [],
  );
  const [selectedSeverities, setSelectedSeverities] = useState<RiskSeverity[]>(
    [],
  );
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [dismissedRiskId, setDismissedRiskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadRisks = async () => {
      try {
        const nextRisks = await fetchRisks();
        setRisks(nextRisks);
      } catch {
        setError("風險資料載入失敗，請重新整理頁面。");
      } finally {
        setLoading(false);
      }
    };

    void loadRisks();
  }, []);

  const filteredRisks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();

    return risks.filter((risk) => {
      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        [risk.name, risk.scenario, risk.cause].some((value) =>
          value.toLocaleLowerCase().includes(normalizedKeyword),
        );
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(risk.category);
      const matchesSeverity =
        selectedSeverities.length === 0 ||
        selectedSeverities.includes(risk.severity);

      return matchesKeyword && matchesCategory && matchesSeverity;
    });
  }, [keyword, risks, selectedCategories, selectedSeverities]);

  const selectedRisk = useMemo(() => {
    const queryRiskId =
      requestedRiskId && requestedRiskId !== dismissedRiskId
        ? requestedRiskId
        : null;
    const activeRiskId = selectedRiskId ?? queryRiskId;

    return risks.find((risk) => risk.id === activeRiskId) ?? null;
  }, [dismissedRiskId, requestedRiskId, risks, selectedRiskId]);

  const toggleCategory = (category: RiskCategory) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const toggleSeverity = (severity: RiskSeverity) => {
    setSelectedSeverities((current) =>
      current.includes(severity)
        ? current.filter((item) => item !== severity)
        : [...current, severity],
    );
  };

  const clearFilters = () => {
    setKeyword("");
    setSelectedCategories([]);
    setSelectedSeverities([]);
  };

  return (
    <main className="orchard-content">
      <header className="orchard-section">
        <span className="orchard-kicker">風險知識管理</span>
        <h1 className="orchard-hero-title">先看見風險，再開始交接。</h1>
        <p className="orchard-hero-copy">
          從過往交接經驗快速找到常見錯誤、延期原因與特殊規則，少走一次冤枉路。
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

      <section className="orchard-card orchard-section p-4 sm:p-6">
        <RiskSearchBar value={keyword} onChange={setKeyword} />
        <RiskFilterPanel
          selectedCategories={selectedCategories}
          selectedSeverities={selectedSeverities}
          onToggleCategory={toggleCategory}
          onToggleSeverity={toggleSeverity}
          onClear={clearFilters}
          hasActiveFilters={
            keyword.length > 0 ||
            selectedCategories.length > 0 ||
            selectedSeverities.length > 0
          }
        />

        <div className="mt-6 border-t border-[var(--line)] pt-6">
          {loading ? (
            <p
              className="orchard-empty px-4 py-12 text-center text-[var(--muted)]"
              aria-live="polite"
            >
              正在整理風險知識…
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-[var(--muted)]" aria-live="polite">
                共找到 <b className="text-[var(--ink)]">{filteredRisks.length}</b>{" "}
                筆風險項目
              </p>
              <RiskCardList
                risks={filteredRisks}
                onSelectRisk={(risk) => {
                  setSelectedRiskId(risk.id);
                  setDismissedRiskId(null);
                }}
              />
            </>
          )}
        </div>
      </section>

      <RiskDetailDrawer
        risk={selectedRisk}
        onClose={() => {
          setSelectedRiskId(null);
          if (requestedRiskId) setDismissedRiskId(requestedRiskId);
        }}
      />
    </main>
  );
}

export default function RiskKnowledgePage() {
  return (
    <Suspense
      fallback={
        <main className="orchard-content">
          <p className="orchard-card px-6 py-20 text-center text-[var(--muted)]">
            正在載入風險知識…
          </p>
        </main>
      }
    >
      <RiskKnowledgeContent />
    </Suspense>
  );
}
