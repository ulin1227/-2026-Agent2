import { getChatGPTUser, type ChatGPTUser } from "../../app/chatgpt-auth";

export type RagAdminAccess =
  | { status: "authorized"; user: ChatGPTUser; localDevelopment: boolean }
  | { status: "unauthenticated"; user: null; localDevelopment: false }
  | { status: "forbidden"; user: ChatGPTUser; localDevelopment: false };

function adminEmails(): Set<string> {
  return new Set(
    (process.env.RAG_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
}

/**
 * Production authorization uses the Sites-authenticated email plus an explicit
 * server-side allowlist. Local development receives a clearly labelled local
 * identity because the Sites dispatcher is not present on localhost.
 */
export async function getRagAdminAccess(): Promise<RagAdminAccess> {
  if (process.env.NODE_ENV !== "production") {
    const email = process.env.RAG_ADMIN_DEV_EMAIL?.trim() || "local-rag-admin@localhost";
    return {
      status: "authorized",
      localDevelopment: true,
      user: { email, fullName: "Local RAG Admin", displayName: "Local RAG Admin" },
    };
  }

  const user = await getChatGPTUser();
  if (!user) return { status: "unauthenticated", user: null, localDevelopment: false };
  if (!adminEmails().has(user.email.toLocaleLowerCase())) {
    return { status: "forbidden", user, localDevelopment: false };
  }
  return { status: "authorized", user, localDevelopment: false };
}
