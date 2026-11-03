import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import { listEnrichedTasks } from "@/lib/onboarding/serverData";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const tasks = await listEnrichedTasks(caseId);
    return Response.json({ tasks });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
