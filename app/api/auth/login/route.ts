import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { handoverCaseMembers, sessions, users } from "@/db/schema";
import {
  createSession,
  destinationFor,
  isRole,
  jsonError,
  normalizeEmployeeId,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return jsonError("請提供有效的登入資料。", 400);

  const employeeId = normalizeEmployeeId(payload.employeeId);
  const password = typeof payload.password === "string" ? payload.password : "";
  const role = payload.role;
  const remember = payload.remember === true;
  if (!employeeId || !password || !isRole(role)) {
    return jsonError("請輸入員工編號、密碼並選擇使用身分。", 400);
  }

  const db = getDb();
  const matches = await db
    .select({ id: users.id, employeeId: users.employeeId, passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  const user = matches[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError("員工編號或密碼錯誤。", 401);
  }
  if (user.status !== "active") return jsonError("此帳戶目前無法登入。", 403);

  let caseId: string | null = null;
  if (role !== "newcomer") {
    const memberships = await db
      .select({ caseId: handoverCaseMembers.caseId })
      .from(handoverCaseMembers)
      .where(and(eq(handoverCaseMembers.userId, user.id), eq(handoverCaseMembers.role, role)))
      .limit(1);
    caseId = memberships[0]?.caseId ?? null;
    if (!caseId) return jsonError("此帳號沒有所選身分的使用權限。", 403);
  }

  await db.delete(sessions).where(eq(sessions.userId, user.id));
  const session = await createSession(db, user.id, remember);
  const response = Response.json({
    user: { id: user.id, employeeId: user.employeeId },
    role,
    caseId,
    destination: destinationFor(role, caseId),
  });
  response.headers.set("set-cookie", sessionCookie(session.token, session.maxAge, request));
  return response;
}
