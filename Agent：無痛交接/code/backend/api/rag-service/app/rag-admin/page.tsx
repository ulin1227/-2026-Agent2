import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getRagAdminAccess } from "../../lib/rag/admin-auth";
import { buildRagAdminOverview } from "../../lib/rag/admin-overview";
import { RagAdminClient } from "./rag-admin-client";
import styles from "./rag-admin.module.css";

export const dynamic = "force-dynamic";

export default async function RagAdminPage() {
  const access = await getRagAdminAccess();
  if (access.status === "unauthenticated") {
    await requireChatGPTUser("/rag-admin");
    return null;
  }
  if (access.status === "forbidden") {
    return (
      <main className={styles.denied}>
        <span>403</span>
        <h1>此帳號沒有 RAG 管理權限</h1>
        <p>{access.user.email} 已完成登入，但不在伺服器端管理者名單中。</p>
        <Link href="/">返回工作台</Link>
      </main>
    );
  }
  const initialOverview = await buildRagAdminOverview("project-orbit", {
    email: access.user.email,
    displayName: access.user.displayName,
    localDevelopment: access.localDevelopment,
  });
  return <RagAdminClient initialAdmin={access.user} initialOverview={initialOverview} localDevelopment={access.localDevelopment} />;
}
