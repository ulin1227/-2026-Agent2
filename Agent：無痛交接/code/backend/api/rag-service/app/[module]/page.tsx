import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteSidebar, type SiteSection } from "../components/site-sidebar";

const placeholders = {
  "onboarding-roadmap": {
    number: "02",
    eyebrow: "ONBOARDING ROADMAP",
    title: "新人上手路線圖",
    description: "這裡將承接閱讀順序、關係人認識與實作任務，讓新人知道下一步該做什麼。",
  },
  "risk-management": {
    number: "03",
    eyebrow: "RISK KNOWLEDGE MANAGEMENT",
    title: "風險知識管理",
    description: "這裡將集中呈現歷史風險、待確認事項、來源與建議處理順序。",
  },
  assistant: {
    number: "04",
    eyebrow: "ASSISTED CONVERSATION",
    title: "輔助對話",
    description: "這裡將串接對話 Agent，協助新人從交接資料中找到答案與原始來源。",
  },
} as const;

type PlaceholderKey = keyof typeof placeholders;

export default async function PlaceholderPage({ params }: { params: Promise<{ module: string }> }) {
  const { module: moduleKey } = await params;
  if (moduleKey === "assistant") redirect("/chat");
  if (!(moduleKey in placeholders)) notFound();
  const item = placeholders[moduleKey as PlaceholderKey];
  const active = moduleKey as SiteSection;

  return (
    <div className="site-portal-shell">
      <SiteSidebar active={active} />
      <main className="placeholder-page">
        <div className="placeholder-context"><span className="eyebrow">INSIGHTSHIFT</span><strong>{item.title}</strong></div>
        <section className="placeholder-card">
          <div className="placeholder-node" aria-hidden="true"><span>{item.number}</span></div>
          <span className="eyebrow">{item.eyebrow}</span>
          <h1>{item.title}</h1>
          <p>{item.description}</p>
          <div className="reserved-note"><span aria-hidden="true">✓</span><div><strong>模組接口已預留</strong><small>功能完成後可直接接入這個獨立路徑，不會影響目前的企劃地圖。</small></div></div>
          <Link className="placeholder-back" href="/"><span aria-hidden="true">←</span> 回到現有資料</Link>
        </section>
      </main>
    </div>
  );
}
