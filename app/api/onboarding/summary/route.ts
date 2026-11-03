import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import { getSummary } from "@/lib/onboarding/serverData";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const summary = await getSummary(caseId);
    return Response.json({ summary });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
