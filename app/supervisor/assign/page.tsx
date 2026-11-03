import { LegacyFramePage } from "@/app/components/legacy-frame";
import { supervisorNavigation } from "@/app/components/site-sidebar";

export default function Page() {
  return (
    <LegacyFramePage
      active="supervisor-assign"
      items={supervisorNavigation}
      homeHref="/supervisor/create"
      src="/legacy/newcomer-assignment-ui.html"
      title="指派接手新人"
    />
  );
}
