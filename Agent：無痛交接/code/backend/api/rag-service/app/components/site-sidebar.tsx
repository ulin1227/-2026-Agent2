"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type SiteSection =
  | "existing-data"
  | "project-map"
  | "onboarding-roadmap"
  | "risk-management"
  | "assistant";

const navigation = [
  { id: "existing-data", href: "/", icon: "▤", label: "現有資料" },
  { id: "project-map", href: "/project-map", icon: "⌘", label: "企劃地圖" },
  { id: "onboarding-roadmap", href: "/onboarding-roadmap", icon: "↗", label: "新人上手路線圖" },
  { id: "risk-management", href: "/risk-management", icon: "△", label: "風險知識管理" },
] as const;

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
  collapsed = false,
  onToggle,
  children,
}: {
  active: SiteSection;
  collapsed?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <aside className="sidebar site-nav-sidebar">
      <div className="brand-row">
        <Link className="brand-identity" href="/" aria-label="無痛交接首頁">
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
        {navigation.map((item) => (
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
        <Link
          className={`sidebar-chat-fab ${active === "assistant" ? "is-active" : ""}`}
          href="/assistant"
          aria-label="開啟輔助對話"
          title="輔助對話"
        >
          <span aria-hidden="true">✦</span>
        </Link>
      </div>
    </aside>
  );
}
