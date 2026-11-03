import { LegacyFramePage } from "@/app/components/legacy-frame";
import { handoffNavigation } from "@/app/components/site-sidebar";

export default function Page() {
  return (
    <LegacyFramePage
      active="handoff-upload"
      items={handoffNavigation}
      homeHref="/handoff/upload"
      src="/legacy/handoff-upload-ui.html"
      title="交接資料上傳與經驗訪談"
    />
  );
}
