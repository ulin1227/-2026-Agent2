import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { handoverCaseMembers, handoverCases } from "@/db/schema";
import { destinationFor, jsonError, requireSessionUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await requireSessionUser(request);
  if (!user) return jsonError("請先登入後再連結交接案件。", 401);

  const payload = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{6}$/.test(code)) return jsonError("交接碼須為 6 碼英數字。", 400);

  const db = getDb();
  const cases = await db
    .select({ id: handoverCases.id, title: handoverCases.title, status: handoverCases.status })
    .from(handoverCases)
    .where(eq(handoverCases.handoverCode, code))
    .limit(1);
  const handoverCase = cases[0];
  if (!handoverCase || handoverCase.status === "archived") {
    return jsonError("交接碼無效或已停用。", 404);
  }

  const memberships = await db
    .select({ role: handoverCaseMembers.role })
    .from(handoverCaseMembers)
    .where(
      and(
        eq(handoverCaseMembers.caseId, handoverCase.id),
        eq(handoverCaseMembers.userId, user.id),
      ),
    )
    .limit(1);
  const existing = memberships[0];
  if (existing && existing.role !== "newcomer") {
    return jsonError("你已經以其他身分加入此交接案件。", 409);
  }
  if (!existing) {
    await db.insert(handoverCaseMembers).values({
      caseId: handoverCase.id,
      userId: user.id,
      role: "newcomer",
    });
  }

  return Response.json({
    case: { id: handoverCase.id, title: handoverCase.title },
    role: "newcomer",
    destination: destinationFor("newcomer", handoverCase.id),
  });
}
