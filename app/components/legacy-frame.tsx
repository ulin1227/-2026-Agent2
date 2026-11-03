import { PortalShell, type NavItem } from "./site-sidebar";

// Embeds a standalone HTML module from public/legacy inside the shared portal navigation.
export function LegacyFramePage({
  active,
  items,
  homeHref,
  src,
  title,
}: {
  active: string;
  items: readonly NavItem[];
  homeHref: string;
  src: string;
  title: string;
}) {
  return (
    <PortalShell active={active} items={items} homeHref={homeHref} showAssistant={false}>
      <main className="legacy-frame-page">
        <iframe className="legacy-frame" src={src} title={title} />
      </main>
    </PortalShell>
  );
}
