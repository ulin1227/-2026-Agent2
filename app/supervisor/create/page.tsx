import { LegacyFramePage } from "@/app/components/legacy-frame";
import { supervisorNavigation } from "@/app/components/site-sidebar";

export default function Page() {
  return (
    <LegacyFramePage
      active="supervisor-create"
      items={supervisorNavigation}
      homeHref="/supervisor/create"
      src="/legacy/handoff-project-create-ui.html"
      title="建立交接專案"
    />
  );
}
