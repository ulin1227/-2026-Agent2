import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import { getRiskById } from "@/lib/onboarding/serverData";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const { id } = await context.params;
    const risk = await getRiskById(id, caseId);

    if (!risk) {
      return Response.json({ error: "risk not found" }, { status: 404 });
    }

    return Response.json({ risk });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
