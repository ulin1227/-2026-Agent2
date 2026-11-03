"use client";

import { usePathname } from "next/navigation";

import { PortalShell } from "@/app/components/site-sidebar";

const sections = [
  { prefix: "/onboarding/roadmap", id: "onboarding-roadmap" },
  { prefix: "/onboarding/risk-knowledge", id: "risk-management" },
];

export default function OnboardingModulesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const section = sections.find((item) => pathname.startsWith(item.prefix)) ?? sections[0];

  return (
    <div className="orchard-app">
      <PortalShell active={section.id}>
        <div className="orchard-main">
          <header className="orchard-topbar">
            <div>
              <span className="orchard-kicker">FlowLink Orchard System</span>
              <h1 className="orchard-hero-title">新人交接導覽</h1>
            </div>
          </header>

          {children}
        </div>
      </PortalShell>
    </div>
  );
}
