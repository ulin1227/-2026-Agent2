import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { handoverCaseMembers, handoverCases, users } from "@/db/schema";
import {
  createSession,
  destinationFor,
  hashPassword,
  isRole,
  isValidEmployeeId,
  jsonError,
  normalizeEmployeeId,
  sessionCookie,
} from "@/lib/auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return jsonError("請提供有效的註冊資料。", 400);

  const employeeId = normalizeEmployeeId(payload.employeeId);
  const password = typeof payload.password === "string" ? payload.password : "";
  const role = payload.role;
  if (!isValidEmployeeId(employeeId)) {
    return jsonError("員工編號須為 3 至 32 碼英數字，可包含 - 或 _。", 400);
  }
  if (password.length < 6 || password.length > 128) {
    return jsonError("密碼長度須為 6 至 128 個字元。", 400);
  }
  if (!isRole(role)) return jsonError("請選擇有效的使用身分。", 400);

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  if (existing.length > 0) return jsonError("此員工編號已註冊。", 409);

  const userId = crypto.randomUUID();
  let caseId: string | null = null;
  try {
    await db.insert(users).values({
      id: userId,
      employeeId,
      passwordHash: await hashPassword(password),
    });

    if (role !== "newcomer") {
      caseId = `case-${crypto.randomUUID()}`;
      await db.insert(handoverCases).values({
        id: caseId,
        title: `${employeeId} 的交接案件`,
        handoverCode: createHandoverCode(),
        status: "draft",
      });
      await db.insert(handoverCaseMembers).values({ caseId, userId, role });
    }

    const session = await createSession(db, userId, false);
    const response = Response.json(
      {
        user: { id: userId, employeeId },
        role,
        caseId,
        destination: destinationFor(role, caseId),
      },
      { status: 201 },
    );
    response.headers.set("set-cookie", sessionCookie(session.token, session.maxAge, request));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique|constraint/i.test(message)) return jsonError("此員工編號已註冊。", 409);
    return jsonError("目前無法建立帳戶，請稍後再試。", 500);
  }
}

function createHandoverCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
