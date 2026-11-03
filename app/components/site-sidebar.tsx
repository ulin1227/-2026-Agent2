"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type NavItem = {
  id: string;
  href: string;
  icon: string;
  label: string;
};

export type SiteSection =
  | "existing-data"
  | "project-map"
  | "onboarding-roadmap"
  | "risk-management"
  | "assistant";

export const newcomerNavigation = [
  { id: "existing-data", href: "/onboarding", icon: "▤", label: "現有資料" },
  { id: "project-map", href: "/onboarding/project-map", icon: "⌘", label: "企劃地圖" },
  { id: "onboarding-roadmap", href: "/onboarding/roadmap", icon: "↗", label: "新人上手路線圖" },
  { id: "risk-management", href: "/onboarding/risk-knowledge", icon: "△", label: "風險知識管理" },
] as const satisfies readonly NavItem[];

export const supervisorNavigation = [
  { id: "supervisor-create", href: "/supervisor/create", icon: "＋", label: "建立交接專案" },
  { id: "supervisor-review", href: "/supervisor/review", icon: "✓", label: "審核交接文件" },
  { id: "supervisor-assign", href: "/supervisor/assign", icon: "→", label: "指派接手新人" },
  { id: "supervisor-conversations", href: "/supervisor/conversations", icon: "◎", label: "對話審查" },
  { id: "rag-admin", href: "/rag-admin", icon: "▣", label: "RAG 知識庫管理" },
] as const satisfies readonly NavItem[];

export const handoffNavigation = [
  { id: "handoff-upload", href: "/handoff/upload", icon: "↑", label: "交接資料與經驗訪談" },
] as const satisfies readonly NavItem[];

export const ASSISTANT_HREF = "/onboarding/chat";

export function BrandIcon() {
  return (
    <span
      className="brand-icon-slot"
      aria-hidden="true"
      title="將自訂 ICON 放到 public/brand-icon.png"
    >
      <span className="brand-icon-fallback">IS</span>
    </span>
  );
}

export function SiteSidebar({
  active,
  items = newcomerNavigation,
  homeHref = "/onboarding",
  showAssistant = true,
  collapsed = false,
  onToggle,
  children,
}: {
  active: string;
  items?: readonly NavItem[];
  homeHref?: string;
  showAssistant?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <aside className="sidebar site-nav-sidebar">
      <div className="brand-row">
        <Link className="brand-identity" href={homeHref} aria-label="無痛交接首頁">
          <BrandIcon />
          <span className="brand-copy">
            <strong>無痛交接</strong>
            <small>INSIGHTSHIFT</small>
          </span>
        </Link>
        {onToggle && (
          <button
            className="sidebar-toggle"
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "展開左側欄" : "收合左側欄"}
            aria-expanded={!collapsed}
          >
            <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          </button>
        )}
      </div>

      <nav className="main-nav" aria-label="主要功能">
        {items.map((item) => (
          <Link
            className={active === item.id ? "is-active" : undefined}
            href={item.href}
            key={item.id}
            aria-current={active === item.id ? "page" : undefined}
            title={item.label}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </nav>

      {children}

      <div className="sidebar-chat-wrap">
        {showAssistant && (
          <Link
            className={`sidebar-chat-fab ${active === "assistant" ? "is-active" : ""}`}
            href={ASSISTANT_HREF}
            aria-label="開啟輔助對話"
            title="輔助對話"
          >
            <span aria-hidden="true">✦</span>
          </Link>
        )}
        <Link className="sidebar-switch-role" href="/" title="切換身分">
          <span aria-hidden="true">⇄</span>
          <span className="nav-label">切換身分</span>
        </Link>
      </div>
    </aside>
  );
}

export function PortalShell({
  active,
  items,
  homeHref,
  showAssistant,
  children,
}: {
  active: string;
  items?: readonly NavItem[];
  homeHref?: string;
  showAssistant?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="site-portal-shell">
      <SiteSidebar active={active} items={items} homeHref={homeHref} showAssistant={showAssistant} />
      {children}
    </div>
  );
}
