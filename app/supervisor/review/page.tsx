import { LegacyFramePage } from "@/app/components/legacy-frame";
import { supervisorNavigation } from "@/app/components/site-sidebar";

export default function Page() {
  return (
    <LegacyFramePage
      active="supervisor-review"
      items={supervisorNavigation}
      homeHref="/supervisor/create"
      src="/legacy/supervisor-review-ui.html"
      title="主管審核交接文件"
    />
  );
}
