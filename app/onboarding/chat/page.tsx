import { PortalShell } from "@/app/components/site-sidebar";
import ChatPage from "@/frontend/pages/ChatPage";

export default function AssistantChatPage() {
  return (
    <PortalShell active="assistant">
      <ChatPage />
    </PortalShell>
  );
}
