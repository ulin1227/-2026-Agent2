"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "新人上手路線圖", href: "/onboarding/roadmap" },
  { label: "風險知識管理", href: "/onboarding/risk-knowledge" },
];

export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="orchard-app">
      <div className="orchard-shell">
        <aside className="orchard-sidebar">
          <Link href="/" className="orchard-brand">
            <span className="orchard-brand__mark" aria-hidden="true">
              FL
            </span>
            <span>
              <span className="orchard-brand__name">無痛交接</span>
              <span className="orchard-brand__caption">Newcomer Onboarding</span>
            </span>
          </Link>

          <nav aria-label="新人交接功能">
            <ul className="orchard-nav">
              {tabs.map((tab, index) => {
                const isActive = pathname.startsWith(tab.href);

                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={isActive ? "page" : undefined}
                      className="orchard-nav__item"
                    >
                      <span>
                        <span className="orchard-nav__eyebrow">
                          Module {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="orchard-nav__label">{tab.label}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

        </aside>

        <div className="orchard-main">
          <header className="orchard-topbar">
            <div>
              <span className="orchard-kicker">FlowLink Orchard System</span>
              <h1 className="orchard-hero-title">新人交接導覽</h1>
            </div>
          </header>

          {children}
        </div>
      </div>
    </div>
  );
}
