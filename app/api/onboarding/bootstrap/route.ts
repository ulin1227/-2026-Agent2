import { getDb } from "@/db";
import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import { ensureDemoCaseSeeded } from "@/lib/onboarding/seed";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      caseId?: string;
    };
    const caseId = payload.caseId?.trim() || DEFAULT_CASE_ID;
    const db = getDb();
    const result = await ensureDemoCaseSeeded(db, caseId);
    return Response.json({ caseId, ...result }, { status: result.seeded ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
