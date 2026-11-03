import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import { listRisks } from "@/lib/onboarding/serverData";
import type { RiskCategory, RiskSeverity } from "@/lib/onboarding/types";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const keyword = url.searchParams.get("keyword") ?? undefined;
    const category = (url.searchParams.get("category") ?? undefined) as
      | RiskCategory
      | undefined;
    const severity = (url.searchParams.get("severity") ?? undefined) as
      | RiskSeverity
      | undefined;

    const risks = await listRisks(caseId, { keyword, category, severity });
    return Response.json({ risks });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
