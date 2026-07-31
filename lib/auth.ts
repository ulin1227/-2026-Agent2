import { and, eq, gt } from "drizzle-orm";

import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  hashPassword,
  isRole,
  isValidEmployeeId,
  normalizeEmployeeId,
  verifyPassword,
  type Role,
} from "./auth-crypto";

export {
  hashPassword,
  isRole,
  isValidEmployeeId,
  normalizeEmployeeId,
  verifyPassword,
  type Role,
} from "./auth-crypto";

const SESSION_COOKIE = "flowlink_session";
const SHORT_SESSION_SECONDS = 60 * 60 * 24;
const REMEMBERED_SESSION_SECONDS = 60 * 60 * 24 * 30;

type DbClient = ReturnType<typeof getDb>;

export async function createSession(
  db: DbClient,
  userId: string,
  remember: boolean,
): Promise<{ token: string; expiresAt: Date; maxAge: number }> {
  const token = randomToken(32);
  const maxAge = remember ? REMEMBERED_SESSION_SECONDS : SHORT_SESSION_SECONDS;
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  await db.insert(sessions).values({
    id: await digestToken(token),
    userId,
    expiresAt: expiresAt.toISOString(),
  });

  return { token, expiresAt, maxAge };
}

export function sessionCookie(token: string, maxAge: number, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  return sessionCookie("", 0, request);
}

export async function deleteRequestSession(request: Request): Promise<void> {
  const token = readSessionToken(request);
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.id, await digestToken(token)));
}

export async function requireSessionUser(request: Request) {
  const token = readSessionToken(request);
  if (!token) return null;

  const rows = await getDb()
    .select({
      id: users.id,
      employeeId: users.employeeId,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, await digestToken(token)),
        gt(sessions.expiresAt, new Date().toISOString()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export function destinationFor(role: Role, caseId?: string | null) {
  const encodedCaseId = caseId ? encodeURIComponent(caseId) : null;
  switch (role) {
    case "newcomer":
      return {
        label: "新人上手路線圖",
        path: encodedCaseId ? `/onboarding/roadmap?caseId=${encodedCaseId}` : null,
      };
    case "supervisor":
      return { label: "交接管理總覽", path: null };
    case "colleague":
      return { label: "資料上傳專區", path: null };
    default:
      return { label: "離職同事引導", path: null };
  }
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}

async function digestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

function randomToken(size: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
