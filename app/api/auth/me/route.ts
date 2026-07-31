import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { handoverCaseMembers, handoverCases } from "@/db/schema";
import { destinationFor, jsonError, requireSessionUser, type Role } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await requireSessionUser(request);
  if (!user) return jsonError("尚未登入。", 401);

  const memberships = await getDb()
    .select({
      caseId: handoverCaseMembers.caseId,
      caseTitle: handoverCases.title,
      role: handoverCaseMembers.role,
    })
    .from(handoverCaseMembers)
    .innerJoin(handoverCases, eq(handoverCaseMembers.caseId, handoverCases.id))
    .where(eq(handoverCaseMembers.userId, user.id));

  return Response.json({
    user: { id: user.id, employeeId: user.employeeId },
    memberships: memberships.map((membership) => ({
      ...membership,
      destination: destinationFor(membership.role as Role, membership.caseId),
    })),
  });
}
